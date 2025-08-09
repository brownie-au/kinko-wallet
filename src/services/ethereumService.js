// src/services/ethereumService.js
// Ethereum (mainnet): balances (Ethplorer), prices (Coinbase/Coingecko for ETH, Dexscreener for ERC-20), with caching.

import axios from 'axios';
import { getCachedJSON, setCachedJSON } from '../utils/kinkoCache';

const ETHPLORER     = 'https://api.ethplorer.io';
const ETHPLORER_KEY = 'freekey'; // public, no signup
const DEXSCREENER   = 'https://api.dexscreener.com/latest/dex';

const STABLES = new Set(['USDC','USDT','DAI','FDUSD','TUSD','USDD','USDP']);
const HIDE_USD_MIN = Number(import.meta.env.VITE_ETH_HIDE_USD_MIN ?? 0.01);
const CACHE_TTL_MS = Number(import.meta.env.VITE_WALLET_CACHE_TTL_MIN ?? 10) * 60_000;
const DEBUG = !!import.meta.env.VITE_ETH_DEBUG;

// ---------- helpers ----------
const fromUnits = (v, d = 18) => {
  if (v == null) return 0;
  const s = typeof v === 'bigint' ? v.toString() : String(v);
  return Number(s) / Math.pow(10, Number(d || 18));
};

const liq = (p) => Number(p?.liquidity?.usd || 0);

// restrict to ethereum and to a specific token’s pairs
function filterEthPairsForToken(addr, pairs) {
  const a = (addr || '').toLowerCase();
  return (pairs || [])
    .filter(p => (p?.chainId || '').toLowerCase() === 'ethereum')
    .filter(p =>
      (p?.baseToken?.address || '').toLowerCase() === a ||
      (p?.quoteToken?.address || '').toLowerCase() === a
    );
}

// liquidity‑weighted USD price for a token from a bundle of pairs
function usdForTokenFromPairs(addr, pairs) {
  const a = (addr || '').toLowerCase();
  const mine = filterEthPairsForToken(a, pairs);
  if (!mine.length) return 0;

  // prefer stable pairs
  const stable = mine.filter(p => {
    const isBase = (p?.baseToken?.address || '').toLowerCase() === a;
    const otherSym = isBase ? p?.quoteToken?.symbol : p?.baseToken?.symbol;
    return STABLES.has((otherSym || '').toUpperCase());
  });

  const src = (stable.length ? stable : mine)
    .map(p => {
      const isBase = (p?.baseToken?.address || '').toLowerCase() === a;
      const baseUsd = Number(p?.priceUsd || 0);     // price of base token in USD provided by Dexscreener
      const ratio   = Number(p?.price ?? 0);        // base/quote price ratio
      // If the token is quote, invert using ratio
      const usd = isBase ? baseUsd : (baseUsd && ratio ? baseUsd / ratio : 0);
      return { usd, liq: liq(p) };
    })
    .filter(x => x.usd > 0 && x.liq > 0);

  if (!src.length) return 0;
  const num = src.reduce((s, r) => s + r.usd * r.liq, 0);
  const den = src.reduce((s, r) => s + r.liq, 0);
  return den > 0 ? num / den : 0;
}

// ---------- Native ETH price (robust) ----------
export async function getETHPriceUSD() {
  // 1) Coinbase spot
  try {
    const { data } = await axios.get('https://api.coinbase.com/v2/prices/ETH-USD/spot', { timeout: 8000 });
    const p = Number(data?.data?.amount || 0);
    if (p > 500 && p < 10000) return p;
  } catch {}

  // 2) CoinGecko simple/price
  try {
    const { data } = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd', { timeout: 8000 });
    const p = Number(data?.ethereum?.usd || 0);
    if (p > 500 && p < 10000) return p;
  } catch {}

  // 3) last ditch: 0
  return 0;
}

// ---------- Ethplorer (balances) ----------
async function fetchEthplorerAddressInfo(address) {
  const url = `${ETHPLORER}/getAddressInfo/${address}?apiKey=${ETHPLORER_KEY}`;
  const { data } = await axios.get(url, { timeout: 12000 });
  return data || {};
}

