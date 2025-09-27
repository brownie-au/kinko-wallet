// src/sections/dashboard/default/PnLCard.jsx
/* eslint-disable import/no-relative-parent-imports */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Row, Col, Badge, Placeholder, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { useRefresh } from '@/contexts/RefreshContext.jsx';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer } from 'recharts';

import {
  getGlobalSnapshot,
  // Expected to return either:
  //  - combined rows: [{ t, cap, vol }, …]  (preferred)
  //  - or a single series: [{ x|t, y }, …]  (cap by default)
  // If your service supports a 2nd arg 'metric', we'll call it for volume.
  getGlobalHistory1yWeekly,
  formatUsdCompact
} from '../../../services/marketGlobalService';

// Minimal 1Y fallback (start->now) when no history yet
const buildFallbackSeries = (value) => {
  const now = Date.now();
  const start = now - 365 * 24 * 60 * 60 * 1000;
  const v = Number(value || 0);
  const v2 = v > 0 ? v : 1;
  return [
    { x: start, y: v2 * 0.98 },
    { x: now, y: v2 }
  ];
};

const ChipStyle = () => (
  <style>{`.kw-chip { background: var(--kw-chip-bg) !important; color: #fff !important; border: 0 !important; opacity: .95; }`}</style>
);

const GREEN = '#16a34a';
const RED = '#ef4444';

const ZERO_SNAP = {
  marketCapUsd: 0,
  volume24hUsd: 0,
  btcDominancePct: 0,
  updatedAt: Date.now(),
  changePct24h: 0
};

