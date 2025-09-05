// src/services/priceService.js
// Lightweight DefiLlama price fetcher (no API key).
// - Batches contract addresses for Ethereum
// - Caches results in localStorage to avoid hammering
// - Exposes: getEthTokenPricesLlama(addresses), getEthUsdPriceLlama()

const LLAMA_BASE = 'https://coins.llama.fi/prices/current';
const CACHE_MS = 60 * 1000; // 1 minute cache

const lsGet = (k, maxAgeMs) => {
    try {
        const raw = localStorage.getItem(k);
        if (!raw) return null;
        const obj = JSON.parse(raw);
        if (Date.now() - (obj.ts || 0) > maxAgeMs) return null;
        return obj.data ?? null;
    } catch { return null; }
};
const lsSet = (k, data) => {
    try { localStorage.setItem(k, JSON.stringify({ ts: Date.now(), data })); } catch { }
};

/**
 * Fetch USD prices for a set of Ethereum token contracts via DefiLlama.
 * @param {string[]} addresses  array of 0x addresses (any case)
 * @returns {Promise<Map<string, number>>}  map lowercased address -> priceUsd
 */
export async function getEthTokenPricesLlama(addresses) {
    const uniq = [...new Set(addresses.map(a => a.toLowerCase()).filter(Boolean))];
    if (uniq.length === 0) return new Map();

    // cache key per exact set
    const cacheKey = `kw:llama:eth:${uniq.sort().join(',')}`;
    const cached = lsGet(cacheKey, CACHE_MS);
    if (cached) return new Map(cached);

    // DefiLlama supports batching: /prices/current/ethereum:0x...,ethereum:0x...
    const coinsParam = uniq.map(a => `ethereum:${a}`).join(',');
    const url = `${LLAMA_BASE}/${encodeURIComponent(coinsParam)}`;

    let json;
    try {
        const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (!res.ok) throw new Error(`Llama HTTP ${res.status}`);
        json = await res.json();
    } catch (e) {
        console.warn('[Price] DefiLlama fetch failed', e?.message);
        return new Map();
    }

    const out = new Map();
    const coins = json?.coins || {};
    for (const key of Object.keys(coins)) {
        // key form: "ethereum:0xabc..."
        const [, addr] = key.split(':');
        const price = Number(coins[key]?.price ?? 0);
        if (addr && price > 0) out.set(addr.toLowerCase(), price);
    }

    lsSet(cacheKey, Array.from(out.entries()));
    return out;
}

/**
 * Fetch native ETH USD price (via DefiLlama).
 * Uses coingecko:ethereum id (supported by Llama's aggregator).
 */
export async function getEthUsdPriceLlama() {
    const cacheKey = 'kw:llama:eth:native';
    const cached = lsGet(cacheKey, CACHE_MS);
    if (typeof cached === 'number') return cached;

    const url = `${LLAMA_BASE}/${encodeURIComponent('coingecko:ethereum')}`;
    try {
        const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (!res.ok) throw new Error(`Llama HTTP ${res.status}`);
        const json = await res.json();
        const price = Number(json?.coins?.['coingecko:ethereum']?.price ?? 0);
        if (price > 0) {
            lsSet(cacheKey, price);
            return price;
        }
    } catch (e) {
        console.warn('[Price] DefiLlama ETH price failed', e?.message);
    }
    return 0;
}

/**
 * Base chain: DefiLlama uses the key prefix 'base:' for token contracts.
 */
export async function getBaseTokenPricesLlama(addresses) {
  const uniq = [...new Set(addresses.map(a => a.toLowerCase()).filter(Boolean))];
  if (uniq.length === 0) return new Map();

  const cacheKey = `kw:llama:base:${uniq.sort().join(',')}`;
  const cached = lsGet(cacheKey, CACHE_MS);
  if (cached) return new Map(cached);

  const coinsParam = uniq.map(a => `base:${a}`).join(',');
  const url = `${LLAMA_BASE}/${encodeURIComponent(coinsParam)}`;

  let json;
  try {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error(`Llama HTTP ${res.status}`);
    json = await res.json();
  } catch (e) {
    console.warn('[Price] DefiLlama Base fetch failed', e?.message);
    return new Map();
  }

  const out = new Map();
  const coins = json?.coins || {};
  for (const key of Object.keys(coins)) {
    const [, addr] = key.split(':');
    const price = Number(coins[key]?.price ?? 0);
    if (addr && price > 0) out.set(addr.toLowerCase(), price);
  }
  lsSet(cacheKey, Array.from(out.entries()));
  return out;
}

