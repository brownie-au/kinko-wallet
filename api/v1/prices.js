// api/v1/prices.js
// Batched price endpoint with per-address Redis (Upstash) caching and single-flight locking.
// Route: GET /api/v1/prices?chain=eth&addresses=0xabc,0xdef,...

const crypto = require('crypto');

// Config
const CACHE_TTL_SECONDS = 60; // Primary TTL for price keys
const LOCK_TTL_MS = 10000; // Lock lifetime to coalesce in-flight fetches
const DEX_CHUNK = 30; // DexScreener safe chunk size
const LLAMA_CHUNK = 100; // Llama chunk size to keep URLs sane
const UPSTREAM_TIMEOUT_MS = 2500; // Per upstream request timeout

// In-process single-flight map (best-effort within instance)
const inFlight = new Map(); // key -> Promise

// Simple sleep utility
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Hash helper for lock keys
function sha1(str) {
  return crypto.createHash('sha1').update(str).digest('hex');
}

// Chain mapping for Llama
function llamaPrefix(chain) {
  switch ((chain || '').toLowerCase()) {
    case 'eth':
    case 'ethereum':
      return 'ethereum';
    case 'bsc':
    case 'binance':
      return 'bsc';
    case 'base':
      return 'base';
    default:
      return null; // pulse and others unsupported by Llama here
  }
}

function isDexChain(chain) {
  const c = (chain || '').toLowerCase();
  return c === 'eth' || c === 'ethereum' || c === 'pulse' || c === 'pulsechain';
}

// Validate hex address 0x + 40 hex chars
function isAddress(addr) {
  return typeof addr === 'string' && /^0x[a-fA-F0-9]{40}$/.test(addr);
}

// Upstash helpers via REST API
function requireUpstashEnv() {
  const URL = process.env.KV_REST_API_URL;
  const TOKEN = process.env.KV_REST_API_TOKEN;
  if (!URL || !TOKEN) throw new Error('Missing Upstash env vars (KV_REST_API_URL, KV_REST_API_TOKEN)');
  return { URL, TOKEN };
}

