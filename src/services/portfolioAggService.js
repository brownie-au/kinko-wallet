// src/services/portfolioAggService.js
// Aggregates balances across wallets/chains and returns totals + breakdown.

import { fetchPulsechainTokens, refreshPulsechainTokens } from './pulsechainService';
import { fetchEthereumTokens,  refreshEthereumTokens  } from './ethereumService';

const tokenKey = (t) => `${t.chain}:${t.address || 'native'}:${(t.symbol || '').toUpperCase()}`;

function toRow(sr, wallet) {
  return {
    chain: (sr.chain || '').toLowerCase(),               // 'pulse' | 'eth'
    wallet,                                              // wallet address
    address: sr.address === 'native' ? null : (sr.address || null),
    symbol: sr.symbol || '',
    name: sr.name || '',
    decimals: Number(sr.decimals ?? 18),
    amount: Number(sr.balance ?? sr.amount ?? 0),
    priceUsd: Number(sr.price   ?? sr.priceUsd ?? 0),
    valueUsd: Number(sr.value   ?? sr.valueUsd ?? 0)
  };
}

/**
 * Build portfolio view.
 * @param {Array<{address:string, name?:string}>} wallets
 * @param {{ only?: 'auto'|'pulse'|'eth', force?: boolean }} options
 * @returns {{ totalUsd:number, tokens:Array, breakdown:Map<string, Array> }}
 */
export async function buildPortfolioDetailed(wallets = [], options = {}) {
  const only  = (options.only  || 'auto').toLowerCase(); // 'auto' | 'pulse' | 'eth'
  const force = !!options.force;

  const rows = [];

  for (const w of wallets) {
    const addr = w.address;

    // Pulse
    if (only === 'pulse' || only === 'auto') {
      try {
        const list = force ? await refreshPulsechainTokens(addr) : await fetchPulsechainTokens(addr);
        for (const r of list) rows.push(toRow(r, addr));
      } catch (e) {
        console.warn('[PortfolioAgg] Pulse fetch failed for', addr, e?.message);
      }
    }

    // ETH
    if (only === 'eth' || only === 'auto') {
      try {
        const list = force ? await refreshEthereumTokens(addr) : await fetchEthereumTokens(addr);
        for (const r of list) rows.push(toRow(r, addr));
      } catch (e) {
        console.warn('[PortfolioAgg] ETH fetch failed for', addr, e?.message);
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

  const tokens = [...byKey.values()]
    .map((t) => ({ ...t, valueUsd: t.valueUsd || (t.amount || 0) * (t.priceUsd || 0) }))
    .sort((a, b) => (b.valueUsd || 0) - (a.valueUsd || 0));

  const totalUsd = tokens.reduce((s, t) => s + (t.valueUsd || 0), 0);

  return { totalUsd, tokens, breakdown };
}

// Totals helper (optional)
export async function buildPortfolioTotals(wallets, options) {
  const { totalUsd, tokens } = await buildPortfolioDetailed(wallets, options);
  return { totalUsd, tokens };
}
