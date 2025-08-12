// src/services/snapshotService.js
// One place to prefetch & cache wallet snapshots for all chains.
// Dedupes in-flight requests and writes to walletCache in a normalized shape.

import { fetchEthereumTokens } from './ethereumService';
import { fetchPulsechainTokens } from './pulsechainService';
import { getPortfolioWithPrices } from './moralisService';
import walletsData from '../data/wallets.js';

import {
  setWalletCache,
  getWalletCache,
  WALLET_CACHE_DEFAULT_TTL
} from '../utils/walletCache';

const CHAINS = ['eth', 'pulse', 'base'];
const INF = new Map(); // in-flight: key -> Promise

const cacheKey = (address, chain) => `${address}:${chain}`.toLowerCase();

// ---- normalizers (match WalletDetail.jsx) ----
const mapTokenForCache = (t, chainHint) => {
  const priceUsd = Number(t.priceUsd ?? t.price ?? 0);
  const amount   = Number(t.amount ?? 0);
  const valueUsd = Number(t.valueUsd ?? t.value ?? amount * priceUsd);
  return {
    symbol: (t.symbol || t.ticker || (t.name || 'TOKEN')).toUpperCase(),
    name: t.name || t.symbol || 'Token',
    amount, priceUsd, valueUsd,
    contract: t.contract || t.address || null,
    logo: t.logo || t.iconUrl || null,
    chain: t.chain ?? chainHint
  };
};

function adaptPulse(rows) {
  const list = Array.isArray(rows) ? rows.slice() : [];
  const plsIdx = list.findIndex(
    (r) => r.address === 'PLS' || r.symbol === 'PLS' || r.address === 'native'
  );
  const pls = plsIdx >= 0 ? list.splice(plsIdx, 1)[0] : null;

  const nat = pls
    ? {
        name: 'PulseChain',
        symbol: 'PLS',
        amount: Number(pls.balance || 0),
        price: Number(pls.price || 0),
        priceUsd: Number(pls.price || 0),
        value: Number(pls.value || 0),
        valueUsd: Number(pls.value || 0),
        contract: 'native',
        logo: pls.iconUrl || null,
        chain: 'pulse'
      }
    : null;

  const toks = list.map((r) => {
    const price = Number(r.price || r.priceUsd || 0);
    const amount = Number(r.balance || r.amount || 0);
    const value = Number(r.value || r.valueUsd || amount * price);
    return {
      name: r.name || r.symbol || 'Token',
      symbol: r.symbol || '',
      amount,
      price,
      priceUsd: price,
      value,
      valueUsd: value,
      contract: r.address || null,
      logo: r.iconUrl || null,
      chain: 'pulse'
    };
  });

  const totalUSD = (nat ? nat.valueUsd : 0) + toks.reduce((s, t) => s + (t.valueUsd || 0), 0);
  return { native: nat, tokens: toks, totalUSD };
}

function adaptEth(rows) {
  const list = Array.isArray(rows)
    ? rows.slice()
    : Array.isArray(rows?.tokens)
    ? rows.tokens.slice()
    : [];

  const natIdx = list.findIndex((r) => (r.symbol === 'ETH') || (r.address === 'native'));
  const natRow = natIdx >= 0 ? list.splice(natIdx, 1)[0] : null;

  const nat = natRow ? {
    name: 'Ethereum',
    symbol: 'ETH',
    amount: Number(natRow.balance || 0),
    price: Number(natRow.price || 0),
    priceUsd: Number(natRow.price || 0),
    value: Number(natRow.value || 0),
    valueUsd: Number(natRow.value || 0),
    contract: 'native',
    logo: natRow.iconUrl || null,
    chain: 'eth'
  } : null;

  const toks = list.map((r) => {
    const price = Number(r.price || r.priceUsd || 0);
    const amount = Number(r.balance || r.amount || 0);
    const value = Number(r.value || r.valueUsd || amount * price);
    return {
      name: r.name || r.symbol || 'Token',
      symbol: r.symbol || '',
      amount,
      price,
      priceUsd: price,
      value,
      valueUsd: value,
      contract: r.address || null,
      logo: r.iconUrl || null,
      chain: 'eth'
    };
  });

  const totalUSD = (nat ? nat.valueUsd : 0) + toks.reduce((s, t) => s + (t.valueUsd || 0), 0);
  return { native: nat, tokens: toks, totalUSD };
}

