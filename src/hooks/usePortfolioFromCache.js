// src/hooks/usePortfolioFromCache.js
/* Cache-first portfolio aggregator for View All and Dashboard.
 * Reads balances from IDB for all wallets and supported chains, merges and
 * computes totals. Auto-updates when orchestrator writes new cache.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import DataClient from '../data/dataClient';

const CHAINS = ['eth', 'pulse', 'bsc', 'polygon', 'base'];

const keyFor = (t) => `${t.chain}:${t.address || 'native'}`.toLowerCase();

export default function usePortfolioFromCache({ wallets = [], only = 'all' }) {
  const addrs = useMemo(() => (Array.isArray(wallets) ? wallets : []).map((w) => (w.address || '').toLowerCase()).filter(Boolean), [wallets]);
  const chains = useMemo(() => (only === 'all' ? CHAINS : [only]), [only]);
  const [tokens, setTokens] = useState([]);
  const [breakdown, setBreakdown] = useState(new Map());
  const [totalUsd, setTotalUsd] = useState(0);
  const [loading, setLoading] = useState(false);
  const bcRef = useRef(null);

  const readOnce = async () => {
    setLoading(true);
    try {
      const calls = [];
      for (const a of addrs) for (const c of chains) calls.push(DataClient.getBalances(c, a));
      const parts = await Promise.allSettled(calls);
      const perWallet = [];
      let idx = 0;
      for (const a of addrs) {
        for (const c of chains) {
          const p = parts[idx++];
          const rows = p?.status === 'fulfilled' && Array.isArray(p.value) ? p.value : [];
          // attach wallet for breakdown
          perWallet.push(rows.map((t) => ({ ...t, wallet: a })));
        }
      }
      // flatten and aggregate
      const flat = perWallet.flat();
      const agg = new Map();
      const bd = new Map();
      for (const r of flat) {
        const k = keyFor(r);
        const cur = agg.get(k) || { ...r };
        cur.amount = (Number(cur.amount) || 0) + (Number(r.amount) || 0);
        if (!cur.priceUsd && r.priceUsd) cur.priceUsd = Number(r.priceUsd);
        cur.valueUsd = Number(cur.valueUsd || 0) + (Number(r.valueUsd) || ((Number(r.amount) || 0) * Number(r.priceUsd || 0)));
        agg.set(k, cur);
        if (!bd.has(k)) bd.set(k, []);
        bd.get(k).push({ wallet: r.wallet, amount: Number(r.amount) || 0, valueUsd: Number(r.valueUsd) || 0 });
      }
      // sort breakdown entries
      for (const k of bd.keys()) bd.get(k).sort((a, b) => (b.amount || 0) - (a.amount || 0));
      const list = [...agg.values()].map((t) => ({ ...t, valueUsd: Number(t.valueUsd || 0) }));
      list.sort((a, b) => Number(b.valueUsd || 0) - Number(a.valueUsd || 0));
      const total = list.reduce((s, t) => s + (Number(t.valueUsd) || 0), 0);
      setTokens(list);
      setBreakdown(bd);
      setTotalUsd(total);
    } finally { setLoading(false); }
  };

  useEffect(() => { readOnce(); /* eslint-disable-next-line */ }, [addrs.join(','), chains.join(',')]);

  // update on cache writes
  useEffect(() => {
    let bc;
    try { bc = new BroadcastChannel('kinko-data'); bcRef.current = bc; } catch {}
    const onMsg = (e) => {
      const k = e?.data?.key || '';
      if (e?.data?.type === 'updated' && k.startsWith('balances:')) {
        // If this update concerns our wallets/chains, recompute
        const parts = k.split(':'); // balances:chain:address
        if (parts.length >= 3) {
          const c = parts[1];
          const a = parts[2];
          if (addrs.includes(a) && (only === 'all' || c === only)) readOnce();
        }
      }
    };
    bc?.addEventListener('message', onMsg);
    return () => { try { bc?.removeEventListener('message', onMsg); } catch {} };
  }, [addrs.join(','), chains.join(','), only]);

  return { tokens, totalUsd, breakdown, loading };
}