export default function PnLCard() {
  const [snap, setSnap] = useState(ZERO_SNAP);

  // we store cap & vol separately to avoid "cap reused for vol" bugs
  const [capWeekly, setCapWeekly] = useState(buildFallbackSeries(0));
  const [volWeekly, setVolWeekly] = useState(buildFallbackSeries(0));

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const fetchTaskRef = useRef(async () => {});
  const { registerTask } = useRefresh();

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        setLoading(true);
        const [s, histMaybe] = await Promise.all([
          getGlobalSnapshot(),
          getGlobalHistory1yWeekly?.('last')
        ]);

        if (!alive) return;

        // ----- snapshot -----
        const sSafe = s && typeof s === 'object' ? s : {};
        const normalizedSnap = {
          marketCapUsd: Number(sSafe.marketCapUsd) || 0,
          volume24hUsd: Number(safeNum(sSafe.volume24hUsd)) || 0,
          btcDominancePct: Number(sSafe.btcDominancePct) || 0,
          updatedAt: Number(sSafe.updatedAt) || Date.now(),
          changePct24h: Number(sSafe.changePct24h) || 0
        };
        setSnap(normalizedSnap);

        // ----- history (weekly) -----
        let capRows = null;
        let volRows = null;

        if (Array.isArray(histMaybe) && histMaybe.length) {
          // Shape A: combined rows
          if (histMaybe[0] && (histMaybe[0].cap !== undefined || histMaybe[0].vol !== undefined)) {
            capRows = histMaybe.map(r => ({ x: r.t ?? r.x, y: r.cap ?? 0 }))
              .filter(p => isFinite(p.x) && isFinite(p.y));
            volRows = histMaybe.map(r => ({ x: r.t ?? r.x, y: r.vol ?? 0 }))
              .filter(p => isFinite(p.x) && isFinite(p.y));
          } else {
            // Shape B: single series (assume this is CAP)
            capRows = histMaybe.map(r => ({ x: r.t ?? r.x, y: r.y ?? 0 }))
              .filter(p => isFinite(p.x) && isFinite(p.y));
            // Try to fetch a separate VOL series if the service supports a metric arg
            try {
              const volMaybe = await getGlobalHistory1yWeekly?.('last', 'volume');
              if (Array.isArray(volMaybe) && volMaybe.length) {
                volRows = volMaybe.map(r => ({ x: r.t ?? r.x, y: r.y ?? r.vol ?? 0 }))
                  .filter(p => isFinite(p.x) && isFinite(p.y));
              }
            } catch {
              // ignore, will fallback below
            }
          }
        }

        // Fallbacks (never reuse cap for vol)
        if (!capRows?.length) capRows = buildFallbackSeries(normalizedSnap.marketCapUsd);
        if (!volRows?.length) volRows = buildFallbackSeries(normalizedSnap.volume24hUsd);

        setCapWeekly(capRows);
        setVolWeekly(volRows);
        setErr(null);
      } catch (e) {
        console.warn('[PnLCard] load failed:', e);
        if (!alive) return;
        setSnap({ ...ZERO_SNAP, updatedAt: Date.now() });
        setCapWeekly(buildFallbackSeries(0));
        setVolWeekly(buildFallbackSeries(0));
        setErr(e?.message || 'Failed to load');
      } finally {
        if (alive) setLoading(false);
      }
    };

    fetchTaskRef.current = async () => {
      await load();
    };

    load();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const unregister = registerTask('market:pnl', async () => {
      if (typeof fetchTaskRef.current === 'function') {
        await fetchTaskRef.current();
      }
    });
    return unregister;
  }, [registerTask]);
  const capUp = (snap?.changePct24h ?? 0) >= 0;
  const capColour = capUp ? GREEN : RED;
  // We don’t infer a 24h delta from weekly bins; show neutral for volume.
  const volColour = GREEN;

  return (
    <Card className="h-100">
      <Card.Body>
        <ChipStyle />

        <div className="d-flex justify-content-between align-items-center mb-2">
          <div className="text-muted mb-1">Global Crypto Market Cap</div>
          <div className="d-flex align-items-center gap-2">
            <OverlayTrigger placement="left" overlay={<Tooltip>Bitcoin share of total market cap</Tooltip>}>
              <Badge bg="secondary" pill>BTC {Number(snap.btcDominancePct || 0).toFixed(1)}%</Badge>
            </OverlayTrigger>
            <Badge bg="dark" pill title="Snapshot time">
              {new Date(snap.updatedAt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
            </Badge>
          </div>
        </div>

        {loading && (
          <>
            <Placeholder as="div" animation="wave" className="w-50 mb-2" style={{ height: 22 }} />
            <Placeholder as="div" animation="wave" className="w-75 mb-3" style={{ height: 16 }} />
            <Placeholder as="div" animation="wave" className="w-100" style={{ height: 44 }} />
          </>
        )}
        {err && <div className="text-danger small">Couldn’t load market data: {err}</div>}

        <Row className="g-3">
          {/* Market Cap */}
          <Col xs={12} md={6}>
            <div className="text-uppercase text-muted small mb-1">Market Cap</div>
            <div className="d-flex align-items-baseline flex-wrap gap-2">
              <div className="fw-semibold">{formatUsdCompact(snap.marketCapUsd)}</div>
              <Badge pill className="kw-chip" style={{ ['--kw-chip-bg']: capColour }}>
                {capUp ? '▲' : '▼'} {Math.abs(snap.changePct24h).toFixed(1)}%
              </Badge>
            </div>

            <div className="mt-2" style={{ width: '100%', height: 170 }}>
              <ResponsiveContainer>
                <AreaChart data={capWeekly} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="kwCapFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={capColour} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={capColour} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="x" type="number" domain={['dataMin', 'dataMax']} hide />
                  <YAxis hide domain={['auto', 'auto']} />
                  <Area
                    type="monotone"
                    dataKey="y"
                    stroke={capColour}
                    strokeWidth={2}
                    fill="url(#kwCapFill)"
                    dot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Col>

          {/* 24h Volume */}
          <Col xs={12} md={6}>
            <div className="text-uppercase text-muted small mb-1">24h Trading Volume</div>
            <div className="d-flex align-items-baseline flex-wrap gap-2">
              <div className="fw-semibold">{formatUsdCompact(snap.volume24hUsd)}</div>
              <Badge pill className="kw-chip" style={{ ['--kw-chip-bg']: volColour }}>
                ▲ 0.0%
              </Badge>
            </div>

            <div className="mt-2" style={{ width: '100%', height: 170 }}>
              <ResponsiveContainer>
                <AreaChart data={volWeekly} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="kwVolFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={volColour} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={volColour} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="x" type="number" domain={['dataMin', 'dataMax']} hide />
                  <YAxis hide domain={['auto', 'auto']} />
                  <Area
                    type="monotone"
                    dataKey="y"
                    stroke={volColour}
                    strokeWidth={2}
                    fill="url(#kwVolFill)"
                    dot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Col>
        </Row>
      </Card.Body>
    </Card>
  );
}

// ---- helpers ----
function safeNum(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }


