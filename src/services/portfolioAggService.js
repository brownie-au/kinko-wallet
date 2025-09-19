// src/services/portfolioAggService.js
// 24h change (DexScreener batch for contract tokens)
import { fetchChange24hFromDexScreener, tokenKey as changeKey } from './change24hService';
// Aggregates balances across wallets/chains and returns totals + breakdown.
import { fetchPulsechainTokens, refreshPulsechainTokens } from './pulsechainService';
// Keep ethereumService import ONLY if you still want legacy backfill elsewhere.
// We won't use it for prices here.
import { fetchEthereumTokens, refreshEthereumTokens } from './ethereumService';
// Base via Blockscout + DefiLlama (no Moralis)
import { getBaseTokensFromBlockscout, toUnits as toUnitsBase } from './baseBlockscoutService';
import { getPolygonTokensFromBlockscout, toUnits as toUnitsPolygon } from './polygonBlockscoutService';
import { getBaseTokenPricesLlama, getBaseUsdPriceLlama, getBscTokenPricesLlama, getBscUsdPriceLlama, getPolygonTokenPricesLlama, getPolygonUsdPriceLlama } from './priceService';
import { getBaseNativeBalance } from './baseRpcService';
import { getPolygonNativeBalance } from './polygonRpcService';
import { isTokenBlacklisted } from '../data/tokenBlocklist';
// 🚫 Moralis/Alchemy-free ETH discovery via Blockscout
import { getEthTokensFromBlockscout, toUnits } from './ethBlockscoutService';
// Read native ETH balance via public RPCs from .env (no API keys)
import { getEthNativeBalance } from './ethRpcService';
// DefiLlama prices (no API key)
import { getEthTokenPricesLlama, getEthUsdPriceLlama } from './priceService';
// BSC via NodeReal discovery + Llama prices + RPC for native
import { getBscTokensFromNodereal, toUnitsBsc } from './bscNoderealService';
import { getBscNativeBalance } from './bscRpcService';

// ----- toggles -----
const USE_ETH_PRICE_BACKFILL = false; // we use DefiLlama now

// Visibility threshold (USD).
// Requirement: only the Value (USD) column determines visibility.
// Default 0.02 if not set.
const HIDE_USD_MIN = Number(
  import.meta.env.VITE_PORTFOLIO_HIDE_USD_MIN ??
  import.meta.env.VITE_HIDE_USD_MIN ??
  0.02
);

const tokenKey = (t) => `${t.chain}:${t.address || 'native'}:${(t.symbol || '').toUpperCase()}`;
const toFiniteNumber = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const pickChangePct = (src) => {
  if (!src) return null;
  const candidates = [
    src.pctChange24h,
    src.change24hPct,
    src.priceChange24hPct,
    src.price_change_pct_24h,
    src.price_change_24h_pct
  ];
  for (const cand of candidates) {
    const num = toFiniteNumber(cand);
    if (num != null) return num;
  }
  return null;
};

const normalizePriceMeta = (meta, fallbackSource = 'defillama') => {
  if (meta && typeof meta === 'object') {
    const price = Number(meta.price ?? meta.usd ?? meta.value ?? 0) || 0;
    return {
      price,
      change24hPct: toFiniteNumber(meta.change24hPct ?? meta.pctChange24h ?? meta.change24h),
      source: meta.source || fallbackSource
    };
  }
  const price = Number(meta) || 0;
  return { price, change24hPct: null, source: fallbackSource };
};

