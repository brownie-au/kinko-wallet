// src/sections/dashboard/default/FearGreedCard.jsx
import { useEffect, useState } from 'react';
import { Card, Spinner } from 'react-bootstrap';

// ---------- helpers ----------
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const labelFor = (v) =>
  v <= 24 ? 'Extreme Fear' :
  v <= 44 ? 'Fear' :
  v <= 55 ? 'Neutral' :
  v <= 74 ? 'Greed' : 'Extreme Greed';
const valueToColor = (v) => {
  const hue = (clamp(v, 0, 100) * 120) / 100; // 0=red → 120=green
  return `hsl(${hue}deg 70% 45%)`;
};
const nearestByDays = (items, days) => {
  const target = Date.now() - days * 86400_000;
  let best = null, bestDiff = Infinity;
  for (const it of items) {
    const diff = Math.abs(it.ts - target);
    if (diff < bestDiff) { best = it; bestDiff = diff; }
  }
  return best || items.at(-1);
};

// ---------- component ----------
export default function FearGreedCard() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch('https://api.alternative.me/fng/?limit=400&format=json', { cache: 'no-store' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        const mapped = (j?.data || []).map(d => ({
          value: Number(d.value),
          label: String(d.value_classification || ''),
          ts: Number(d.timestamp) * 1000
        })).sort((a, b) => b.ts - a.ts);
        if (!cancelled) setRows(mapped);
      } catch (e) {
        if (!cancelled) setErr(String(e?.message || e));
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  if (!rows && !err) {
    return (
      <Card className="h-100">
        <Card.Body><Spinner animation="border" size="sm" /></Card.Body>
      </Card>
    );
  }
  if (err) {
    return (
      <Card className="h-100">
        <Card.Body><div className="text-danger small">Failed to load: {err}</div></Card.Body>
      </Card>
    );
  }

  // points
  const now = rows[0];
  const prevClose = rows[1] || now;
  const weekAgo = nearestByDays(rows, 7);
  const monthAgo = nearestByDays(rows, 30);
  const yearAgo = nearestByDays(rows, 365);

  const val = clamp(now?.value || 0, 0, 100);
  const nowColor = valueToColor(val);
  const nowLabel = labelFor(val);
  const updated = now?.ts ? new Date(now.ts).toLocaleString() : '';

  return (
    <Card className="h-100">
      <Card.Body>

        {/* HEADER ROW: left = title/value/updated; right = history pills (tight) */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          {/* left */}
          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            <div className="text-muted mb-1">Crypto Fear &amp; Greed</div>
            <div className="d-flex align-items-baseline gap-2">
              <div className="h3 mb-0 kw-color-total">{val}</div>
              <div style={{ fontWeight: 600, color: nowColor }}>{nowLabel}</div>
            </div>
            <div className="text-muted small mt-1">Updated: {updated}</div>
          </div>

          {/* right (historical, lives in the top-right box area) */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'stretch',
              flexWrap: 'wrap',
              justifyContent: 'flex-end',
              maxWidth: 280
            }}
          >
            <MiniPill value={prevClose?.value} caption="1d" />
            <MiniPill value={weekAgo?.value} caption="1w" />
            <MiniPill value={monthAgo?.value} caption="1m" />
            <MiniPill value={yearAgo?.value} caption="1y" />
          </div>
        </div>

        {/* BAR (unchanged style) */}
        <div style={{ marginTop: 12, position: 'relative' }}>
          <div
            style={{
              height: 10,
              borderRadius: 8,
              background: 'linear-gradient(90deg, #e53935 0%, #fdd835 50%, #43a047 100%)',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            {/* dim unfilled right side */}
            <div
              style={{
                position: 'absolute',
                left: `${val}%`,
                right: 0,
                top: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.25)'
              }}
            />
            {/* standout marker */}
            <div
              style={{
                position: 'absolute',
                left: `calc(${val}% - 10px)`,
                top: -6,
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: '#fff',
                border: `3px solid ${nowColor}`,
                boxShadow: `0 0 10px ${nowColor}, 0 0 4px rgba(0,0,0,0.5)`
              }}
            />
          </div>
          <div className="d-flex justify-content-between text-muted small mt-1">
            <span>0</span><span>50</span><span>100</span>
          </div>
        </div>

      </Card.Body>
    </Card>
  );
}

// tight two-line pill used in header
function MiniPill({ value, caption }) {
  const v = clamp(Number(value ?? 0), 0, 100);
  const col = valueToColor(v);
  return (
    <div
      style={{
        width: 62,
        padding: '6px 8px',
        borderRadius: 10,
        textAlign: 'center',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        lineHeight: 1.1
      }}
    >
      <div style={{ fontWeight: 700, color: col, fontSize: 14 }}>{v}</div>
      <div className="text-muted" style={{ fontSize: 11 }}>{caption}</div>
    </div>
  );
}
