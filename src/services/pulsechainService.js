import { discoverBlockscoutTokens } from './blockscoutDiscovery.js';
import { formatTokenUnits } from '../utils/tokenMath.js';
// src/services/pulsechainService.js
// PulseChain: Blockscout (balances + icons + prices) first, Dexscreener as fallback, with caching.

import { isTokenBlacklisted } from '../data/tokenBlocklist';
import axios from 'axios';
import { getCachedJSON, setCachedJSON } from '../utils/kinkoCache';

const BASE_V2 = import.meta.env.VITE_PLS_BLOCKSCOUT_V2 || 'https://api.scan.pulsechain.com/api/v2';
const BASE_V1 = import.meta.env.VITE_PLS_BLOCKSCOUT_V1 || 'https://api.scan.pulsechain.com/api';
const GRAPHQL = import.meta.env.VITE_PLS_BLOCKSCOUT_GRAPHQL || 'https://api.scan.pulsechain.com/graphql';
const DEXSCREENER = 'https://api.dexscreener.com/latest/dex';

const WPLS_ADDR = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27'; // Wrapped PLS (pricing anchor)
const STABLES = new Set(['USDC', 'USDT', 'DAI', 'USDL', 'pDAI', 'USDC.E']);
const DEBUG = !!import.meta.env.VITE_PLS_DEBUG;

// hide tokens with value <= this amount (you added this earlier)
const HIDE_USD_MIN = Number(import.meta.env.VITE_PLS_HIDE_USD_MIN ?? 0.01);

// ⏱ cache TTL (minutes). Default 10.
const CACHE_TTL_MS = Number(import.meta.env.VITE_WALLET_CACHE_TTL_MIN ?? 10) * 60000;

const fromUnits = (v, d = 18) => {
  if (!v && v !== 0) return 0;
  const s = typeof v === 'bigint' ? v.toString() : String(v);
  return Number(formatTokenUnits(s, d));
};

const liq = (p) => Number(p?.liquidity?.usd || 0);
const toFinite = (value) => {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

// ---------- price helpers ----------
function filterPulsePairsForToken(addr, pairs) {
  const a = (addr || '').toLowerCase();
  return (pairs || [])
    .filter((p) => p?.chainId === 'pulsechain')
    .filter((p) => (p?.baseToken?.address || '').toLowerCase() === a || (p?.quoteToken?.address || '').toLowerCase() === a);
}
function dexMetaForTokenFromPairs(addr, pairs) {
  const a = (addr || '').toLowerCase();
  const mine = filterPulsePairsForToken(a, pairs);
  if (!mine.length) return { price: 0, change24hPct: null };
  const stable = mine.filter((p) => {
    const isBase = (p?.baseToken?.address || '').toLowerCase() === a;
    const otherSym = isBase ? p?.quoteToken?.symbol : p?.baseToken?.symbol;
    return STABLES.has((otherSym || '').toUpperCase());
  });
  const sample = (stable.length ? stable : mine)
    .map((p) => {
      const isBase = (p?.baseToken?.address || '').toLowerCase() === a;
      const baseUsd = Number(p?.priceUsd || 0);
      const ratio = Number(p?.price ?? 0);
      const usd = isBase ? baseUsd : baseUsd && ratio ? baseUsd / ratio : 0;
      const liqUsd = liq(p);
      const changeCandidates = [
        p?.priceChange?.h24,
        p?.priceChange?.H24,
        p?.priceChange?.['h24'],
        p?.priceChange24h,
        p?.priceChangePercent24h,
        p?.priceChange24hPercent,
        p?.priceChangePercentage24h
      ];
      let pct = null;
      for (const cand of changeCandidates) {
        const num = toFinite(cand);
        if (num != null) {
          pct = num;
          break;
        }
      }
      if (pct == null) {
        const prevPrice = toFinite(p?.price24h ?? p?.info?.price24h);
        if (prevPrice != null && usd > 0) {
          const derived = ((usd - prevPrice) / prevPrice) * 100;
          if (Number.isFinite(derived)) pct = derived;
        }
      }
      return { usd, liq: liqUsd, change: pct };
    })
    .filter((x) => x.usd > 0 && x.liq > 0);
  if (!sample.length) return { price: 0, change24hPct: null };
  const priceNum = sample.reduce((s, r) => s + r.usd * r.liq, 0);
  const priceDen = sample.reduce((s, r) => s + r.liq, 0);
  const price = priceDen > 0 ? priceNum / priceDen : 0;
  const changeEntries = sample.filter((x) => x.change != null);
  let change24hPct = null;
  if (changeEntries.length) {
    const changeNum = changeEntries.reduce((s, r) => s + r.change * r.liq, 0);
    const changeDen = changeEntries.reduce((s, r) => s + r.liq, 0);
    if (changeDen > 0) change24hPct = changeNum / changeDen;
  }
  return { price, change24hPct };
}

function usdForTokenFromPairs(addr, pairs) {
  return dexMetaForTokenFromPairs(addr, pairs).price;
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
    const p = cands.find((x) => Number.isFinite(x) && x > 0 && x < 1);
    if (p) return p;
  } catch {}
  try {
    const { data } = await axios.get(`${BASE_V1}?module=stats&action=coinprice`, { timeout: 8000 });
    const r = data?.result || data;
    const cands = [r?.usd, r?.USD, r?.ethusd, r?.price, r?.usdPrice].map(Number);
    const p = cands.find((x) => Number.isFinite(x) && x > 0 && x < 1);
    if (p) return p;
  } catch {}
  return 0;
}

