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
const DEBUG_CACHE = String(import.meta?.env?.VITE_DEBUG_CACHE || '').toLowerCase() === 'true' ||
  (typeof localStorage !== 'undefined' && (localStorage.getItem('DEBUG_CACHE') === 'true'));
const dlog = (...a) => { if (DEBUG_CACHE) console.log('%c[CACHE]', 'color:#6cf', ...a); };

const inflight = new Map(); // key -> { promise, controller, startedAt }

// Broadcast for cross-tab dedupe and update events
let bc;
try { bc = new BroadcastChannel('kinko-data'); } catch { bc = null; }

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function jitter(base, pct = 0.2) { const j = base * pct; return base + (Math.random() * 2 - 1) * j; }

async function probeAndClaim(key) {
  if (!bc) return true; // no cross-tab, claim
  let seenClaim = false;
  const onMsg = (e) => {
    if (e?.data?.type === 'claim' && e?.data?.key === key) seenClaim = true;
  };
  bc.addEventListener('message', onMsg, { once: false });
  try {
    bc.postMessage({ type: 'probe', key });
    await sleep(150);
  } finally {
    bc.removeEventListener('message', onMsg);
  }
  if (seenClaim) return false;
  try { bc.postMessage({ type: 'claim', key }); } catch {}
  return true;
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
    try { return await fn(); } catch (e) { lastErr = e; }
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
  try { bc?.postMessage({ type: 'updated', key, at: Date.now() }); } catch {}
  try { await idbSet(`meta:lastUpdated:${key}`, { payload: Date.now(), version, fetchedAt: Date.now(), ttlMs: TEN_MIN }); } catch {}
}

