// src/services/pulsechainService.js
// PulseChain: Blockscout (balances + icons + prices) first, Dexscreener as fallback, with caching.

import axios from 'axios';
import { getCachedJSON, setCachedJSON } from '../utils/kinkoCache';

const BASE_V2       = import.meta.env.VITE_PLS_BLOCKSCOUT_V2        || 'https://api.scan.pulsechain.com/api/v2';
const BASE_V1       = import.meta.env.VITE_PLS_BLOCKSCOUT_V1        || 'https://api.scan.pulsechain.com/api';
const GRAPHQL       = import.meta.env.VITE_PLS_BLOCKSCOUT_GRAPHQL   || 'https://api.scan.pulsechain.com/graphql';
const DEXSCREENER   = 'https://api.dexscreener.com/latest/dex';

const WPLS_ADDR = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27'; // Wrapped PLS (pricing anchor)
const STABLES   = new Set(['USDC', 'USDT', 'DAI', 'USDL', 'pDAI', 'USDC.E']);
const DEBUG     = !!import.meta.env.VITE_PLS_DEBUG;

// hide tokens with value <= this amount (you added this earlier)
const HIDE_USD_MIN = Number(import.meta.env.VITE_PLS_HIDE_USD_MIN ?? 0.01);

// ⏱ cache TTL (minutes). Default 10.
const CACHE_TTL_MS = Number(import.meta.env.VITE_WALLET_CACHE_TTL_MIN ?? 10) * 60_000;

const fromUnits = (v, d = 18) => {
  if (!v && v !== 0) return 0;
  const s = typeof v === 'bigint' ? v.toString() : String(v);
  return Number(s) / Math.pow(10, Number(d || 18));
};

const liq = (p) => Number(p?.liquidity?.usd || 0);

// ---------- price helpers ----------
function weightedUsd(pairs, maxN = 8) {
  const src = (pairs || [])
    .filter(p => Number(p?.priceUsd) > 0)
    .sort((a, b) => liq(b) - liq(a))
    .slice(0, maxN);
  const num = src.reduce((s, p) => s + Number(p.priceUsd) * liq(p), 0);
  const den = src.reduce((s, p) => s + liq(p), 0);
  return den > 0 ? num / den : 0;
}
function filterPulsePairsForToken(addr, pairs) {
  const a = (addr || '').toLowerCase();
  return (pairs || [])
    .filter(p => p?.chainId === 'pulsechain')
    .filter(p =>
      (p?.baseToken?.address || '').toLowerCase() === a ||
      (p?.quoteToken?.address || '').toLowerCase() === a
    );
}
function usdForTokenFromPairs(addr, pairs) {
  const a = (addr || '').toLowerCase();
  const mine = filterPulsePairsForToken(a, pairs);
  if (!mine.length) return 0;
  const stable = mine.filter(p => {
    const isBase = (p?.baseToken?.address || '').toLowerCase() === a;
    const otherSym = isBase ? p?.quoteToken?.symbol : p?.baseToken?.symbol;
    return STABLES.has((otherSym || '').toUpperCase());
  });
  const src = (stable.length ? stable : mine)
    .map(p => {
      const isBase = (p?.baseToken?.address || '').toLowerCase() === a;
      const baseUsd = Number(p?.priceUsd || 0);
      const ratio   = Number(p?.price ?? 0);
      const usd = isBase ? baseUsd : (baseUsd && ratio ? baseUsd / ratio : 0);
      return { usd, liq: liq(p) };
    })
    .filter(x => x.usd > 0 && x.liq > 0);
  if (!src.length) return 0;
  const num = src.reduce((s, r) => s + r.usd * r.liq, 0);
  const den = src.reduce((s, r) => s + r.liq, 0);
  return den > 0 ? num / den : 0;
}