function toRow(sr, wallet) {
  // Normalize a variety of upstream shapes into the aggregator row.
  // Important: Ethereum cache (ethereumService -> DataClient) uses `usd` and `priceUSD` keys.
  //            Previously we ignored `usd`, causing 0-value rows and the ETH pill to look empty.
  const price = Number(
    sr.price ?? sr.priceUsd ?? sr.priceUSD ?? sr.usdPrice ?? sr.usd_price ?? 0
  );
  const value = Number(
    sr.value ?? sr.valueUsd ?? sr.usd ?? sr.usd_value ?? 0
  );
  const changePct = pickChangePct(sr);
  return {
    chain: (sr.chain || '').toLowerCase(), // 'pulse' | 'eth' | 'base'
    wallet,                                 // wallet address
    address: sr.address === 'native' ? null : (sr.address || sr.contract || null),
    symbol: sr.symbol || '',
    name: sr.name || '',
    // pass through description for spam filter
    description: sr.description || '',
    decimals: Number(sr.decimals ?? 18),
    amount: Number(sr.balance ?? sr.amount ?? 0),
    priceUsd: price,
    priceSource: sr.priceSource || null,
    changeSource: sr.changeSource || sr.priceSource || null,
    valueUsd: value,
    change24hPct: changePct,
    pctChange24h: changePct,
    priceChange24hPct: changePct
  };
}
/* ────────────────────────────────────────────────────────────────────────────
   SPAM FILTER
   - Hides tokens whose name/symbol/description contains a URL *or* a domain-like string.
   - Examples caught: "claim rewards on earn-eth.com", "pepefinance.org", "stake-eth.net"
   - Safe allowlist for rare legit dotted symbols (adjust as needed).
──────────────────────────────────────────────────────────────────────────── */
const ALLOWLIST_SUBSTRINGS = [
  // add any legit dotted symbols here (lowercase)
  'usdc.e'
];

const DOMAIN_RE = /\b(?:[a-z0-9-]{2,}\.)+[a-z]{2,24}\b/i;
const URL_MARKERS = ['http://', 'https://', 'www.'];
const SPAM_PHRASES = [
  'claim rewards', 'airdrop', 'bonus', 'free', 'mint now', 'verify', 'AICC - AI Chain Coin', 'connect wallet'
];

function isSpamToken(t) {
  const name = (t.name || '').toLowerCase();
  const symbol = (t.symbol || '').toLowerCase();
  const desc = (t.description || '').toLowerCase();
  const hay = `${name} ${symbol} ${desc}`;

  // allowlist early exit
  for (const ok of ALLOWLIST_SUBSTRINGS) {
    if (name.includes(ok) || symbol.includes(ok)) return false;
  }

  if (URL_MARKERS.some(m => hay.includes(m))) return true;
  if (DOMAIN_RE.test(hay)) return true;
  if (SPAM_PHRASES.some(p => hay.includes(p))) return true;

  return false;
}

// Map Moralis result (used for Base) into token rows
function rowsFromMoralis(address, chainCode, res) {
  const out = [];
  if (!res) return out;

  const price = (x) => Number(x?.priceUsd ?? x?.price ?? 0);
  const value = (amt, p) => (Number(xorZero(amt)) * Number(xorZero(p)));
  const xorZero = (v) => Number(v || 0);

  // native first
  if (res.native) {
    out.push(
      toRow(
        {
          chain: chainCode,
          address: 'native',
          symbol: res.native.symbol || (chainCode === 'base' ? 'ETH' : 'NATIVE'),
          name: res.native.name || (chainCode === 'base' ? 'Ethereum' : 'Native'),
          amount: xorZero(res.native.amount),
          priceUsd: price(res.native),
          valueUsd: Number(res.native.valueUsd ?? res.native.value ?? value(res.native.amount, price(res.native)))
        },
        address
      )
    );
  }

  // tokens
  (res.tokens || []).forEach((t) => {
    const p = price(t);
    const amt = xorZero(t.amount);
    out.push(
      toRow(
        {
          chain: chainCode,
          // Moralis wrapper returns `contract` for ERC-20 address
          // but allow `address` fallback just in case
          address: t.contract || t.address,
          symbol: t.symbol,
          name: t.name || t.symbol || 'Token',
          amount: amt,
          priceUsd: p,
          valueUsd: Number(t.valueUsd ?? t.value ?? (amt * p))
        },
        address
      )
    );
  });

  return out;
}

/**
 * Build portfolio view.
 * @param {Array<{address:string, name?:string}>} wallets
 * @param {{ only?: 'all'|'auto'|'pulse'|'eth'|'base', force?: boolean }} options
 * @returns {{ totalUsd:number, tokens:Array, breakdown:Map<string, Array> }}
 */
