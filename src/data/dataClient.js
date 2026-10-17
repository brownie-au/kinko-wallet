// src/data/dataClient.js
/* Centralized data client with SWR cache (IndexedDB), TTL, dedupe, backoff,
 * cross-tab coordination via BroadcastChannel, and abortable in-flight jobs.
 *
 * Cache record shape:
 *   { key, version, fetchedAt, ttlMs, payload, updatedAt }
 * Keys used:
 *   balances:{chain}:{address}
 *   prices:{chain}
 *   txs:{chain}:{address}:{type}
 *   meta:lastUpdated:{resourceKey}
 */

import { idbGet, idbSet } from './idb';

const TEN_MIN = 10 * 60 * 1000;
const DEBUG_CACHE =
  String(import.meta?.env?.VITE_DEBUG_CACHE || '').toLowerCase() === 'true' ||
  (typeof localStorage !== 'undefined' && localStorage.getItem('DEBUG_CACHE') === 'true');
const dlog = (...a) => {
  if (DEBUG_CACHE) console.log('%c[CACHE]', 'color:#6cf', ...a);
};

const inflight = new Map(); // key -> { promise, controller, startedAt }

// Broadcast for cross-tab dedupe and update events
let bc;
try {
  bc = new BroadcastChannel('kinko-data');
} catch {
  bc = null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function jitter(base, pct = 0.2) {
  const j = base * pct;
  return base + (Math.random() * 2 - 1) * j;
}

function backoffDelays(retries, base = 600) {
  const arr = [];
  for (let i = 0; i < retries; i++) arr.push(jitter(base * 2 ** i, 0.35));
  return arr;
}

async function withBackoff(fn, { signal, retries = 3 } = {}) {
  const delays = backoffDelays(retries);
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
    }
    if (i < delays.length) await sleep(delays[i]);
  }
  throw lastErr;
}

function isFresh(rec, ttlMs) {
  if (!rec) return false;
  const at = Number(rec.fetchedAt || 0);
  const ttl = Number(rec.ttlMs || ttlMs || TEN_MIN);
  return Date.now() - at < ttl;
}

async function readCached(key, { ttlMs = TEN_MIN } = {}) {
  const rec = await idbGet(key);
  if (!rec) return { payload: null, stale: true, meta: null };
  const fresh = isFresh(rec, ttlMs);
  if (fresh) dlog('HIT', key, { ageMs: Date.now() - rec.fetchedAt });
  else dlog('STALE', key, { ageMs: Date.now() - rec.fetchedAt });
  return { payload: rec.payload, stale: !fresh, meta: rec };
}

async function writeCached(key, { payload, version = 1, ttlMs = TEN_MIN }) {
  await idbSet(key, { version, fetchedAt: Date.now(), ttlMs, payload });
  try {
    bc?.postMessage({ type: 'updated', key, at: Date.now() });
  } catch {}
  try {
    await idbSet(`meta:lastUpdated:${key}`, { payload: Date.now(), version, fetchedAt: Date.now(), ttlMs: TEN_MIN });
  } catch {}
}

