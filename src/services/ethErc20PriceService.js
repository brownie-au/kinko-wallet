// src/services/ethErc20PriceService.js
// ERC-20 USD pricing via Dexscreener (best-liquidity) + metadata backfill,
// but **restricted to Ethereum pairs only**. Ethplorer token-info fallback (capped), cached 24h.

import axios from 'axios';

const DEX = 'https://api.dexscreener.com/latest/dex';
const CHUNK = 30;

// Cache TTLS
const TTL_MS_PRICE = 2 * 60 * 1000;       // 2 min for prices
const TTL_MS_META  = 24 * 60 * 60 * 1000; // 24h for token metadata

// Bump namespace to drop any old cross-chain prices
const NS_PRICE = 'kw:v2:eth:erc20:price:'; // <-- bumped
const NS_META  = 'kw:eth:erc20:meta:';

const ETHPLORER = 'https://api.ethplorer.io';
const ETHPLORER_KEY = import.meta.env.VITE_ETHPLORER_KEY || 'freekey';

// Don’t hammer Ethplorer: cap per refresh
const MAX_META_LOOKUPS = 10;

// Price only from Ethereum
const ALLOWED_CHAINS = new Set(['ethereum']);

const STABLES = new Set(['USDC', 'USDT', 'DAI', 'FDUSD', 'TUSD', 'USDD', 'USDP', 'LUSD', 'USDE']);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

function getCached(ns, key, ttl) {
  try {
    const raw = localStorage.getItem(ns + key);
    if (!raw) return null;
    const { v, t } = JSON.parse(raw);
    if (Date.now() - t < ttl) return v;
  } catch {}
  return null;
}
function setCached(ns, key, v) {
  try { localStorage.setItem(ns + key, JSON.stringify({ v, t: Date.now() })); } catch {}
}

async function fetchBatch(addresses) {
  // Returns Map(addr -> { price, liq, symbol, name })
  const out = new Map();
  if (!addresses.length) return out;

  try {
    const url = `${DEX}/tokens/${addresses.join(',')}`;
    const { data } = await axios.get(url, { timeout: 12000 });

    for (const p of data?.pairs || []) {
      // **** restrict to Ethereum only
      if (!ALLOWED_CHAINS.has(p?.chainId)) continue;

      const addr = (p?.baseToken?.address || '').toLowerCase();
      const price = num(p?.priceUsd, 0);
      const liq = num(p?.liquidity?.usd, 0);
      if (!addr || price <= 0) continue;

      const sy = p?.baseToken?.symbol || '';
      const nm = p?.baseToken?.name || '';

      const prev = out.get(addr);
      if (!prev || liq > prev.liq) out.set(addr, { price, liq, symbol: sy, name: nm });
    }
  } catch (e) {
    console.warn('[ETH][prices] Dexscreener batch failed:', e?.message || e);
  }
  return out;
}

async function fetchTokenMetaEthplorer(addr) {
  try {
    const url = `${ETHPLORER}/getTokenInfo/${addr}?apiKey=${ETHPLORER_KEY}`;
    const { data } = await axios.get(url, { timeout: 8000 });
    const symbol = data?.symbol || '';
    const name = data?.name || '';
    const decimals = Number(data?.decimals ?? 0);
    return { symbol, name, decimals: Number.isFinite(decimals) ? decimals : undefined };
  } catch {
    return null;
  }
}

// Mutates token array in-place; returns the same array.
export async function enrichErc20Prices(tokens) {
  if (!Array.isArray(tokens) || !tokens.length) return tokens;

  const erc20 = tokens.filter(
    (t) => t.chain === 'eth' && t.address && t.address !== 'native' && t.balance > 0
  );
  if (!erc20.length) return tokens;

  // 1) Peg stables
  for (const t of erc20) {
    if (STABLES.has((t.symbol || '').toUpperCase())) {
      t.priceUSD = 1;
      t.price = 1;
      t.usd = num(t.balance, 0) * 1;
    }
  }

  // 2) Prices from cache; collect addresses we still need
  const need = [];
  for (const t of erc20) {
    const addr = t.address.toLowerCase();
    if (!t.priceUSD && !t.price) {
      const cached = getCached(NS_PRICE, addr, TTL_MS_PRICE);
      if (cached && cached > 0) {
        t.priceUSD = cached;
        t.price = cached;
        t.usd = num(t.balance, 0) * cached;
      } else {
        need.push(addr);
      }
    }
  }

  // 3) Batch fetch missing via Dexscreener (Ethereum only), also backfill symbol/name
  if (need.length) {
    const uniq = Array.from(new Set(need));
    for (let i = 0; i < uniq.length; i += CHUNK) {
      const group = uniq.slice(i, i + CHUNK);
      const bestMap = await fetchBatch(group);

      for (const addr of group) {
        const best = bestMap.get(addr);
        if (best && best.price > 0) {
          setCached(NS_PRICE, addr, best.price);
          for (const t of erc20) {
            if (t.address.toLowerCase() !== addr) continue;
            if (!t.priceUSD || !t.price) {
              t.priceUSD = best.price;
              t.price = best.price;
              t.usd = num(t.balance, 0) * best.price;
            }
            if (!t.symbol && best.symbol) t.symbol = best.symbol;
            if (!t.name && best.name) t.name = best.name;
          }
        }
      }
    }
  }

  // 4) Final metadata backfill (capped) via Ethplorer
  let lookups = 0;
  for (const t of erc20) {
    if ((t.symbol && t.name) || lookups >= MAX_META_LOOKUPS) continue;

    const addr = t.address.toLowerCase();
    const cached = getCached(NS_META, addr, TTL_MS_META);
    let meta = cached;
    if (!meta) {
      meta = await fetchTokenMetaEthplorer(addr);
      if (meta) setCached(NS_META, addr, meta);
      lookups++;
    }
    if (meta) {
      if (!t.symbol && meta.symbol) t.symbol = meta.symbol;
      if (!t.name && meta.name) t.name = meta.name;
      if (t.decimals === 0 && Number.isFinite(meta.decimals) && meta.decimals > 0) {
        t.decimals = meta.decimals;
        if (t.price || t.priceUSD) t.usd = num(t.balance, 0) * (t.price || t.priceUSD || 0);
      }
    }
  }

  return tokens;
}
