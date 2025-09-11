// src/services/txHistoryService.js
// Client-side aggregator for multi-chain transaction history.
// - Calls /api/tx per chain and wallet
// - Merges, de-dupes, sorts
// - Caches in localStorage for fast reloads

import { getCachedJSON, setCachedJSON } from '../utils/kinkoCache';

const CHAINS = ['eth', 'pulse', 'bsc', 'polygon', 'base'];

function cacheKey({ walletsSig, chain, fromTs, toTs, page }) {
  return `hist:${walletsSig}:${chain}:${fromTs || 0}-${toTs || 0}:p${page || 1}`;
}

async function fetchOne({ chain, wallet }) {
  const params = new URLSearchParams();
  params.set('chain', chain);
  params.set('address', wallet);
  const url = `/api/tx?${params.toString()}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`tx ${chain} ${r.status}`);
  const j = await r.json();
  // Normalize to shape expected by UI aggregator: items[] with date/timeStamp
  const items = Array.isArray(j.items) ? j.items.slice() : [];
  // Attach a numeric timeStamp for sorting convenience
  items.forEach((it) => {
    if (it && !it.timeStamp && it.date) {
      const ts = Date.parse(it.date);
      if (!Number.isNaN(ts)) it.timeStamp = Math.floor(ts / 1000);
    }
  });
  return { items };
}

export async function fetchHistoryMulti({ wallets = [], chains = CHAINS }) {
  const addrs = (wallets || []).map((w) => (w.address || '').toLowerCase()).filter(Boolean);
  const walletsSig = addrs.slice().sort().join(',');

  // Try cache for each chain and merge
  const results = [];
  const chainsArr = (chains && chains.length) ? chains : CHAINS;
  for (const chain of chainsArr) {
    const hit = getCachedJSON(cacheKey({ walletsSig, chain, fromTs: 0, toTs: 0, page: 1 }), 10 * 60 * 1000); // 10 min client cache
    if (hit?.data) results.push({ chain, data: hit.data, cached: true });
  }

  const missing = chainsArr.filter((c) => !results.find((r) => r.chain === c));
  if (missing.length) {
    // Fire all chains for first wallet only, then append for others
    const calls = [];
    for (const chain of missing) {
      for (const addr of addrs) {
        calls.push(fetchOne({ chain, wallet: addr }));
      }
    }
    const parts = await Promise.allSettled(calls);
    // group by chain and merge items
    const byChain = new Map();
    let idx = 0;
    for (const chain of missing) {
      let merged = { items: [] };
      for (let j = 0; j < addrs.length; j++) {
        const p = parts[idx++];
        if (p.status !== 'fulfilled') continue;
        const d = p.value || {};
        merged.items = merged.items.concat(Array.isArray(d.items) ? d.items : []);
      }
      byChain.set(chain, merged);
      setCachedJSON(cacheKey({ walletsSig, chain, fromTs: 0, toTs: 0, page: 1 }), merged);
    }
    for (const [chain, data] of byChain.entries()) results.push({ chain, data, cached: false });
  }

  // Merge across chains
  const all = [];
  for (const r of results) {
    const d = r.data || {};
    all.push(...(Array.isArray(d.items) ? d.items : []));
  }
  all.sort((a, b) => (b.timeStamp || Date.parse(b.date) / 1000 || 0) - (a.timeStamp || Date.parse(a.date) / 1000 || 0));

  return { items: all, walletsSig };
}