// ---------- Native PLS price (via WPLS) ----------
export async function getPLSPriceUSD() {
  try {
    const { data } = await axios.get(`${DEXSCREENER}/tokens/${WPLS_ADDR}`, { timeout: 10000 });
    const p = usdForTokenFromPairs(WPLS_ADDR, data?.pairs || []);
    if (p > 0 && p < 1) return p;
  } catch {}
  try {
    const { data } = await axios.get(`${DEXSCREENER}/search?q=WPLS%20chain:pulsechain`, { timeout: 8000 });
    const p = usdForTokenFromPairs(WPLS_ADDR, data?.pairs || []);
    if (p > 0 && p < 1) return p;
  } catch {}
  try {
    const { data } = await axios.get(`${BASE_V2}/stats`, { timeout: 8000 });
    const cands = [data?.coin_price, data?.usd_price, data?.native_coin_price].map(Number);
    const p = cands.find(x => Number.isFinite(x) && x > 0 && x < 1);
    if (p) return p;
  } catch {}
  try {
    const { data } = await axios.get(`${BASE_V1}?module=stats&action=coinprice`, { timeout: 8000 });
    const r = data?.result || data;
    const cands = [r?.usd, r?.USD, r?.ethusd, r?.price, r?.usdPrice].map(Number);
    const p = cands.find(x => Number.isFinite(x) && x > 0 && x < 1);
    if (p) return p;
  } catch {}
  return 0;
}

// ---------- Blockscout token lists ----------
async function fetchTokensV2(address) {
  const url = `${BASE_V2}/addresses/${address}/token-balances?type=ERC-20`;
  const { data } = await axios.get(url, { timeout: 12000 });
  const arr = Array.isArray(data) ? data : data?.items || [];
  return arr.map((row) => {
    const t = row.token || {};
    const decimals = Number(t.decimals ?? 18);
    const balance  = fromUnits(row.value || '0', decimals);
    const exRate   = Number(t.exchange_rate || 0);
    return {
      chain: 'pulse',
      address: t.address,
      symbol: t.symbol || '',
      name: t.name || '',
      decimals,
      balance,
      price: exRate > 0 ? exRate : 0,
      priceSource: exRate > 0 ? 'blockscout' : 'none',
      value: balance * (exRate > 0 ? exRate : 0),
      iconUrl: t.icon_url || null
    };
  });
}
async function fetchTokensGraphQL(address) {
  const query = `
    query ($hash: String!) {
      address(hash: $hash) {
        tokenBalances {
          value
          token {
            address
            name
            symbol
            decimals
            icon_url
            exchange_rate
            type
          }
        }
      }
    }`;
  const { data } = await axios.post(GRAPHQL, { query, variables: { hash: address } }, { timeout: 12000 });
  const rows = data?.data?.address?.tokenBalances || [];
  return rows.map((row) => {
    const t = row.token || {};
    const decimals = Number(t.decimals ?? 18);
    const balance  = fromUnits(row.value || '0', decimals);
    const exRate   = Number(t.exchange_rate || 0);
    return {
      chain: 'pulse',
      address: t.address,
      symbol: t.symbol || '',
      name: t.name || '',
      decimals,
      balance,
      price: exRate > 0 ? exRate : 0,
      priceSource: exRate > 0 ? 'blockscout' : 'none',
      value: balance * (exRate > 0 ? exRate : 0),
      iconUrl: t.icon_url || null
    };
  });
}

// ---------- Blockscout per-token fallback (fills exchange_rate/icons) ----------
async function fetchTokenMetaFromBlockscout(addr) {
  try {
    const { data } = await axios.get(`${BASE_V2}/tokens/${addr}`, { timeout: 10000 });
    const t = data || {};
    const exRate = Number(t.exchange_rate || 0);
    return { price: exRate > 0 ? exRate : 0, iconUrl: t.icon_url || null };
  } catch {
    return { price: 0, iconUrl: null };
  }
}
async function fillMissingFromBlockscout(tokens) {
  const needs = tokens.filter(t => (!t.price || t.price === 0) && t.address);
  for (const t of needs) {
    const meta = await fetchTokenMetaFromBlockscout(t.address);
    if (meta.price > 0 || meta.iconUrl) {
      t.price = meta.price || t.price;
      t.priceSource = meta.price > 0 ? 'blockscout' : t.priceSource;
      t.iconUrl = t.iconUrl || meta.iconUrl;
      t.value = t.balance * (t.price || 0);
    }
  }
  return tokens;
}