// Base native coin is ETH – reuse the ETH price
export async function getBaseUsdPriceLlama() {
  return getEthUsdPriceLlama();
}

/**
 * BSC: DefiLlama uses the key prefix 'bsc:' for token contracts.
 */
export async function getBscTokenPricesLlama(addresses) {
  const uniq = [...new Set(addresses.map((a) => (a || '').toLowerCase()).filter(Boolean))];
  if (uniq.length === 0) return new Map();

  const cacheKey = `kw:llama:bsc:${uniq.sort().join(',')}`;
  const cached = lsGet(cacheKey, CACHE_MS);
  if (cached) return new Map(cached);

  const coinsParam = uniq.map((a) => `bsc:${a}`).join(',');
  const url = `${LLAMA_BASE}/${encodeURIComponent(coinsParam)}`;

  let json;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Llama HTTP ${res.status}`);
    json = await res.json();
  } catch (e) {
    console.warn('[Price] DefiLlama BSC fetch failed', e?.message);
    return new Map();
  }

  const out = new Map();
  const coins = json?.coins || {};
  for (const key of Object.keys(coins)) {
    const [, addr] = key.split(':');
    const price = Number(coins[key]?.price ?? 0);
    if (addr && price > 0) out.set(addr.toLowerCase(), price);
  }
  lsSet(cacheKey, Array.from(out.entries()));
  return out;
}

// BNB (BSC native) price: reuse coingecko id
export async function getBscUsdPriceLlama() {
  const cacheKey = 'kw:llama:bsc:native';
  const cached = lsGet(cacheKey, CACHE_MS);
  if (typeof cached === 'number') return cached;

  const url = `${LLAMA_BASE}/${encodeURIComponent('coingecko:binancecoin')}`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Llama HTTP ${res.status}`);
    const json = await res.json();
    const price = Number(json?.coins?.['coingecko:binancecoin']?.price ?? 0);
    if (price > 0) {
      lsSet(cacheKey, price);
      return price;
    }
  } catch (e) {
    console.warn('[Price] DefiLlama BSC price failed', e?.message);
  }
  return 0;
}

/**
 * Polygon: DefiLlama uses the key prefix 'polygon:' for token contracts.
 */
export async function getPolygonTokenPricesLlama(addresses) {
  const uniq = [...new Set(addresses.map((a) => (a || '').toLowerCase()).filter(Boolean))];
  if (uniq.length === 0) return new Map();

  const cacheKey = `kw:llama:polygon:${uniq.sort().join(',')}`;
  const cached = lsGet(cacheKey, CACHE_MS);
  if (cached) return new Map(cached);

  const coinsParam = uniq.map((a) => `polygon:${a}`).join(',');
  const url = `${LLAMA_BASE}/${encodeURIComponent(coinsParam)}`;

  let json;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Llama HTTP ${res.status}`);
    json = await res.json();
  } catch (e) {
    console.warn('[Price] DefiLlama Polygon fetch failed', e?.message);
    return new Map();
  }

  const out = new Map();
  const coins = json?.coins || {};
  for (const key of Object.keys(coins)) {
    const [, addr] = key.split(':');
    const price = Number(coins[key]?.price ?? 0);
    if (addr && price > 0) out.set(addr.toLowerCase(), price);
  }
  lsSet(cacheKey, Array.from(out.entries()));
  return out;
}

// Polygon native (MATIC) price via coingecko id
export async function getPolygonUsdPriceLlama() {
  const cacheKey = 'kw:llama:polygon:native';
  const cached = lsGet(cacheKey, CACHE_MS);
  if (typeof cached === 'number') return cached;

  // MATIC id remains coingecko:matic-network for Polygon PoS native
  const url = `${LLAMA_BASE}/${encodeURIComponent('coingecko:matic-network')}`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Llama HTTP ${res.status}`);
    const json = await res.json();
    const price = Number(json?.coins?.['coingecko:matic-network']?.price ?? 0);
    if (price > 0) {
      lsSet(cacheKey, price);
      return price;
    }
  } catch (e) {
    console.warn('[Price] DefiLlama Polygon price failed', e?.message);
  }
  return 0;
}