async function kvPipeline(commands) {
  const { URL, TOKEN } = requireUpstashEnv();
  const r = await fetch(`${URL}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(commands)
  });
  if (!r.ok) throw new Error(`Upstash pipeline error: ${r.status}`);
  return r.json(); // array of { result, error? }
}

async function kvMGet(keys) {
  if (!keys || keys.length === 0) return [];
  // Use single MGET command to minimize overhead
  const resp = await kvPipeline([["MGET", ...keys]]);
  const arr = Array.isArray(resp) && resp[0] ? resp[0].result : null;
  return Array.isArray(arr) ? arr : keys.map(() => null);
}

async function kvSetExMany(pairs, ttlSeconds) {
  if (!pairs || pairs.length === 0) return;
  const cmds = pairs.map(([k, v]) => ["SET", k, v, "EX", String(ttlSeconds)]);
  await kvPipeline(cmds);
}

async function kvAcquireLock(key, ttlMs) {
  const resp = await kvPipeline([["SET", key, Date.now().toString(), "NX", "PX", String(ttlMs)]]);
  const r = resp && resp[0] ? resp[0].result : null;
  return r === 'OK';
}

async function kvReleaseLock(key) {
  try { await kvPipeline([["DEL", key]]); } catch (_) { /* ignore */ }
}

// Fetch with timeout
async function fetchWithTimeout(url, opts = {}, timeoutMs = UPSTREAM_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...opts, signal: controller.signal });
    return r;
  } finally {
    clearTimeout(id);
  }
}

// Upstream: DexScreener for ETH/Pulse
async function fetchDexScreenerBatch(addresses) {
  if (!addresses.length) return {};
  const url = `https://api.dexscreener.com/latest/dex/tokens/${addresses.join(',')}`;
  const r = await fetchWithTimeout(url);
  if (!r.ok) throw new Error(`DexScreener ${r.status}`);
  const j = await r.json();
  // j.pairs is an array; choose highest liquidity.usd per baseToken.address
  const out = {};
  const pairs = Array.isArray(j?.pairs) ? j.pairs : [];
  for (const p of pairs) {
    const base = p?.baseToken?.address;
    const price = Number(p?.priceUsd);
    const liq = Number(p?.liquidity?.usd || 0);
    if (!base || !isAddress(base) || !(price > 0) || !(liq > 0)) continue;
    const key = base.toLowerCase();
    const prev = out[key];
    if (!prev || liq > prev._liq) out[key] = { price, _liq: liq };
  }
  // Strip helper fields
  const clean = {};
  for (const [k, v] of Object.entries(out)) clean[k] = v.price;
  return clean;
}

// Upstream: DefiLlama for Base/BSC
async function fetchLlamaBatch(chainPrefix, addresses) {
  if (!addresses.length) return {};
  const keys = addresses.map((a) => `${chainPrefix}:${a}`);
  const url = `https://coins.llama.fi/prices/current/${keys.join(',')}`;
  const r = await fetchWithTimeout(url);
  if (!r.ok) throw new Error(`Llama ${r.status}`);
  const j = await r.json();
  const out = {};
  const coins = j?.coins || {};
  for (const k of Object.keys(coins)) {
    const price = Number(coins[k]?.price);
    const addr = k.split(':')[1]?.toLowerCase();
    if (isAddress(addr) && price > 0) out[addr] = price;
  }
  return out;
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function buildKey(chain, addr) {
  return `kw:price:v2:${(chain || '').toLowerCase()}:${addr}`;
}

module.exports = async (req, res) => {
  const started = Date.now();
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

    // Env check early
    try { requireUpstashEnv(); } catch (e) {
      return res.status(500).json({ error: e.message });
    }

    const chainRaw = (req.query.chain || '').toString();
    const chain = chainRaw.toLowerCase();
    const addressesRaw = (req.query.addresses || '').toString();
    const addresses = addressesRaw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => isAddress(s));

    // Guardrails
    if (!chain) return res.status(400).json({ error: 'missing chain' });
    if (!addresses.length) return res.status(400).json({ error: 'missing addresses' });
    const MAX_ADDRESSES = 300;
    if (addresses.length > MAX_ADDRESSES) return res.status(400).json({ error: `too many addresses (max ${MAX_ADDRESSES})` });

    // Dedupe
    const addrs = Array.from(new Set(addresses));

    // Try cache (per-address)
    const keys = addrs.map((a) => buildKey(chain, a));
    const cachedVals = await kvMGet(keys);
    const prices = {};
    const misses = [];
    let cacheHits = 0;
    for (let i = 0; i < addrs.length; i++) {
      const raw = cachedVals[i];
      if (typeof raw === 'string') {
        try {
          const obj = JSON.parse(raw);
          if (obj && typeof obj.p === 'number' && obj.p > 0) {
            prices[addrs[i]] = obj.p;
            cacheHits++;
            continue;
          }
        } catch (_) { /* ignore parse errors */ }
      }
      misses.push(addrs[i]);
    }

    let upstreamUsed = new Set();

    if (misses.length) {
      // Single-flight key for this request misses set (in-process)
      const reqKey = `prices:${chain}:${sha1(misses.join(','))}`;
      if (inFlight.has(reqKey)) {
        await inFlight.get(reqKey);
      } else {
        const work = (async () => {
          // Group chunking by upstream
          const llamaChain = llamaPrefix(chain);
          const useDex = isDexChain(chain);
          const missSet = new Set(misses);

          // Fetch via DexScreener if eligible
          if (useDex) {
            const dexChunks = chunk(Array.from(missSet), DEX_CHUNK);
            for (const ch of dexChunks) {
              const lockKey = `kw:price:lock:v1:${chain}:${sha1(ch.join(','))}`;
              const gotLock = await kvAcquireLock(lockKey, LOCK_TTL_MS);
              if (gotLock) {
                try {
                  const map = await fetchDexScreenerBatch(ch);
                  upstreamUsed.add('dexscreener');
                  // Persist results
                  const pairs = Object.entries(map).map(([addr, price]) => [
                    buildKey(chain, addr),
                    JSON.stringify({ p: price, t: Date.now(), s: 'dexscreener' })
                  ]);
                  if (pairs.length) await kvSetExMany(pairs, CACHE_TTL_SECONDS);
                } catch (_) {
                  // On failure, just release lock; misses remain
                } finally {
                  await kvReleaseLock(lockKey);
                }
              } else {
                // Wait for peer to populate cache
                const waitKeys = ch.map((a) => buildKey(chain, a));
                const deadline = Date.now() + 3000; // wait up to 3s
                while (Date.now() < deadline) {
                  const vals = await kvMGet(waitKeys);
                  let filled = 0;
                  for (const v of vals) if (typeof v === 'string') filled++;
                  if (filled === waitKeys.length) break;
                  await sleep(200);
                }
              }
            }
          }

          // Fetch via Llama if eligible
          if (llamaChain) {
            const llamaAddrs = Array.from(missSet);
            const llamaChunks = chunk(llamaAddrs, LLAMA_CHUNK);
            for (const ch of llamaChunks) {
              const lockKey = `kw:price:lock:v1:${chain}:${sha1(ch.join(','))}`;
              const gotLock = await kvAcquireLock(lockKey, LOCK_TTL_MS);
              if (gotLock) {
                try {
                  const map = await fetchLlamaBatch(llamaChain, ch);
                  upstreamUsed.add('llama');
                  const pairs = Object.entries(map).map(([addr, price]) => [
                    buildKey(chain, addr),
                    JSON.stringify({ p: price, t: Date.now(), s: 'llama' })
                  ]);
                  if (pairs.length) await kvSetExMany(pairs, CACHE_TTL_SECONDS);
                } catch (_) {
                  // ignore; lock will be released
                } finally {
                  await kvReleaseLock(lockKey);
                }
              } else {
                // Wait for peer to populate cache
                const waitKeys = ch.map((a) => buildKey(chain, a));
                const deadline = Date.now() + 3000;
                while (Date.now() < deadline) {
                  const vals = await kvMGet(waitKeys);
                  let filled = 0;
                  for (const v of vals) if (typeof v === 'string') filled++;
                  if (filled === waitKeys.length) break;
                  await sleep(200);
                }
              }
            }
          }
        })();
        inFlight.set(reqKey, work);
        try { await work; } finally { inFlight.delete(reqKey); }
      }

      // Re-read cache for misses
      const missKeys = misses.map((a) => buildKey(chain, a));
      const missVals = await kvMGet(missKeys);
      for (let i = 0; i < misses.length; i++) {
        const raw = missVals[i];
        if (typeof raw === 'string') {
          try {
            const obj = JSON.parse(raw);
            if (obj && typeof obj.p === 'number' && obj.p > 0) {
              prices[misses[i]] = obj.p;
            }
          } catch (_) {}
        }
      }
    }

    // Final response assembly
    const out = {
      chain,
      ttlMs: CACHE_TTL_SECONDS * 1000,
      asOf: Date.now(),
      source: upstreamUsed.size > 1 ? 'mixed' : (upstreamUsed.values().next().value || (cacheHits ? 'cache' : 'unknown')),
      prices
    };

    // Headers
    const allHit = cacheHits === addrs.length;
    res.setHeader('x-kw-price-cache', allHit ? 'hit' : (cacheHits ? 'partial' : 'miss'));
    res.setHeader('x-kw-upstream', upstreamUsed.size ? Array.from(upstreamUsed).join(',') : 'none');
    res.setHeader('cache-control', 'no-store');

    return res.status(200).json(out);
  } catch (e) {
    console.error('[/api/v1/prices] error', e);
    return res.status(500).json({ error: e?.message || 'server_error' });
  } finally {
    const took = Date.now() - started;
    // Light logging of latency
    if (took > 1000) {
      console.log(`[/api/v1/prices] took=${took}ms`);
    }
  }
};