// ---------- Dexscreener PRC-20 price enrichment ----------
async function dexPricesForBatch(addresses) {
  const out = {};
  const uniq = [...new Set((addresses || []).map(a => (a || '').toLowerCase()))].filter(Boolean);
  const chunk = 25;
  for (let i = 0; i < uniq.length; i += chunk) {
    const batch = uniq.slice(i, i + chunk);
    try {
      const { data } = await axios.get(`${DEXSCREENER}/tokens/${batch.join(',')}`, { timeout: 12000 });
      const pairs = data?.pairs || [];
      for (const addr of batch) {
        const usd = usdForTokenFromPairs(addr, pairs);
        if (usd > 0) out[addr.toLowerCase()] = usd;
      }
    } catch {}
  }
  return out;
}
async function dexPriceForSingle(address) {
  try {
    const { data } = await axios.get(`${DEXSCREENER}/search?q=${address}%20chain:pulsechain`, { timeout: 8000 });
    return usdForTokenFromPairs(address, data?.pairs || []);
  } catch { return 0; }
}

// ---------- Public API ----------
export async function getPLSBalance(address) {
  try {
    const { data } = await axios.get(
      `${BASE_V1}?module=account&action=balance&address=${address}`,
      { timeout: 10000 }
    );
    return fromUnits(data?.result || '0', 18);
  } catch { return 0; }
}

// Internal: live fetch with all enrichments (no cache)
async function fetchPulsechainTokensLive(address) {
  // 1) balances (Blockscout)
  let tokens = [];
  try { tokens = await fetchTokensV2(address); } catch {}
  if (!tokens.length) {
    try { tokens = await fetchTokensGraphQL(address); } catch {}
  }

  // 2) native PLS priced from WPLS basket
  const [plsBal, plsUsd] = await Promise.all([getPLSBalance(address), getPLSPriceUSD()]);
  const plsNative = {
    chain: 'pulse',
    address: 'native',
    symbol: 'PLS',
    name: 'PulseChain (native)',
    decimals: 18,
    balance: plsBal,
    price: plsUsd || 0,
    priceSource: plsUsd > 0 ? 'dex(wpls)' : 'none',
    value: plsBal * (plsUsd || 0),
    iconUrl: null
  };

  // 3) Fill missing via Blockscout
  tokens = await fillMissingFromBlockscout(tokens);

  // 4) Dexscreener fallback
  try {
    const needs = tokens.filter(t => (!t.price || t.price === 0) && t.address).map(t => t.address);
    if (needs.length) {
      const ds = await dexPricesForBatch(needs);
      const still = needs.filter(a => !ds[a.toLowerCase()]);
      for (let i = 0; i < Math.min(still.length, 12); i += 1) {
        const a = still[i];
        const p = await dexPriceForSingle(a);
        if (p > 0) ds[a.toLowerCase()] = p;
      }
      tokens = tokens.map(t => {
        if (t.price && t.price > 0) return t;
        const p = ds[t.address?.toLowerCase()] || 0;
        return { ...t, price: p, priceSource: p > 0 ? 'dex' : 'none', value: t.balance * (p || 0) };
      });
    }
  } catch {}

  // 5) Final rows: native PLS stays; hide teensy values
  const all = [plsNative, ...tokens];
  const rows = all.filter((t, i) => i === 0 || ((t?.value ?? 0) > HIDE_USD_MIN + 1e-12));

  if (DEBUG) {
    const tot = all.reduce((s, t) => s + (t.value || 0), 0);
    const totShown = rows.reduce((s, t) => s + (t.value || 0), 0);
    console.log('[PulseChain] total USD (all)', tot, 'shown', totShown, 'threshold', HIDE_USD_MIN);
  }
  return rows;
}

// External: cached entry point
export async function fetchPulsechainTokens(address, opts = {}) {
  const key = `pls:tokens:${(address || '').toLowerCase()}`;
  if (!opts.force) {
    const hit = getCachedJSON(key, CACHE_TTL_MS);
    if (hit?.data) return hit.data; // ✅ serve from cache
  }
  const fresh = await fetchPulsechainTokensLive(address);
  setCachedJSON(key, fresh);
  return fresh;
}

// Optional helper you can call when hitting your manual Refresh button
export async function refreshPulsechainTokens(address) {
  const fresh = await fetchPulsechainTokensLive(address);
  setCachedJSON(`pls:tokens:${(address || '').toLowerCase()}`, fresh);
  return fresh;
}
