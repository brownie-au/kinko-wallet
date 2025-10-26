// src/services/portfolioDataService.js
/* eslint-disable import/no-relative-parent-imports */
import { cacheGet, cacheSet } from '../utils/cacheStore';
import { scheduledFetch } from './fetchScheduler';
import { walletSignature } from '../utils/walletSig';

import { fetchPulsechainTokens } from './pulsechainService';
import { fetchEthereumTokens }  from './ethereumService';
import { getBaseTokensFromBlockscout, toUnits as toUnitsBase } from './baseBlockscoutService';
import { getBaseTokenPricesLlama, getBaseUsdPriceLlama } from './priceService';
import { getBaseNativeBalance } from './baseRpcService';

const SNAP_TTL_MS = 30 * 60_000;
const REFRESH_MIN_INTERVAL_MS = 5 * 60_000;

// -------- helpers --------
const keyToken = (r) =>
  `${(r.chain || '').toLowerCase()}:${(r.address || 'native').toLowerCase()}`;

function normalizeRow(r, walletAddr = null) {
  const amount = Number(r.amount ?? r.balance ?? r.qty ?? 0);
  const priceUsd = Number(r.priceUsd ?? r.priceUSD ?? r.price_usd ?? r.usdPrice ?? r.usd_price ?? r.price ?? 0);
  const totalUsd = Number(r.totalUsd ?? r.value ?? r.usd ?? (amount * priceUsd));

  return {
    chain: (r.chain || '').toLowerCase(),
    address: r.address === 'native' ? 'native' : (r.address || r.contract || null),
    symbol: r.symbol || '',
    name: r.name || '',
    decimals: Number(r.decimals ?? 18),
    amount: Number.isFinite(amount) ? amount : 0,
    priceUsd: Number.isFinite(priceUsd) ? priceUsd : 0,
    totalUsd: Number.isFinite(totalUsd) ? totalUsd : 0,
    wallet: walletAddr || r.wallet || r.owner || r.account || null,
    possible_spam: r.possible_spam === true || r.is_spam === true ? true : false,
    iconUrl: r.iconUrl || null
  };
}

function mergeRows(rows) {
  const map = new Map();
  for (const r of rows) {
    const k = keyToken(r);
    const prev = map.get(k);
    if (!prev) {
      map.set(k, { ...r });
    } else {
      prev.amount = (Number(prev.amount) || 0) + (Number(r.amount) || 0);
      if (!(Number(prev.priceUsd) > 0) && Number(r.priceUsd) > 0) {
        prev.priceUsd = Number(r.priceUsd);
      }
      prev.totalUsd = (Number(prev.amount) || 0) * (Number(prev.priceUsd) || 0);
    }
  }
  return Array.from(map.values());
}

function computeTotals(rows) {
  return {
    totalUsd: rows.reduce((s, r) => s + (Number(r.totalUsd) || 0), 0),
    count: rows.length
  };
}

// -------- per-wallet fan-out --------
async function fetchAllChains(wallets) {
  const out = [];

  for (const w of wallets || []) {
    const chain = String(w.chain || '').toLowerCase().trim();
    const addr = String(w.address || '').trim();
    if (!addr) continue;

    try {
      if (['pulse', 'pulsechain', 'pls'].includes(chain)) {
        const list = await fetchPulsechainTokens(addr);
        for (const r of list) out.push(normalizeRow(r, addr));
      }

      else if (['eth', 'ethereum', 'ether', 'ethereum mainnet'].includes(chain)) {
        const list = await fetchEthereumTokens(addr);
        for (const r of list) out.push(normalizeRow(r, addr));
      }

      else if (chain === 'base') {
        try {
          const discovered = await getBaseTokensFromBlockscout(addr);
          const addrs = discovered.map((t) => t.address).filter(Boolean);
          const priceMap = await getBaseTokenPricesLlama(addrs);

          let nativeAmount = 0;
          try { nativeAmount = await getBaseNativeBalance(addr); } catch { }
          const nativePriceUsd = await getBaseUsdPriceLlama();

          out.push(
            normalizeRow(
              {
                chain: 'base',
                address: 'native',
                symbol: 'ETH',
                name: 'Ether',
                amount: nativeAmount,
                priceUsd: nativePriceUsd,
                totalUsd: nativeAmount * nativePriceUsd
              },
              addr
            )
          );

          for (const t of discovered) {
            const amountUnits = toUnitsBase(t.balanceRaw, Number(t.decimals ?? 18));
            const p = priceMap.get(t.address) || 0;
            out.push(
              normalizeRow(
                {
                  chain: 'base',
                  address: t.address,
                  symbol: t.symbol || '',
                  name: t.name || t.symbol || 'Token',
                  amount: amountUnits,
                  priceUsd: p,
                  totalUsd: p ? amountUnits * p : 0
                },
                addr
              )
            );
          }
        } catch { }
      }
    } catch (err) {
      console.warn(`[PortfolioData] Skipped wallet ${addr} on ${chain}:`, err.message);
    }
  }

  return out;
}

// -------- single builder (used by both load & refresh) --------
async function buildSnapshotOnce(wallets, cacheKey) {
  const walletRows = await fetchAllChains(wallets);
  const rows = mergeRows(walletRows);
  const totals = computeTotals(rows);
  const snap = { asOf: Date.now(), rows, walletRows, totals };
  await cacheSet(cacheKey, snap, SNAP_TTL_MS);
  return snap;
}

// -------- public API --------
export async function loadPortfolioSnapshot(wallets) {
  const sig = walletSignature(wallets);
  const cacheKey = `portfolio:snap:${sig}:v1`;

  const cached = await cacheGet(cacheKey);
  if (cached) return { snapshot: cached, status: 'cached' };

  const fresh = await scheduledFetch(
    `portfolio:${sig}`,
    () => buildSnapshotOnce(wallets, cacheKey),
    { minIntervalMs: REFRESH_MIN_INTERVAL_MS }
  );

  if (fresh) return { snapshot: fresh, status: 'fresh' };

  return {
    snapshot: { asOf: Date.now(), rows: [], walletRows: [], totals: { totalUsd: 0, count: 0 } },
    status: 'empty'
  };
}

// Force rebuild NOW (bypass scheduler) — used by the Refresh button
export async function buildPortfolioSnapshotNow(wallets) {
  const sig = walletSignature(wallets);
  const cacheKey = `portfolio:snap:${sig}:v1`;
  return buildSnapshotOnce(wallets, cacheKey);
}

export async function refreshPortfolioSnapshot(wallets, { force = false } = {}) {
  const sig = walletSignature(wallets);
  const cacheKey = `portfolio:snap:${sig}:v1`;

  if (force) {
    // hard refresh regardless of throttle
    return buildSnapshotOnce(wallets, cacheKey);
  }

  const fresh = await scheduledFetch(
    `portfolio:${sig}`,
    () => buildSnapshotOnce(wallets, cacheKey),
    { minIntervalMs: REFRESH_MIN_INTERVAL_MS }
  );

  if (fresh) return fresh;

  const cached = await cacheGet(cacheKey);
  return cached || null;
}
