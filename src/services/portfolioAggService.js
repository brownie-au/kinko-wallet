// src/services/portfolioAggService.js
// Aggregates balances across wallets/chains and returns totals + breakdown.

import { fetchPulsechainTokens, refreshPulsechainTokens } from './pulsechainService';
import { fetchEthereumTokens,  refreshEthereumTokens  } from './ethereumService';
import { getPortfolioWithPrices } from './moralisService'; // used for Base (and future chains)

// Visibility threshold (USD). Default 0.01 if not set.
const HIDE_USD_MIN = Number(
  import.meta.env.VITE_PORTFOLIO_HIDE_USD_MIN ??
  import.meta.env.VITE_HIDE_USD_MIN ??
  0.01
);

const tokenKey = (t) => `${t.chain}:${t.address || 'native'}:${(t.symbol || '').toUpperCase()}`;

function toRow(sr, wallet) {
  return {
    chain: (sr.chain || '').toLowerCase(),               // 'pulse' | 'eth' | 'base'
    wallet,                                              // wallet address
    address: sr.address === 'native' ? null : (sr.address || sr.contract || null),
    symbol: sr.symbol || '',
    name: sr.name || '',
    decimals: Number(sr.decimals ?? 18),
    amount: Number(sr.balance ?? sr.amount ?? 0),
    priceUsd: Number(sr.price   ?? sr.priceUsd ?? 0),
    valueUsd: Number(sr.value   ?? sr.valueUsd ?? 0)
  };
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
          address: t.address,
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
export async function buildPortfolioDetailed(wallets = [], options = {}) {
  const only  = (options.only  || 'all').toLowerCase(); // 'all' | 'auto' | 'pulse' | 'eth' | 'base'
  const force = !!options.force;

  const wantPulse = (only === 'all' || only === 'auto' || only === 'pulse');
  const wantEth   = (only === 'all' || only === 'auto' || only === 'eth');
  const wantBase  = (only === 'all' || only === 'auto' || only === 'base');

  const rows = [];

  for (const w of wallets) {
    const addr = w.address;

    // Pulse
    if (wantPulse) {
      try {
        const list = force ? await refreshPulsechainTokens(addr) : await fetchPulsechainTokens(addr);
        for (const r of list) rows.push(toRow(r, addr));
      } catch (e) {
        console.warn('[PortfolioAgg] Pulse fetch failed for', addr, e?.message);
      }
    }

    // ETH
    if (wantEth) {
      try {
        const list = force ? await refreshEthereumTokens(addr) : await fetchEthereumTokens(addr);
        for (const r of list) rows.push(toRow(r, addr));
      } catch (e) {
        console.warn('[PortfolioAgg] ETH fetch failed for', addr, e?.message);
      }
    }

    // Base (Moralis)
    if (wantBase) {
      try {
        const res = await getPortfolioWithPrices(addr, 'base'); // prices + balances
        rows.push(...rowsFromMoralis(addr, 'base', res));
      } catch (e) {
        console.warn('[PortfolioAgg] BASE fetch failed for', addr, e?.message);
      }
    }
  }

  // Aggregate + breakdown
  const byKey = new Map();     // key -> token aggregate
  const breakdown = new Map(); // key -> [{ wallet, amount, valueUsd }]

  for (const r of rows) {
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

  // Build token list, then apply visibility filter
  const tokensAll = [...byKey.values()]
    .map((t) => ({ ...t, valueUsd: t.valueUsd || (t.amount || 0) * (t.priceUsd || 0) }))
    .sort((a, b) => (b.valueUsd || 0) - (a.valueUsd || 0));

  const tokens = tokensAll.filter((t) => (Number(t.valueUsd) || 0) >= HIDE_USD_MIN);

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