async function fetchAndCache(key, fetcher, { ttlMs = TEN_MIN, version = 1, force = false } = {}) {
  // TTL short-circuit when not forced
  if (!force) {
    const rec = await idbGet(key);
    if (isFresh(rec, ttlMs)) return rec?.payload ?? null; // already fresh
  }

  // In-memory dedupe
  if (inflight.has(key)) return inflight.get(key).promise;

  // Cross-tab dedupe
  const canClaim = await probeAndClaim(key);
  if (!canClaim) {
    // Wait for an update event, then return latest cache
    const payload = await new Promise((resolve) => {
      let t;
      const onMsg = async (e) => {
        if (e?.data?.type === 'updated' && e?.data?.key === key) {
          bc?.removeEventListener('message', onMsg);
          clearTimeout(t);
          const hit = await idbGet(key);
          resolve(hit?.payload ?? null);
        }
      };
      if (bc) bc.addEventListener('message', onMsg);
      // Guard: if no update comes back after some time, resolve to cache
      t = setTimeout(async () => {
        if (bc) bc.removeEventListener('message', onMsg);
        const hit = await idbGet(key);
        resolve(hit?.payload ?? null);
      }, 5000);
    });
    return payload;
  }

  const controller = new AbortController();
  // Abort any existing in this tab
  const prev = inflight.get(key);
  try { prev?.controller?.abort(); } catch {}

  const promise = (async () => {
    try {
      const payload = await withBackoff(() => fetcher({ signal: controller.signal }), { signal: controller.signal });
      await writeCached(key, { payload, version, ttlMs });
      dlog('WROTE', key, { size: Array.isArray(payload) ? payload.length : typeof payload });
      return payload;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, { promise, controller, startedAt: Date.now() });
  return promise;
}

// -------------- High-level API --------------

const CHAINS = ['eth', 'pulse', 'bsc', 'polygon', 'base'];

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
import { fetchPulsechainTokens } from '../services/pulsechainService';
import { fetchEthereumTokens } from '../services/ethereumService';
import { getBaseTokensFromBlockscout, toUnits as toUnitsBase } from '../services/baseBlockscoutService';
import { getBaseTokenPricesLlama, getBaseUsdPriceLlama, getBscTokenPricesLlama, getBscUsdPriceLlama, getPolygonTokenPricesLlama, getPolygonUsdPriceLlama, getEthTokenPricesLlama, getEthUsdPriceLlama } from '../services/priceService';
import { getBaseNativeBalance } from '../services/baseRpcService';
import { getPolygonTokensFromBlockscout, toUnits as toUnitsPolygon } from '../services/polygonBlockscoutService';
import { getPolygonNativeBalance } from '../services/polygonRpcService';
import { getBscTokensFromNodereal, toUnitsBsc } from '../services/bscNoderealService';
import { getBscNativeBalance } from '../services/bscRpcService';

async function fetchBalancesLive(chain, address) {
  const c = normChain(chain);
  const addr = String(address || '').toLowerCase();
  if (!addr) return [];
  if (c === 'pulse') return (await fetchPulsechainTokens(addr)).map((t) => ({ ...t, chain: 'pulse' }));
  if (c === 'eth') {
    // Keep it simple: reuse existing service for ETH
    return await fetchEthereumTokens(addr);
  }
  if (c === 'base') {
    try {
      const discovered = await getBaseTokensFromBlockscout(addr);
      const addrs = discovered.map((t) => t.address).filter(Boolean);
      const priceMap = await getBaseTokenPricesLlama(addrs);
      const nativePriceUsd = await getBaseUsdPriceLlama();
      let nativeAmount = 0;
      try { nativeAmount = await getBaseNativeBalance(addr); } catch {}
      const native = { chain: 'base', address: 'native', symbol: 'ETH', name: 'Ether', amount: nativeAmount, priceUsd: nativePriceUsd, valueUsd: nativePriceUsd ? nativeAmount * nativePriceUsd : 0 };
      const erc20 = discovered.map((t) => {
        const amount = toUnitsBase(t.balanceRaw, Number(t.decimals ?? 18));
        const p = priceMap.get(t.address) || 0;
        return { chain: 'base', address: t.address, symbol: t.symbol || '', name: t.name || t.symbol || 'Token', decimals: Number(t.decimals ?? 18), amount, priceUsd: p, valueUsd: p ? amount * p : 0 };
      });
      return [native, ...erc20];
    } catch { return []; }
  }
  if (c === 'polygon') {
    try {
      const discovered = await getPolygonTokensFromBlockscout(addr);
      const addrs = discovered.map((t) => t.address).filter(Boolean);
      const priceMap = await getPolygonTokenPricesLlama(addrs);
      const nativePriceUsd = await getPolygonUsdPriceLlama();
      let nativeAmount = 0;
      try { nativeAmount = await getPolygonNativeBalance(addr); } catch {}
      const native = { chain: 'polygon', address: 'native', symbol: 'MATIC', name: 'Polygon', amount: nativeAmount, priceUsd: nativePriceUsd, valueUsd: nativePriceUsd ? nativeAmount * nativePriceUsd : 0 };
      const erc20 = discovered.map((t) => {
        const amount = toUnitsPolygon(t.balanceRaw, Number(t.decimals ?? 18));
        const p = priceMap.get(t.address) || 0;
        return { chain: 'polygon', address: t.address, symbol: t.symbol || '', name: t.name || t.symbol || 'Token', decimals: Number(t.decimals ?? 18), amount, priceUsd: p, valueUsd: p ? amount * p : 0 };
      });
      return [native, ...erc20];
    } catch { return []; }
  }
  if (c === 'bsc') {
    try {
      const discovered = await getBscTokensFromNodereal(addr);
      const addrs = discovered.map((t) => t.address).filter(Boolean);
      const priceMap = await getBscTokenPricesLlama(addrs);
      const nativePriceUsd = await getBscUsdPriceLlama();
      let nativeAmount = 0;
      try { nativeAmount = await getBscNativeBalance(addr); } catch {}
      const native = { chain: 'bsc', address: 'native', symbol: 'BNB', name: 'BNB', amount: nativeAmount, priceUsd: nativePriceUsd, valueUsd: nativePriceUsd ? nativeAmount * nativePriceUsd : 0 };
      const erc20 = discovered.map((t) => {
        const amount = toUnitsBsc(t.balanceRaw, Number(t.decimals ?? 18));
        const p = priceMap.get(t.address) || 0;
        return { chain: 'bsc', address: t.address, symbol: t.symbol || '', name: t.name || t.symbol || 'Token', decimals: Number(t.decimals ?? 18), amount, priceUsd: p, valueUsd: p ? amount * p : 0 };
      });
      return [native, ...erc20];
    } catch { return []; }
  }
  return [];
}

async function fetchPriceLive(chain) {
  const c = normChain(chain);
  if (c === 'pulse') {
    const { getPLSPriceUSD } = await import('../services/pulsechainService');
    return { usd: await getPLSPriceUSD() };
  }
  if (c === 'eth') return { usd: await getEthUsdPriceLlama() };
  if (c === 'base') return { usd: await getBaseUsdPriceLlama() };
  if (c === 'polygon') return { usd: await getPolygonUsdPriceLlama() };
  if (c === 'bsc') return { usd: await getBscUsdPriceLlama() };
  return { usd: 0 };
}

async function fetchTxLive(chain, address, type) {
  const params = new URLSearchParams();
  params.set('chain', normChain(chain));
  params.set('address', String(address || ''));
  if (type) params.set('type', String(type));
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
}

export const DataClient = {
  // Raw cache IO
  read: readCached,
  write: writeCached,
  // SWR get-or-refresh
  async getBalances(chain, address, { ttlMs = TEN_MIN, force = false } = {}) {
    const key = `balances:${normChain(chain)}:${String(address || '').toLowerCase()}`;
    const { payload } = await readCached(key, { ttlMs });
    return payload;
  },
  async refreshBalances(chain, address, { ttlMs = TEN_MIN, force = false } = {}) {
    const key = `balances:${normChain(chain)}:${String(address || '').toLowerCase()}`;
    return fetchAndCache(key, () => fetchBalancesLive(chain, address), { ttlMs, force });
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
