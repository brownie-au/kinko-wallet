// src/services/aiInputBuilder.js
// Build a single structured JSON snapshot for AI analysis.
// Includes: wallet token rows, aggregated portfolio, HEX (Pulse/Eth) + eHEX staking caches.

import { getWalletCache } from '../utils/walletCache';
import { getManagedWalletAddresses } from './snapshotService';
import { loadPortfolioSnapshot } from './portfolioDataService';
import { readHexStakesCache } from './kw-hexPulseService';
import { readEhexStakesCache } from './kw-ehexStakingService';

export function buildTokenRowsFromWallets() {
  const rows = [];
  const addrs = getManagedWalletAddresses();
  for (const addr of addrs) {
    if (!addr) continue;
    const wc = getWalletCache(addr, { maxAge: Number.MAX_SAFE_INTEGER }) || {};
    const tokens = wc?.tokens || wc?.portfolioTokens || wc?.assets || [];
    for (const r of tokens) {
      const chain = (r?.chain || r?.network || '').toLowerCase();
      const address = (r?.address || r?.contract || (String(r?.symbol).toUpperCase() === 'PLS' ? 'native' : '')).toLowerCase();
      const symbol = (r?.symbol || r?.ticker || '').toUpperCase();
      const amount = Number(r?.amount ?? r?.balance ?? 0) || 0;
      const valueUsd = Number(r?.valueUsd ?? r?.usd ?? r?.totalUsd ?? 0) || 0;
      const priceUsd = Number(r?.priceUsd ?? r?.price ?? (amount > 0 ? valueUsd / amount : 0)) || 0;
      rows.push({ chain, address, symbol, amount, valueUsd, priceUsd });
    }
  }
  return rows;
}

export function aggregatePortfolioFromRows(rows) {
  const byKey = new Map();
  let total = 0;
  const chains = new Set();
  for (const r of rows || []) {
    const key = `${r.chain}:${r.address || 'native'}:${r.symbol}`;
    const prev = byKey.get(key) || {
      symbol: r.symbol,
      name: r.symbol,
      chain: r.chain,
      address: r.address || null,
      amount: 0,
      valueUsd: 0,
      priceUsd: 0
    };
    prev.amount += Number(r.amount) || 0;
    prev.valueUsd += Number(r.valueUsd) || 0;
    prev.priceUsd = prev.amount > 0 ? prev.valueUsd / prev.amount : prev.priceUsd || r.priceUsd || 0;
    byKey.set(key, prev);
    if (r.chain) chains.add(r.chain);
    total += Number(r.valueUsd) || 0;
  }
  return { totalUsd: Number(total) || 0, assets: Array.from(byKey.values()), chains: Array.from(chains) };
}

export function readHexStakeCaches(addresses) {
  try {
    const addrList = (addresses && addresses.length)
      ? addresses
      : getManagedWalletAddresses();
    const pulse = readHexStakesCache(addrList, { chain: 'pulse' }) || null;
    const eth = readHexStakesCache(addrList, { chain: 'ethereum' }) || null;
    return { pulse, eth };
  } catch {
    return { pulse: null, eth: null };
  }
}

export function readEhexStakeCaches() {
  try {
    return readEhexStakesCache();
  } catch {
    return { byAddr: {}, updatedAt: null };
  }
}

export function buildFullAiSnapshot() {
  const tokens = buildTokenRowsFromWallets();
  const portfolio = aggregatePortfolioFromRows(tokens);
  const stakingHex = readHexStakeCaches();
  const stakingEhex = readEhexStakeCaches();
  return { portfolio, tokens, stakingHex, stakingEhex, generatedAt: new Date().toISOString() };
}

const LS_LAST_SNAPSHOT = 'kw:ai:lastSnapshot:v1';

export async function buildFullAiSnapshotAsync() {
  try {
    // Prefer the consolidated snapshot service (fetches across chains and caches)
    const addrs = getManagedWalletAddresses().map((a) => ({ address: a, chain: 'eth' }));
    const { snapshot, status } = await loadPortfolioSnapshot(addrs);
    const rows = Array.isArray(snapshot?.rows) ? snapshot.rows : [];
    const portfolio = aggregatePortfolioFromRows(
      rows.map((r) => ({
        chain: r.chain,
        address: r.address || 'native',
        symbol: (r.symbol || '').toUpperCase(),
        amount: Number(r.amount || 0),
        valueUsd: Number(r.totalUsd || 0),
        priceUsd: Number(r.priceUsd || 0)
      }))
    );
    const stakingHex = readHexStakeCaches();
    const stakingEhex = readEhexStakeCaches();
    const out = { portfolio, tokens: rows, stakingHex, stakingEhex, generatedAt: new Date().toISOString(), status };
    try { localStorage.setItem(LS_LAST_SNAPSHOT, JSON.stringify(out)); } catch {}
    return out;
  } catch (e) {
    // Fallback to old cache-based builder or last saved snapshot
    try {
      const cached = localStorage.getItem(LS_LAST_SNAPSHOT);
      if (cached) return JSON.parse(cached);
    } catch {}
    return buildFullAiSnapshot();
  }
}
