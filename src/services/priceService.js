// src/services/priceService.js
// Lightweight DefiLlama price fetcher (no API key).
// - Batches contract addresses for Ethereum, Base, Polygon, BSC
// - Caches results in localStorage to avoid hammering
// - Exposes: get*TokenPricesLlama(addresses), get*UsdPriceLlama()

const LLAMA_BASE = 'https://coins.llama.fi/prices/current';
const LLAMA_HISTORICAL_BASE = 'https://coins.llama.fi/prices/historical';
const CACHE_MS = 60 * 1000; // 1 minute cache

// Simple in-flight dedupe by URL to avoid concurrent duplicate requests
const inflight = new Map(); // url -> Promise<any>
async function fetchJsonDedup(url) {
  if (inflight.has(url)) return inflight.get(url);
  const p = (async () => {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      inflight.delete(url);
    }
  })();
  inflight.set(url, p);
  return p;
}

const lsGet = (k, maxAgeMs) => {
  try {
    const raw = localStorage.getItem(k);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (Date.now() - (obj.ts || 0) > maxAgeMs) return null;
    return obj.data ?? null;
  } catch {
    return null;
  }
};
const lsSet = (k, data) => {
  try {
    localStorage.setItem(k, JSON.stringify({ ts: Date.now(), data }));
  } catch { /* ignore */ }
};

function normalizeMetaValue(meta) {
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    const price = Number(meta.price ?? meta.usd ?? meta.value ?? 0) || 0;
    const pctRaw = meta.change24hPct ?? meta.pctChange24h ?? meta.change24h ?? null;
    const pct = Number.isFinite(Number(pctRaw)) ? Number(pctRaw) : null;
    return { price, change24hPct: pct };
  }
  const price = Number(meta) || 0;
  return { price, change24hPct: null };
}

function parseCachedMeta(payload) {
  if (!payload) return null;
  if (Array.isArray(payload)) {
    const entries = [];
    for (const row of payload) {
      if (!Array.isArray(row) || row.length < 2) continue;
      const addr = String(row[0] || '').toLowerCase();
      if (!addr) continue;
      entries.push([addr, normalizeMetaValue(row[1])]);
    }
    return entries.length ? new Map(entries) : null;
  }
  if (typeof payload === 'object') {
    const entries = [];
    for (const [addrRaw, meta] of Object.entries(payload)) {
      const addr = String(addrRaw || '').toLowerCase();
      if (!addr) continue;
      entries.push([addr, normalizeMetaValue(meta)]);
    }
    return entries.length ? new Map(entries) : null;
  }
  return null;
}

function uniqueAddresses(addresses = []) {
  return [...new Set(addresses.map((a) => String(a || '').toLowerCase()).filter(Boolean))];
}

async function getTokenMetaFromLlama(prefix, addresses) {
  const uniq = uniqueAddresses(addresses);
  if (!uniq.length) return new Map();

  const sorted = [...uniq].sort();
  const cacheKey = `kw:llama:${prefix}:${sorted.join(',')}`;
  const cached = parseCachedMeta(lsGet(cacheKey, CACHE_MS));
  if (cached) return cached;

  const coinsParam = sorted.map((a) => `${prefix}:${a}`).join(',');
  const encodedCoins = encodeURIComponent(coinsParam);
  const nowUrl = `${LLAMA_BASE}/${encodedCoins}`;
  const ts = Math.floor(Date.now() / 1000) - 86400;
  const histUrl = `${LLAMA_HISTORICAL_BASE}/${ts}/${encodedCoins}`;

  let nowJson;
  let histJson;
  try {
    const [nowRes, histRes] = await Promise.all([
      fetchJsonDedup(nowUrl),
      fetchJsonDedup(histUrl)
    ]);
    nowJson = nowRes?.coins || {};
    histJson = histRes?.coins || {};
  } catch (e) {
    console.warn(`[Price] DefiLlama ${prefix} fetch failed`, e?.message);
    return new Map();
  }

  const out = new Map();
  for (const addr of sorted) {
    const key = `${prefix}:${addr}`;
    const nowPrice = Number(nowJson[key]?.price ?? nowJson[key]?.value ?? 0) || 0;
    const oldPrice = Number(histJson[key]?.price ?? histJson[key]?.value ?? 0) || 0;
    let pct = null;
    if (nowPrice > 0 && oldPrice > 0) {
      pct = ((nowPrice - oldPrice) / oldPrice) * 100;
      if (!Number.isFinite(pct)) pct = null;
    }
    out.set(addr, {
      price: nowPrice,
      change24hPct: pct
    });
  }

  lsSet(cacheKey, Array.from(out.entries()));
  return out;
}