async function fetchAndCache(key, fetcher, { ttlMs = TEN_MIN, version = 1, force = false } = {}) {
  // Reserve the in-flight job before the first await so concurrent callers share it.
  if (inflight.has(key)) return inflight.get(key).promise;
  const controller = new AbortController();
  const run = async () => {
    const rec = await idbGet(key);
    if (!force && isFresh(rec, ttlMs) && rec.version === version) return rec.payload;
    const payload = await withBackoff(() => fetcher({ signal: controller.signal }), { signal: controller.signal });
    await writeCached(key, { payload, version, ttlMs });
    return payload;
  };
  const promise = Promise.resolve()
    .then(() => {
      // Browser locks serialize matching resources across tabs; the lock holder rechecks TTL.
      if (typeof navigator !== 'undefined' && navigator.locks?.request) return navigator.locks.request(`kinko:${key}`, run);
      return run();
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, { promise, controller, startedAt: Date.now() });
  return promise;
}

// -------------- High-level API --------------

const toFiniteNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
// Chain helpers: normalize to canonical chain id in our keys
function normChain(c) {
  const s = String(c || '').toLowerCase();
  if (s.startsWith('eth')) return 'eth';
  if (s.startsWith('pulse') || s === 'pls') return 'pulse';
  if (s.startsWith('bsc') || s.includes('binance')) return 'bsc';
  if (s.startsWith('polygon') || s === 'matic' || s === 'pol') return 'polygon';
  if (s.startsWith('base')) return 'base';
  return 'eth';
}

// Network fetchers (reuse existing service APIs — no new external APIs)
import { getBaseUsdPriceLlama, getBscUsdPriceLlama, getPolygonUsdPriceLlama, getEthUsdPriceLlama } from '../services/priceService';

async function fetchBalancesLive(chain, address, force = false) {
  const { getChainHoldings } = await import('../services/chainHoldingsService.js');
  const result = await getChainHoldings(normChain(chain), address, { force });
  // Never overwrite an existing complete cache entry with a failed partial refresh.
  if (result.issues.length && !result.rows.length) throw new Error('Balance refresh unavailable');
  return result.rows;
}

async function fetchPriceLive(chain) {
  const c = normChain(chain);
  if (c === 'pulse') {
    const { getPLSPriceUSD } = await import('../services/pulsechainService');
    const price = await getPLSPriceUSD();
    return { usd: Number(price) || 0, change24hPct: null };
  }
  if (c === 'eth') {
    const meta = await getEthUsdPriceLlama();
    return { usd: toFiniteNumber(meta?.price) || 0, change24hPct: toFiniteNumber(meta?.change24hPct) };
  }
  if (c === 'base') {
    const meta = await getBaseUsdPriceLlama();
    return { usd: toFiniteNumber(meta?.price) || 0, change24hPct: toFiniteNumber(meta?.change24hPct) };
  }
  if (c === 'polygon') {
    const meta = await getPolygonUsdPriceLlama();
    return { usd: toFiniteNumber(meta?.price) || 0, change24hPct: toFiniteNumber(meta?.change24hPct) };
  }
  if (c === 'bsc') {
    const meta = await getBscUsdPriceLlama();
    return { usd: toFiniteNumber(meta?.price) || 0, change24hPct: toFiniteNumber(meta?.change24hPct) };
  }
  return { usd: 0, change24hPct: null };
}

function getExplorerKey(chain) {
  const c = normChain(chain);
  try {
    const fromLS = localStorage.getItem(`kw:explorerKey:${c}`);
    if (fromLS) return fromLS;
  } catch {}
  const map = {
    eth: import.meta.env.VITE_ETHERSCAN_KEY,
    bsc: import.meta.env.VITE_BSCSCAN_KEY,
    polygon: import.meta.env.VITE_POLYGONSCAN_KEY,
    base: import.meta.env.VITE_BASESCAN_KEY,
    pulse: import.meta.env.VITE_PULSESCAN_KEY
  };
  return map[c] || '';
}

function explorerBase(chain) {
  const c = normChain(chain);
  switch (c) {
    case 'eth':
      return 'https://etherscan.io';
    case 'bsc':
      return 'https://bscscan.com';
    case 'polygon':
      return 'https://polygonscan.com';
    case 'base':
      return 'https://basescan.org';
    // Update PulseChain explorer host per request
    case 'pulse':
      return 'https://scan.9mm.pro';
    default:
      return '';
  }
}

async function fetchTxViaExplorer(chain, address) {
  const c = normChain(chain);
  const addr = String(address || '');
  const key = getExplorerKey(c);
  const bases = {
    eth: 'https://api.etherscan.io/api',
    bsc: 'https://api.bscscan.com/api',
    polygon: 'https://api.polygonscan.com/api',
    base: 'https://api.basescan.org/api',
    pulse: 'https://api.scan.pulsechain.com/api'
  };
  const base = bases[c];
  if (!base) throw new Error(`No explorer base for ${c}`);

  const mk = (action) =>
    `${base}?module=account&action=${action}&address=${addr}&page=1&offset=50&sort=desc${key ? `&apikey=${encodeURIComponent(key)}` : ''}`;
  const host = explorerBase(c);

  const items = [];

  // native tx
  try {
    const r = await fetch(mk('txlist'));
    const j = await r.json();
    const list = Array.isArray(j?.result) ? j.result : [];
    for (const t of list) {
      items.push({
        chain: c,
        kind: 'native',
        hash: t.hash,
        timeStamp: Number(t.timeStamp || 0),
        from: t.from,
        to: t.to,
        amount: Number(t.value || 0) / 1e18,
        feeWei: (() => {
          try {
            return String(BigInt(t.gasUsed || 0) * BigInt(t.gasPrice || 0));
          } catch {
            return '0';
          }
        })(),
        explorer: host ? `${host}/tx/${t.hash}` : undefined
      });
    }
  } catch {}

  // ERC-20 transfers
  try {
    const r = await fetch(mk('tokentx'));
    const j = await r.json();
    const list = Array.isArray(j?.result) ? j.result : [];
    for (const t of list) {
      const dec = Number(t.tokenDecimal || 18);
      const amt = Number(t.value || 0) / 10 ** (Number.isFinite(dec) ? dec : 18);
      items.push({
        chain: c,
        kind: 'erc20',
        hash: t.hash,
        timeStamp: Number(t.timeStamp || 0),
        from: t.from,
        to: t.to,
        amount: amt,
        token: { symbol: t.tokenSymbol || '', address: t.contractAddress },
        explorer: host ? `${host}/tx/${t.hash}` : undefined
      });
    }
  } catch {}

  // Desc sort
  items.sort((a, b) => (b.timeStamp || 0) - (a.timeStamp || 0));
  return { items };
}

async function fetchTxLive(chain, address, type) {
  const params = new URLSearchParams();
  params.set('chain', normChain(chain));
  params.set('address', String(address || ''));
  if (type) params.set('type', String(type));
  // Try app backend first
  try {
    const r = await fetch(`/api/tx?${params.toString()}`);
    if (!r.ok) throw new Error(`tx ${chain} ${r.status}`);
    const j = await r.json();
    const items = Array.isArray(j.items) ? j.items.slice() : [];
    items.forEach((it) => {
      if (it && !it.timeStamp && it.date) {
        const ts = Date.parse(it.date);
        if (!Number.isNaN(ts)) it.timeStamp = Math.floor(ts / 1000);
      }
    });
    return { items };
  } catch (e) {
    // Fallback: direct explorer call (requires key; some allow no-key but rate-limited)
    try {
      return await fetchTxViaExplorer(chain, address);
    } catch {
      // surface original error
      throw e;
    }
  }
}

export const DataClient = {
  // Raw cache IO
  read: readCached,
  write: writeCached,
  // SWR get-or-refresh
  async getBalances(chain, address, { ttlMs = TEN_MIN, force = false } = {}) {
    const key = `balances:${normChain(chain)}:${String(address || '').toLowerCase()}`;
    const { payload, meta } = await readCached(key, { ttlMs });
    return meta?.version === 2 ? payload : null;
  },
  async refreshBalances(chain, address, { ttlMs = TEN_MIN, force = false } = {}) {
    const key = `balances:${normChain(chain)}:${String(address || '').toLowerCase()}`;
    return fetchAndCache(key, () => fetchBalancesLive(chain, address, force), { ttlMs, force, version: 2 });
  },
  async getPrice(chain, { ttlMs = TEN_MIN } = {}) {
    const key = `prices:${normChain(chain)}`;
    const { payload } = await readCached(key, { ttlMs });
    return payload;
  },
  async refreshPrice(chain, { ttlMs = TEN_MIN, force = false } = {}) {
    const key = `prices:${normChain(chain)}`;
    return fetchAndCache(key, () => fetchPriceLive(chain), { ttlMs, force });
  },
  async getTxs(chain, address, type = 'all', { ttlMs = TEN_MIN } = {}) {
    const key = `txs:${normChain(chain)}:${String(address || '').toLowerCase()}:${String(type || 'all')}`;
    const { payload } = await readCached(key, { ttlMs });
    return payload;
  },
  async refreshTxs(chain, address, type = 'all', { ttlMs = TEN_MIN, force = false } = {}) {
    const key = `txs:${normChain(chain)}:${String(address || '').toLowerCase()}:${String(type || 'all')}`;
    return fetchAndCache(key, () => fetchTxLive(chain, address, type), { ttlMs, force });
  }
};

export default DataClient;
