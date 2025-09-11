// src/components/DataRefreshStatus.jsx
import { useEffect, useState } from 'react';
import DataClient from '../data/dataClient';

const fmtAgo = (ms) => {
  if (!ms) return 'never';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h} hr ago`;
};

export default function DataRefreshStatus({ className = '' }) {
  const [state, setState] = useState({ running: false, lastSuccessAt: 0, lastErrorAt: 0, lastRunAt: 0, inflightCount: 0 });

  useEffect(() => {
    let dead = false;
    const tick = async () => {
      const meta = await DataClient.read('meta:lastUpdated:orchestrator');
      const payload = meta?.payload || {};
      if (!dead) setState((s) => ({ ...s, ...payload }));
    };
    tick();
    const id = setInterval(tick, 5000);
    const onMsg = (e) => { if (e?.data?.type === 'updated' && e?.data?.key === 'meta:lastUpdated:orchestrator') tick(); };
    let bc; try { bc = new BroadcastChannel('kinko-data'); bc.addEventListener('message', onMsg); } catch {}
    return () => { dead = true; clearInterval(id); try { bc?.removeEventListener('message', onMsg); } catch {} };
  }, []);

  const now = Date.now();
  const age = state.lastSuccessAt ? now - state.lastSuccessAt : null;
  const degraded = !state.running && (!state.lastSuccessAt || (age && age > 30 * 60 * 1000));
  const text = state.running || state.inflightCount > 0
    ? 'Refreshing in background…'
    : degraded
      ? 'Using cached data · Update delayed.'
      : `Last updated ${fmtAgo(age || 0)}`;

  return (
    <div className={`kw-refresh-status text-muted small ${className}`} style={{ position: 'fixed', bottom: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 1040, padding: '4px 8px', borderRadius: 6, background: 'rgba(0,0,0,.06)' }}>
      {text}
    </div>
  );
}