export async function getETHNativeBalance(address) {
  try {
    const info = await fetchEthplorerAddressInfo(address);
    return Number(info?.ETH?.balance || 0);
  } catch { return 0; }
}

// ---------- Dexscreener ERC-20 pricing ----------
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
    const { data } = await axios.get(`${DEXSCREENER}/search?q=${address}%20chain:ethereum`, { timeout: 8000 });
    return usdForTokenFromPairs(address, data?.pairs || []);
  } catch { return 0; }
}

// ---------- Public API: fetch & cache ----------
async function fetchEthereumTokensLive(address) {
  // 1) balances via Ethplorer
  let baseList = [];
  try {
    const info = await fetchEthplorerAddressInfo(address);
    const ethBal = Number(info?.ETH?.balance || 0);
    // Token balances
    const tokens = Array.isArray(info?.tokens) ? info.tokens : [];

    baseList = tokens.map(t => {
      const tk   = t?.tokenInfo || {};
      const dec  = Number(tk?.decimals || 18);
      const bal  = fromUnits(t?.balance || '0', dec);
      // Ethplorer sometimes includes a price snapshot; treat it as hint only
      const hint = Number(tk?.price?.rate || 0);

      return {
        chain: 'eth',
        address: (tk?.address || '').toLowerCase(),
        symbol: tk?.symbol || '',
        name: tk?.name || '',
        decimals: dec,
        balance: bal,
        price: hint > 0 ? hint : 0,
        priceSource: hint > 0 ? 'ethplorer' : 'none',
        value: bal * (hint > 0 ? hint : 0),
        iconUrl: null
      };
    });

    // 2) native ETH
    const ethUsd = await getETHPriceUSD();
    const native = {
      chain: 'eth',
      address: 'native',
      symbol: 'ETH',
      name: 'Ethereum (native)',
      decimals: 18,
      balance: ethBal,
      price: ethUsd,
      priceSource: ethUsd > 0 ? 'coinbase/coingecko' : 'none',
      value: ethBal * (ethUsd || 0),
      iconUrl: null
    };

    // 3) price enrichment for ERC-20s with 0 price using Dexscreener (ethereum only)
    const needs = baseList.filter(t => !t.price && t.address).map(t => t.address);
    if (needs.length) {
      const batch = await dexPricesForBatch(needs);
      const still = needs.filter(a => !batch[a.toLowerCase()]);
      for (let i = 0; i < Math.min(still.length, 12); i += 1) {
        const a = still[i];
        const p = await dexPriceForSingle(a);
        if (p > 0) batch[a.toLowerCase()] = p;
      }
      baseList = baseList.map(t => {
        if (t.price && t.price > 0) return t;
        const p = batch[t.address?.toLowerCase()] || 0;
        return {
          ...t,
          price: p,
          priceSource: p > 0 ? 'dex' : t.priceSource,
          value: t.balance * (p || 0)
        };
      });
    }

    // 4) hide dust
    const all = [native, ...baseList];
    return all.filter((t, i) => i === 0 || ((t?.value ?? 0) > HIDE_USD_MIN + 1e-12));
  } catch (e) {
    if (DEBUG) console.warn('[Ethereum] fetch failed', e?.message);
    return [];
  }
}

// Cached entry points
export async function fetchEthereumTokens(address, opts = {}) {
  const key = `eth:tokens:${(address || '').toLowerCase()}`;
  if (!opts.force) {
    const hit = getCachedJSON(key, CACHE_TTL_MS);
    if (hit?.data) return hit.data;
  }
  const fresh = await fetchEthereumTokensLive(address);
  setCachedJSON(key, fresh);
  return fresh;
}

export async function refreshEthereumTokens(address) {
  const fresh = await fetchEthereumTokensLive(address);
  setCachedJSON(`eth:tokens:${(address || '').toLowerCase()}`, fresh);
  return fresh;
}