function adaptBase(res, chain = 'base') {
  const nat = res?.native
    ? {
        ...res.native,
        chain,
        priceUsd: Number(res?.native?.priceUsd ?? res?.native?.price ?? 0),
        valueUsd: Number(res?.native?.valueUsd ?? res?.native?.value ?? 0)
      }
    : null;

  const toks = Array.isArray(res?.tokens)
    ? res.tokens.map((t) => {
        const price = Number(t.priceUsd ?? t.price ?? 0);
        const amt   = Number(t.amount ?? 0);
        const val   = Number(t.valueUsd ?? t.value ?? amt * price);
        return { ...t, chain, priceUsd: price, valueUsd: val };
      })
    : [];

  const totalUSD = Number(res?.totalUSD || (nat?.valueUsd || 0) + toks.reduce((s, t) => s + (t.valueUsd || 0), 0));
  return { native: nat, tokens: toks, totalUSD };
}

// ---- core fetcher per chain (deduped) ----
async function fetchOne(address, chain) {
  if (chain === 'eth')  return adaptEth(await fetchEthereumTokens(address));
  if (chain === 'pulse') return adaptPulse(await fetchPulsechainTokens(address));
  // base (and future chains) via Moralis
  return adaptBase(await getPortfolioWithPrices(address, chain), chain);
}

function writeSnapshot(address, chain, res) {
  const { tokens = [], native = null, totalUSD = 0 } = res || {};
  const cachedTokens = [
    ...(native ? [mapTokenForCache({ ...native, name: native.name || native.symbol || 'Native' }, chain)] : []),
    ...tokens.map((t) => mapTokenForCache(t, chain))
  ];
  const total = Number.isFinite(totalUSD)
    ? Number(totalUSD)
    : cachedTokens.reduce((s, t) => s + (t.valueUsd || 0), 0);

  setWalletCache(cacheKey(address, chain), {
    chain,
    tokens: cachedTokens,
    totalUsd: total
  });
}

// Public: get snapshot with optional revalidation (stale-while-revalidate)
export async function getSnapshot(address, chain, { revalidate = false } = {}) {
  const key = cacheKey(address, chain);
  const cached = getWalletCache(key, { maxAge: WALLET_CACHE_DEFAULT_TTL });

  // Serve cached immediately (even if stale) unless we’re forced to revalidate
  if (cached && !revalidate && !cached.stale) return cached;

  // Deduped in-flight fetch
  if (!INF.has(key)) {
    INF.set(
      key,
      fetchOne(address, chain)
        .then((res) => {
          writeSnapshot(address, chain, res);
          return getWalletCache(key) || res;
        })
        .finally(() => INF.delete(key))
    );
  }
  try {
    return await INF.get(key);
  } catch {
    // On error, still return cached if we had anything
    return cached || null;
  }
}

// ------------- helpers for boot/prefetch -------------
function uniqLower(arr) {
  const out = [];
  const seen = new Set();
  for (const a of arr) {
    const s = (a || '').toLowerCase();
    if (s && !seen.has(s)) { seen.add(s); out.push(s); }
  }
  return out;
}

export function getManagedWalletAddresses() {
  // 1) from localStorage 'wallets'
  let fromLocal = [];
  try {
    const raw = localStorage.getItem('wallets');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) fromLocal = parsed.map((w) => w?.address || w?.addr || '');
    }
  } catch {}
  // 2) from data file
  const fromData = Array.isArray(walletsData)
    ? walletsData.map((w) => w?.address || w?.addr || '')
    : [];

  return uniqLower([...fromLocal, ...fromData]);
}

// Prefetch everything (fire-and-forget)
export async function prefetchAllManaged({ revalidate = true } = {}) {
  const addrs = getManagedWalletAddresses();
  const jobs = [];
  for (const a of addrs) {
    for (const c of CHAINS) {
      jobs.push(getSnapshot(a, c, { revalidate }));
    }
  }
  // Don’t throw on errors; warm whatever we can.
  await Promise.allSettled(jobs);
}