function parseNativeCached(payload) {
  if (payload == null) return null;
  if (typeof payload === 'number') {
    return { price: Number(payload) || 0, change24hPct: null };
  }
  if (typeof payload === 'object') {
    return normalizeMetaValue(payload);
  }
  return null;
}

async function getNativeMetaFromLlama(cacheKey, llamaId) {
  const cached = parseNativeCached(lsGet(cacheKey, CACHE_MS));
  if (cached) return cached;

  const nowUrl = `${LLAMA_BASE}/${encodeURIComponent(llamaId)}`;
  const ts = Math.floor(Date.now() / 1000) - 86400;
  const histUrl = `${LLAMA_HISTORICAL_BASE}/${ts}/${encodeURIComponent(llamaId)}`;

  try {
    const [nowRes, histRes] = await Promise.all([
      fetchJsonDedup(nowUrl),
      fetchJsonDedup(histUrl)
    ]);
    const nowPrice = Number(nowRes?.coins?.[llamaId]?.price ?? 0) || 0;
    const oldPrice = Number(histRes?.coins?.[llamaId]?.price ?? 0) || 0;
    let pct = null;
    if (nowPrice > 0 && oldPrice > 0) {
      pct = ((nowPrice - oldPrice) / oldPrice) * 100;
      if (!Number.isFinite(pct)) pct = null;
    }
    const meta = { price: nowPrice, change24hPct: pct };
    lsSet(cacheKey, meta);
    return meta;
  } catch (e) {
    console.warn(`[Price] DefiLlama native price failed for ${llamaId}`, e?.message);
    return { price: 0, change24hPct: null };
  }
}

/**
 * Fetch USD prices + 24h change for a set of Ethereum token contracts via DefiLlama.
 * @param {string[]} addresses array of 0x addresses (any case)
 * @returns {Promise<Map<string, {price:number, change24hPct:number|null}>>}
 */
export async function getEthTokenPricesLlama(addresses) {
  return getTokenMetaFromLlama('ethereum', addresses);
}

/**
 * Fetch native ETH USD price + 24h change (via DefiLlama).
 */
export async function getEthUsdPriceLlama() {
  return getNativeMetaFromLlama('kw:llama:eth:native', 'coingecko:ethereum');
}

/**
 * Base chain: DefiLlama uses the key prefix 'base:' for token contracts.
 */
export async function getBaseTokenPricesLlama(addresses) {
  return getTokenMetaFromLlama('base', addresses);
}

// Base native coin is ETH - use DefiLlama base id for native meta
export async function getBaseUsdPriceLlama() {
  return getNativeMetaFromLlama('kw:llama:base:native', 'coingecko:base');
}

/**
 * BSC: DefiLlama uses the key prefix 'bsc:' for token contracts.
 */
export async function getBscTokenPricesLlama(addresses) {
  return getTokenMetaFromLlama('bsc', addresses);
}

// BNB (BSC native) price meta via coingecko id
export async function getBscUsdPriceLlama() {
  return getNativeMetaFromLlama('kw:llama:bsc:native', 'coingecko:binancecoin');
}

/**
 * Polygon: DefiLlama uses the key prefix 'polygon:' for token contracts.
 */
export async function getPolygonTokenPricesLlama(addresses) {
  return getTokenMetaFromLlama('polygon', addresses);
}

// Polygon native (MATIC) price via coingecko id
export async function getPolygonUsdPriceLlama() {
  return getNativeMetaFromLlama('kw:llama:polygon:native', 'coingecko:matic-network');
}