// ---------- Blockscout token lists ----------
async function fetchTokensV2(address) {
  const tokens = await discoverBlockscoutTokens(BASE_V2, address);
  return tokens.map((t) => ({
    ...t,
    chain: 'pulse',
    amountExact: formatTokenUnits(t.balanceRaw, t.decimals),
    balance: fromUnits(t.balanceRaw, t.decimals),
    price: t.priceUsd || 0,
    priceSource: t.priceUsd > 0 ? 'blockscout' : 'none',
    value: fromUnits(t.balanceRaw, t.decimals) * (t.priceUsd || 0)
  }));
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
  if (data?.errors || !data?.data?.address) throw new Error('PulseChain discovery unavailable');
  const rows = data.data.address.tokenBalances || [];
  return rows.map((row) => {
    const t = row.token || {};
    const decimals = Number(t.decimals ?? 18);
    const balance = fromUnits(row.value || '0', decimals);
    const exRate = Number(t.exchange_rate || 0);
    return {
      chain: 'pulse',
      address: t.address,
      symbol: t.symbol || '',
      name: t.name || '',
      decimals,
      balance,
      amountExact: formatTokenUnits(row.value || '0', decimals),
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
// limited parallel fill to reduce latency without hammering
async function fillMissingFromBlockscout(tokens) {
  const needs = tokens.filter((t) => (!t.price || t.price === 0) && t.address).slice(0, 12);
  const limit = 6;
  let i = 0;
  const workers = new Array(Math.min(limit, needs.length)).fill(0).map(async () => {
    for (; i < needs.length; ) {
      const idx = i++;
      const t = needs[idx];
      try {
        const meta = await fetchTokenMetaFromBlockscout(t.address);
        if (meta.price > 0 || meta.iconUrl) {
          t.price = meta.price || t.price;
          t.priceSource = meta.price > 0 ? 'blockscout' : t.priceSource;
          t.iconUrl = t.iconUrl || meta.iconUrl;
          t.value = t.balance * (t.price || 0);
        }
      } catch {
        /* ignore */
      }
    }
  });
  await Promise.all(workers);
  return tokens;
}

// ---------- Dexscreener PRC-20 price enrichment ----------
async function dexPricesForBatch(addresses) {
  const out = {};
  const uniq = [...new Set((addresses || []).map((a) => (a || '').toLowerCase()))].filter(Boolean);
  const chunk = 25;
  for (let i = 0; i < uniq.length; i += chunk) {
    const batch = uniq.slice(i, i + chunk);
    try {
      const { data } = await axios.get(`${DEXSCREENER}/tokens/${batch.join(',')}`, { timeout: 12000 });
      const pairs = data?.pairs || [];
      for (const addr of batch) {
        const meta = dexMetaForTokenFromPairs(addr, pairs);
        if (meta.price > 0 || meta.change24hPct != null) {
          out[addr.toLowerCase()] = { ...meta, source: 'dexscreener' };
        }
      }
    } catch {}
  }
  return out;
}
// ---------- Public API ----------
export async function getPLSBalanceExact(address) {
  try {
    const { data } = await axios.get(`${BASE_V1}?module=account&action=balance&address=${address}`, { timeout: 10000 });
    if (data?.status !== '1' || !/^\d+$/.test(String(data.result))) throw new Error('Invalid PLS balance');
    return formatTokenUnits(data.result, 18);
  } catch {
    throw new Error('PulseChain native balance unavailable');
  }
}

export async function getPLSBalance(address) {
  return Number(await getPLSBalanceExact(address));
}

// Internal: live fetch with all enrichments (no cache)
async function fetchPulsechainTokensLive(address) {
  // 1) balances (Blockscout)
  let tokens;
  try {
    tokens = await fetchTokensV2(address);
  } catch {
    tokens = await fetchTokensGraphQL(address);
  }

  // 🚫 remove spam contracts early
  tokens = tokens.filter(
    (t) => !isTokenBlacklisted(t) && !t.possible_spam && !/https?:\/\/|www\.|claim rewards|connect wallet/i.test(`${t.name} ${t.symbol}`)
  );

  // 2) native PLS priced from WPLS basket
  const [plsAmountExact, plsUsd] = await Promise.all([getPLSBalanceExact(address), getPLSPriceUSD()]);
  const plsBal = Number(plsAmountExact);
  const plsNative = {
    chain: 'pulse',
    address: 'native',
    symbol: 'PLS',
    name: 'PulseChain (native)',
    decimals: 18,
    balance: plsBal,
    amountExact: plsAmountExact,
    price: plsUsd || 0,
    priceSource: plsUsd > 0 ? 'dex(wpls)' : 'none',
    value: plsBal * (plsUsd || 0),
    iconUrl: null
  };

  // 3) Fill missing via Blockscout
  tokens = await fillMissingFromBlockscout(tokens);

  // 4) Dexscreener fallback
  try {
    const contractAddrs = tokens
      .filter((t) => t.address)
      .slice(0, 100)
      .map((t) => t.address);
    if (contractAddrs.length) {
      const ds = await dexPricesForBatch(contractAddrs);
      tokens = tokens.map((t) => {
        const addrLower = (t.address || '').toLowerCase();
        const meta = addrLower ? ds[addrLower] : null;
        const metaSource = meta?.source || 'dexscreener';
        const patch = {};

        if (!(Number(t.price) > 0)) {
          const priceMeta = meta ? Number(meta.price) || 0 : 0;
          patch.price = priceMeta;
          patch.priceSource = priceMeta > 0 ? metaSource : t.priceSource || 'none';
          patch.value = t.balance * (priceMeta || 0);
        }

        const metaPct = toFinite(meta?.change24hPct);
        const existingPct = [t.change24hPct, t.pctChange24h, t.priceChange24hPct, t.price_change_pct_24h, t.price_change_24h_pct]
          .map(toFinite)
          .find((v) => v != null);

        const finalPct = metaPct ?? existingPct;
        if (finalPct != null) {
          patch.change24hPct = finalPct;
          patch.pctChange24h = finalPct;
          patch.priceChange24hPct = finalPct;
          patch.changeSource = metaSource;
        } else if (existingPct != null) {
          patch.changeSource = t.changeSource || t.priceSource || null;
        }

        if (!patch.priceSource && t.priceSource) patch.priceSource = t.priceSource;
        return Object.keys(patch).length ? { ...t, ...patch } : t;
      });
    }
  } catch {}
  // 5) Final rows: native PLS stays; hide teensy values
  const all = [plsNative, ...tokens];
  const rows = all; // Presentation filters must not erase unpriced holdings.

  if (DEBUG) {
    const tot = all.reduce((s, t) => s + (t.value || 0), 0);
    const totShown = rows.reduce((s, t) => s + (t.value || 0), 0);
    console.log('[PulseChain] total USD (all)', tot, 'shown', totShown, 'threshold', HIDE_USD_MIN);
  }
  return rows;
}

// External: cached entry point
export async function fetchPulsechainTokens(address, opts = {}) {
  const key = `pls:tokens:v2:${(address || '').toLowerCase()}`;
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
  setCachedJSON(`pls:tokens:v2:${(address || '').toLowerCase()}`, fresh);
  return fresh;
}
