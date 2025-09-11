// src/hooks/useTxHistory.js
/* Cache-first TX history hook using DataClient. Reads instantly from IDB, then
 * relies on BackgroundRefreshOrchestrator to refresh in the background.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import DataClient from '../data/dataClient';

const CHAINS = ['eth', 'pulse', 'bsc', 'polygon', 'base'];

export default function useTxHistory({ wallets = [], chain = 'all', days = 30, page = 1 }) {
  const addrs = useMemo(() => (Array.isArray(wallets) ? wallets : []).map((w) => (w.address || '').toLowerCase()).filter(Boolean), [wallets]);
  const chains = useMemo(() => (chain === 'all' ? CHAINS : [chain]), [chain]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);
  const bcRef = useRef(null);

  // Read caches and merge
  const readOnce = async () => {
    setError(''); setLoading(true);
    try {
      const calls = [];
      for (const c of chains) {
        for (const a of addrs) calls.push(DataClient.getTxs(c, a, 'all'));
      }
      const parts = await Promise.allSettled(calls);
      const all = [];
      for (const p of parts) {
        if (p.status !== 'fulfilled') continue;
        const d = p.value || {};
        all.push(...(Array.isArray(d.items) ? d.items : []));
      }
      // Filter by days (client-side)
      const minTs = Date.now() - Number(days || 30) * 24 * 60 * 60 * 1000;
      const filtered = all.filter((it) => {
        const ms = it.timeStamp ? Number(it.timeStamp) * 1000 : Date.parse(it.date || 0);
        return Number.isFinite(ms) ? ms >= minTs : true;
      });
      filtered.sort((a, b) => (b.timeStamp || Date.parse(b.date) / 1000 || 0) - (a.timeStamp || Date.parse(a.date) / 1000 || 0));
      setRows(page === 1 ? filtered : (prev) => prev.concat(filtered));
    } catch (e) {
      setError(e?.message || 'Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { readOnce(); /* eslint-disable-next-line */ }, [addrs.join(','), chains.join(','), days, page]);

  // Listen for cache updates from orchestrator; re-read on relevant keys
  useEffect(() => {
    let bc;
    try { bc = new BroadcastChannel('kinko-data'); bcRef.current = bc; } catch {}
    const onMsg = (e) => {
      const k = e?.data?.key || '';
      if (e?.data?.type === 'updated' && k.startsWith('txs:')) {
        // Only refresh if the update is for our wallets/chains
        const parts = k.split(':'); // ['txs', chain, address, type]
        if (parts.length >= 4) {
          const c = parts[1];
          const a = parts[2];
          if ((chain === 'all' || chains.includes(c)) && addrs.includes(a)) readOnce();
        }
      }
    };
    bc?.addEventListener('message', onMsg);
    return () => { try { bc?.removeEventListener('message', onMsg); } catch {} };
  }, [addrs.join(','), chains.join(','), chain]);

  return { rows, loading, error };
}