// tiny concurrency helper (limit parallel wallet processing)
async function mapWithLimit(items, limit, fn) {
  const results = new Array(items.length);
  let idx = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    for (; idx < items.length;) {
      const i = idx++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function buildPortfolioDetailed(wallets = [], options = {}) {
  const only = (options.only || 'all').toLowerCase(); // 'all' | 'auto' | 'pulse' | 'eth' | 'base' | 'bsc' | 'polygon'
  const force = !!options.force;

  const wantPulse = (only === 'all' || only === 'auto' || only === 'pulse');
  const wantEth = (only === 'all' || only === 'auto' || only === 'eth');
  const wantBase = (only === 'all' || only === 'auto' || only === 'base');
  const wantBsc  = (only === 'all' || only === 'auto' || only === 'bsc');
  const wantPolygon  = (only === 'all' || only === 'auto' || only === 'polygon');

  const rows = [];

  // process wallets with limited concurrency
  const perWallet = await mapWithLimit(wallets, 3, async (w) => {
    const addr = w.address;
    const bucket = [];

    const tasks = [];

    if (wantPulse) {
      tasks.push((async () => {
        try {
          const list = force ? await refreshPulsechainTokens(addr) : await fetchPulsechainTokens(addr);
          for (const r of list) bucket.push(toRow(r, addr));
        } catch (e) {
          console.warn('[PortfolioAgg] Pulse fetch failed for', addr, e?.message);
        }
      })());
    }

    if (wantEth) {
      tasks.push((async () => {
        try {
          // 1) Discover ALL ERC-20s via Blockscout (no Moralis/Alchemy)
          const discovered = await getEthTokensFromBlockscout(addr, { cacheMs: 5 * 60 * 1000 });

          // 2) Prices via DefiLlama (native + ERC-20)
          let priceMap = new Map(); // lowercased contract -> { price, change24hPct, source }
          let nativeMeta = normalizePriceMeta(null, 'defillama');
          try {
            const addrs = (discovered || []).map((t) => t.address).filter(Boolean);
            const [nativeRes, pMap] = await Promise.all([
              getEthUsdPriceLlama(),
              getEthTokenPricesLlama(addrs)
            ]);
            nativeMeta = normalizePriceMeta(nativeRes, 'defillama');
            const srcMap = pMap instanceof Map ? pMap : new Map(pMap || []);
            const normalized = new Map();
            for (const [key, meta] of srcMap.entries()) {
              normalized.set(key, normalizePriceMeta(meta, 'defillama'));
            }
            priceMap = normalized;
          } catch (e) {
            console.warn('[PortfolioAgg] Llama price fetch failed for', addr, e?.message);
          }

          // Reliability: legacy backfill when DefiLlama failed to price
          if (priceMap.size === 0) {
            try {
              const legacy = force ? await refreshEthereumTokens(addr) : await fetchEthereumTokens(addr);
              for (const t of Array.isArray(legacy) ? legacy : []) {
                const k = (t.address || t.contract || '').toLowerCase();
                if (k) {
                  const fallbackMeta = {
                    price: Number(t.priceUsd ?? t.price ?? 0) || 0,
                    change24hPct: pickChangePct(t),
                    source: t.priceSource || 'legacy'
                  };
                  priceMap.set(k, normalizePriceMeta(fallbackMeta, fallbackMeta.source));
                }
                if (t.address === 'native') {
                  const legacyPrice = Number(t.priceUsd ?? t.price ?? 0) || 0;
                  if (!toFiniteNumber(nativeMeta.price) && legacyPrice) {
                    const fallbackMeta = {
                      price: legacyPrice,
                      change24hPct: pickChangePct(t),
                      source: t.priceSource || 'legacy'
                    };
                    nativeMeta = normalizePriceMeta(fallbackMeta, fallbackMeta.source);
                  }
                }
              }
            } catch (e) {
              console.warn('[PortfolioAgg] ETH legacy price backfill failed for', addr, e?.message);
            }
          }

          // 3) Native ETH row (real amount via RPC)
          let nativeAmount = 0;
          try { nativeAmount = await getEthNativeBalance(addr); } catch { }
          const nativePrice = toFiniteNumber(nativeMeta.price) || 0;
          const nativePct = toFiniteNumber(nativeMeta.change24hPct);
          const nativeSource = nativePrice > 0 ? (nativeMeta.source || 'defillama') : 'none';
          bucket.push(
            toRow(
              {
                chain: 'eth',
                address: 'native',
                symbol: 'ETH',
                name: 'Ether',
                amount: nativeAmount,
                priceUsd: nativePrice,
                valueUsd: nativePrice ? nativeAmount * nativePrice : 0,
                change24hPct: nativePct,
                pctChange24h: nativePct,
                priceSource: nativeSource,
                changeSource: nativeSource
              },
              addr
            )
          );

          // 4) ERC-20 rows
          for (const t of discovered) {
            const amountUnits = toUnits(t.balanceRaw, Number(t.decimals ?? 18));
            const meta = priceMap.get((t.address || '').toLowerCase());
            const price = meta ? toFiniteNumber(meta.price) || 0 : 0;
            const pct = meta ? toFiniteNumber(meta.change24hPct) : null;
            const source = meta?.source || 'defillama';
            const priceSource = price > 0 ? source : 'none';
            const changeSource = source;
            bucket.push(
              toRow(
                {
                  chain: 'eth',
                  address: t.address,
                  symbol: t.symbol || '',
                  name: t.name || t.symbol || 'Token',
                  decimals: Number(t.decimals ?? 18),
                  amount: amountUnits,
                  priceUsd: price,
                  valueUsd: price ? (amountUnits * price) : 0,
                  change24hPct: pct,
                  pctChange24h: pct,
                  priceSource,
                  changeSource
                },
                addr
              )
            );
          }
        } catch (e) {
          console.warn('[PortfolioAgg] ETH (Blockscout) fetch failed for', addr, e?.message);
        }
      })());
    }

    if (wantBase) {
      tasks.push((async () => {
        try {
          // 1) Discover ERC-20s via Blockscout
          const discovered = await getBaseTokensFromBlockscout(addr);

          // 2) Prices via DefiLlama (Base namespace)
          const addrs = discovered.map((t) => t.address).filter(Boolean);
          const priceMapRaw = await getBaseTokenPricesLlama(addrs);
          const srcMapBase = priceMapRaw instanceof Map ? priceMapRaw : new Map(priceMapRaw || []);
          const priceMap = new Map();
          for (const [key, meta] of srcMapBase.entries()) {
            priceMap.set(key, normalizePriceMeta(meta, 'defillama'));
          }

          // 3) Native ETH on Base
          const nativeMeta = normalizePriceMeta(await getBaseUsdPriceLlama(), 'defillama');
          const nativePrice = toFiniteNumber(nativeMeta.price) || 0;
          const nativePct = toFiniteNumber(nativeMeta.change24hPct);
          const nativeSource = nativePrice > 0 ? (nativeMeta.source || 'defillama') : 'none';
          let nativeAmount = 0;
          try { nativeAmount = await getBaseNativeBalance(addr); } catch { }
          bucket.push(
            toRow(
              {
                chain: 'base',
                address: 'native',
                symbol: 'ETH',
                name: 'Ether',
                amount: nativeAmount,
                priceUsd: nativePrice,
                valueUsd: nativePrice ? nativeAmount * nativePrice : 0,
                change24hPct: nativePct,
                pctChange24h: nativePct,
                priceSource: nativeSource,
                changeSource: nativeSource
              },
              addr
            )
          );

          // 4) ERC-20 rows
          for (const t of discovered) {
            const amountUnits = toUnitsBase(t.balanceRaw, Number(t.decimals ?? 18));
            const meta = priceMap.get((t.address || '').toLowerCase());
            const price = meta ? toFiniteNumber(meta.price) || 0 : 0;
            const pct = meta ? toFiniteNumber(meta.change24hPct) : null;
            const source = meta?.source || 'defillama';
            const priceSource = price > 0 ? source : 'none';
            const changeSource = source;
            bucket.push(
              toRow(
                {
                  chain: 'base',
                  address: t.address,
                  symbol: t.symbol || '',
                  name: t.name || t.symbol || 'Token',
                  decimals: Number(t.decimals ?? 18),
                  amount: amountUnits,
                  priceUsd: price,
                  valueUsd: price ? amountUnits * price : 0,
                  change24hPct: pct,
                  pctChange24h: pct,
                  priceSource,
                  changeSource
                },
                addr
              )
            );
          }
        } catch (e) {
          console.warn('[PortfolioAgg] Base (Blockscout) fetch failed for', addr, e?.message);
        }
      })());
    }

    if (wantPolygon) {
      tasks.push((async () => {
        try {
          // 1) Discover ERC-20s via Blockscout (Polygon)
          const discovered = await getPolygonTokensFromBlockscout(addr);

          // 2) Prices via DefiLlama (Polygon namespace)
          const addrs = discovered.map((t) => t.address).filter(Boolean);
          const priceMapRaw = await getPolygonTokenPricesLlama(addrs);
          const srcMapPolygon = priceMapRaw instanceof Map ? priceMapRaw : new Map(priceMapRaw || []);
          const priceMap = new Map();
          for (const [key, meta] of srcMapPolygon.entries()) {
            priceMap.set(key, normalizePriceMeta(meta, 'defillama'));
          }

          // 3) Native MATIC (Polygon PoS)
          const nativeMeta = normalizePriceMeta(await getPolygonUsdPriceLlama(), 'defillama');
          const nativePrice = toFiniteNumber(nativeMeta.price) || 0;
          const nativePct = toFiniteNumber(nativeMeta.change24hPct);
          const nativeSource = nativePrice > 0 ? (nativeMeta.source || 'defillama') : 'none';
          let nativeAmount = 0;
          try { nativeAmount = await getPolygonNativeBalance(addr); } catch { }
          bucket.push(
            toRow(
              {
                chain: 'polygon',
                address: 'native',
                symbol: 'MATIC',
                name: 'Polygon',
                amount: nativeAmount,
                priceUsd: nativePrice,
                valueUsd: nativePrice ? nativeAmount * nativePrice : 0,
                change24hPct: nativePct,
                pctChange24h: nativePct,
                priceSource: nativeSource,
                changeSource: nativeSource
              },
              addr
            )
          );

          // 4) ERC-20 rows
          for (const t of discovered) {
            const amountUnits = toUnitsPolygon(t.balanceRaw, Number(t.decimals ?? 18));
            const meta = priceMap.get((t.address || '').toLowerCase());
            const price = meta ? toFiniteNumber(meta.price) || 0 : 0;
            const pct = meta ? toFiniteNumber(meta.change24hPct) : null;
            const source = meta?.source || 'defillama';
            const priceSource = price > 0 ? source : 'none';
            const changeSource = source;
            bucket.push(
              toRow(
                {
                  chain: 'polygon',
                  address: t.address,
                  symbol: t.symbol || '',
                  name: t.name || t.symbol || 'Token',
                  decimals: Number(t.decimals ?? 18),
                  amount: amountUnits,
                  priceUsd: price,
                  valueUsd: price ? amountUnits * price : 0,
                  change24hPct: pct,
                  pctChange24h: pct,
                  priceSource,
                  changeSource
                },
                addr
              )
            );
          }
        } catch (e) {
          console.warn('[PortfolioAgg] Polygon (Blockscout) fetch failed for', addr, e?.message);
        }
      })());
    }

    if (wantBsc  ) {
      tasks.push((async () => {
        try {
          const discovered = await getBscTokensFromNodereal(addr);
          const addrs = discovered.map((t) => t.address).filter(Boolean);
          const priceMapRaw = await getBscTokenPricesLlama(addrs);
          const srcMapBsc = priceMapRaw instanceof Map ? priceMapRaw : new Map(priceMapRaw || []);
          const priceMap = new Map();
          for (const [key, meta] of srcMapBsc.entries()) {
            priceMap.set(key, normalizePriceMeta(meta, 'defillama'));
          }

          const nativeMeta = normalizePriceMeta(await getBscUsdPriceLlama(), 'defillama');
          const nativePrice = toFiniteNumber(nativeMeta.price) || 0;
          const nativePct = toFiniteNumber(nativeMeta.change24hPct);
          const nativeSource = nativePrice > 0 ? (nativeMeta.source || 'defillama') : 'none';
          let nativeAmount = 0;
          try { nativeAmount = await getBscNativeBalance(addr); } catch { }
          bucket.push(
            toRow(
              {
                chain: 'bsc',
                address: 'native',
                symbol: 'BNB',
                name: 'BNB',
                amount: nativeAmount,
                priceUsd: nativePrice,
                valueUsd: nativePrice ? nativeAmount * nativePrice : 0,
                change24hPct: nativePct,
                pctChange24h: nativePct,
                priceSource: nativeSource,
                changeSource: nativeSource
              },
              addr
            )
          );

          for (const t of discovered) {
            const amountUnits = toUnitsBsc(t.balanceRaw, Number(t.decimals ?? 18));
            const meta = priceMap.get((t.address || '').toLowerCase());
            const price = meta ? toFiniteNumber(meta.price) || 0 : 0;
            const pct = meta ? toFiniteNumber(meta.change24hPct) : null;
            const source = meta?.source || 'defillama';
            const priceSource = price > 0 ? source : 'none';
            const changeSource = source;
            bucket.push(
              toRow(
                {
                  chain: 'bsc',
                  address: t.address,
                  symbol: t.symbol || '',
                  name: t.name || t.symbol || 'Token',
                  decimals: Number(t.decimals ?? 18),
                  amount: amountUnits,
                  priceUsd: price,
                  valueUsd: price ? amountUnits * price : 0,
                  change24hPct: pct,
                  pctChange24h: pct,
                  priceSource,
                  changeSource
                },
                addr
              )
            );
          }
        } catch (e) {
          console.warn('[PortfolioAgg] BSC (NodeReal) fetch failed for', addr, e?.message);
        }
      })());
    }

    await Promise.allSettled(tasks);
    return bucket;
  });

  // flatten per-wallet results
  for (const list of perWallet) {
    for (const r of list) rows.push(r);
  }

  // 🔒 filter out spammy tokens with web addresses / phishing phrases
  const safeRows = rows
    .filter((r) => !isSpamToken(r))
    .filter((r) => !isTokenBlacklisted(r));

  // Aggregate + breakdown
  const byKey = new Map();     // key -> token aggregate
  const breakdown = new Map(); // key -> [{ wallet, amount, valueUsd }]

  for (const r of safeRows) {
    const k = tokenKey(r);

    if (!byKey.has(k)) byKey.set(k, { ...r });
    else {
      const t = byKey.get(k);
      t.amount += r.amount || 0;
      if (!t.priceUsd && r.priceUsd) t.priceUsd = r.priceUsd;
      t.valueUsd += r.valueUsd || (r.amount || 0) * (t.priceUsd || 0);
    }

    if (!breakdown.has(k)) breakdown.set(k, []);
    breakdown.get(k).push({ wallet: r.wallet, amount: r.amount, valueUsd: r.valueUsd });
  }

  for (const k of breakdown.keys()) {
    breakdown.get(k).sort((a, b) => (b.amount || 0) - (a.amount || 0));
  }

  // Build token list
  const tokensAll = [...byKey.values()]
    .map((t) => ({ ...t, valueUsd: t.valueUsd || (t.amount || 0) * (t.priceUsd || 0) }))
    .sort((a, b) => (b.valueUsd || 0) - (a.valueUsd || 0));

  // ✅ Visibility filter: ONLY the Value (USD) column controls visibility.
  // Hide tokens whose aggregated valueUsd is below the threshold.
  const tokens = tokensAll.filter((t) => {
    const v = Number(t.valueUsd) || 0;
    return v >= HIDE_USD_MIN;
  });

  // Prune breakdown to only visible tokens
  const visibleBreakdown = new Map();
  for (const t of tokens) {
    const k = tokenKey(t);
    visibleBreakdown.set(k, breakdown.get(k) || []);
  }

  // Totals from visible tokens only
  const totalUsd = tokens.reduce((s, t) => s + (t.valueUsd || 0), 0);

  return { totalUsd, tokens, breakdown: visibleBreakdown };
}

// Totals helper (optional)
export async function buildPortfolioTotals(wallets, options) {
  const { totalUsd, tokens } = await buildPortfolioDetailed(wallets, options);
  return { totalUsd, tokens };
}

// New: cache-first builder that aggregates from central IDB cache (no network)
export async function buildPortfolioDetailedFromCache(wallets, options = {}) {
  const { DataClient } = await import('../data/dataClient');
  const wantAll     = !options?.only || options.only === 'all';
  // Hybrid approach: when building the All view, prefer live aggregation for Ethereum
  // and cache-first for the other chains. This guarantees parity with Wallet Detail
  // and fixes missing-wallet breakdowns for ETH while keeping other chains fast.
  const chains = wantAll ? ['pulse','bsc','polygon','base'] : [String(options.only || 'eth')];
  const addrs = (wallets || []).map((w) => (w.address || '').toLowerCase()).filter(Boolean);

  const byKey = new Map();
  const breakdown = new Map();

  for (const a of addrs) {
    for (const c of chains) {
      // Try cache first, then (best-effort) refresh if empty.
      // This keeps the Portfolio "chips" path consistent with WalletDetail, which uses live aggregation.
      // eslint-disable-next-line no-await-in-loop
      let rows = (await DataClient.getBalances(c, a)) || [];
      if (!Array.isArray(rows) || rows.length === 0) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await DataClient.refreshBalances(c, a, { force: false });
          // eslint-disable-next-line no-await-in-loop
          rows = (await DataClient.getBalances(c, a)) || [];
        } catch { /* non-fatal */ }
      }
      for (const r of rows) {
        const row = toRow(r, a);
        const k = tokenKey(row);
        if (!byKey.has(k)) byKey.set(k, { ...row });
        else {
          const t = byKey.get(k);
          t.amount += row.amount || 0;
          if (!t.priceUsd && row.priceUsd) t.priceUsd = row.priceUsd;
          t.valueUsd += row.valueUsd || (row.amount || 0) * (t.priceUsd || 0);
        }
        if (!breakdown.has(k)) breakdown.set(k, []);
        breakdown.get(k).push({ wallet: row.wallet, amount: row.amount, valueUsd: row.valueUsd });
      }
    }
  }

  // If building All, merge in Ethereum via live aggregator to ensure completeness
  if (wantAll) {
    try {
      const { tokens: ethTokens, breakdown: ethBd } = await buildPortfolioDetailed(wallets, { only: 'eth' });
      for (const t of ethTokens || []) {
        const k = tokenKey(t);
        if (!byKey.has(k)) byKey.set(k, { ...t });
        else {
          const base = byKey.get(k);
          base.amount = Number(base.amount || 0) + Number(t.amount || 0);
          // Prefer non-zero price
          if (!Number(base.priceUsd) && Number(t.priceUsd)) base.priceUsd = Number(t.priceUsd);
          base.valueUsd = Number(base.valueUsd || 0) + Number(t.valueUsd || 0);
        }
        const rows = ethBd.get(k) || [];
        if (rows.length) {
          if (!breakdown.has(k)) breakdown.set(k, []);
          const list = breakdown.get(k);
          for (const r of rows) list.push({ wallet: r.wallet, amount: r.amount, valueUsd: r.valueUsd });
        }
      }
    } catch (e) {
      console.warn('[PortfolioAgg] ETH live merge failed:', e?.message || e);
    }
  }

  for (const k of breakdown.keys()) breakdown.get(k).sort((a, b) => (b.amount || 0) - (a.amount || 0));

  const tokensAll = [...byKey.values()]
    .filter((t) => !isSpamToken(t))
    .filter((t) => !isTokenBlacklisted(t))
    .map((t) => ({ ...t, valueUsd: t.valueUsd || (t.amount || 0) * (t.priceUsd || 0) }))
    .sort((a, b) => (b.valueUsd || 0) - (a.valueUsd || 0));

  const tokens = tokensAll.filter((t) => Number(t.valueUsd || 0) >= HIDE_USD_MIN);
  const visibleBreakdown = new Map();
  for (const t of tokens) { const k = tokenKey(t); visibleBreakdown.set(k, breakdown.get(k) || []); }
  const totalUsd = tokens.reduce((s, t) => s + (t.valueUsd || 0), 0);
  return { totalUsd, tokens, breakdown: visibleBreakdown };
}
