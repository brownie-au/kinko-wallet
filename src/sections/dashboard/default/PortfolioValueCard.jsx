// src/sections/dashboard/default/PortfolioValueCard.jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { Card } from 'react-bootstrap';

import KwChainAllocationPie from '../../../components/kw-ChainAllocationPie';
import { ChainBadge } from '../../../components/ChainUI';
import { usePortfolioValue } from '../../../contexts/PortfolioValueContext.jsx';

const LS_TOTAL_KEY = 'kw:lastTotalUsd';
const LS_PCT_KEY = 'kw:lastChangePct24h';
const LS_CHAIN_TOTALS_KEY = 'kw:chainTotalsUsd:v1';

function readPerChainTotals() {
  try {
    const raw = localStorage.getItem(LS_CHAIN_TOTALS_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj?.totals || {};
  } catch {
    return {};
  }
}

export default function PortfolioValueCard() {
  const [totalUsd, setTotalUsd] = useState(0);   // LS fallback for Portfolio page total
  const [pct24h, setPct24h] = useState(0);
  const [chainTotals, setChainTotals] = useState({});

  // Read aggregated sources from global context
  const { total: aggregatedTotal, sources } = usePortfolioValue();

  // --- width-driven show/hide for the pie (keeps your layout) ---
  const bodyRef = useRef(null);
  const [showPie, setShowPie] = useState(true);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;

    const BASE = 336 + 36 + 188; // min-left + gutter + pie size
    const HIDE_AT = BASE - 50;   // hide below this
    const SHOW_AT = HIDE_AT + 12;

    const ro = new ResizeObserver(([entry]) => {
      const w = entry?.contentRect?.width || el.clientWidth || 0;
      setShowPie((prev) => (prev ? w >= HIDE_AT : w >= SHOW_AT));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const pullTotals = () => {
      try {
        setTotalUsd(Number(localStorage.getItem(LS_TOTAL_KEY) || 0) || 0);
        setPct24h(Number(localStorage.getItem(LS_PCT_KEY) || 0) || 0);
      } catch {
        setTotalUsd(0);
        setPct24h(0);
      }
    };
    const pullChains = () => setChainTotals(readPerChainTotals());

    pullTotals();
    pullChains();

    const onStorage = (e) => {
      if (e.key === LS_TOTAL_KEY || e.key === LS_PCT_KEY) pullTotals();
      if (e.key === LS_CHAIN_TOTALS_KEY) pullChains();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // ---------- KEY FIX ----------
  // Sum all context sources AND add LS portfolio fallback if portfolio isn't in context yet.
  const displayTotalRaw = useMemo(() => {
    const ctxTotal = Number(aggregatedTotal) || 0;
    const lsPortfolio = Number(totalUsd) || 0;
    const hasSources = sources && Object.keys(sources).length > 0;
    const hasPortfolioSource = !!(sources && Object.prototype.hasOwnProperty.call(sources, 'portfolio'));

    if (!hasSources) {
      // No context yet → show LS portfolio (what we used to show before context)
      return lsPortfolio;
    }
    // Context present → add LS portfolio only if portfolio isn't registered yet
    return ctxTotal + (hasPortfolioSource ? 0 : lsPortfolio);
  }, [aggregatedTotal, totalUsd, sources]);
  // --------------------------------

  const formattedTotal = useMemo(
    () =>
      (Number(displayTotalRaw) || 0).toLocaleString(undefined, {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2
      }),
    [displayTotalRaw]
  );

  // rows: pulse, eth, base (descending)
  const chainList = useMemo(() => {
    const entries = [
      ['pulse', Number(chainTotals.pulse || 0)],
      ['eth', Number(chainTotals.eth || 0)],
      ['base', Number(chainTotals.base || 0)]
    ].filter(([, v]) => v > 0);
    entries.sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((acc, [, v]) => acc + v, 0) || 0;
    return entries.map(([id, usd]) => ({ id, usd, pct: total ? (usd / total) * 100 : 0 }));
  }, [chainTotals]);

  const donutData = useMemo(() => chainList.map(({ id, usd }) => ({ id, valueUsd: usd })), [chainList]);

  const fmtUsd0 = (n) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(Number(n || 0));

  const up = Number(pct24h) >= 0;

  return (
    <Card className="h-100">
      <Card.Body ref={bodyRef} className="d-flex align-items-stretch">
        {/* LEFT: numbers + per-chain rows */}
        <div
          style={{
            minWidth: 336,
            flex: '1 1 336px',
            paddingRight: 36 // ← keep your gutter
          }}
        >
          <div className="text-muted mb-1">Total Portfolio Value</div>
          <div className="h3 mb-1">USD ${formattedTotal}</div>
          <div className={up ? 'text-success mb-3' : 'text-danger mb-3'}>
            {up ? '▲' : '▼'} {Math.abs(Number(pct24h) || 0).toFixed(2)}% (24h)
          </div>

          {/* Right-aligned $ and %; balanced widths & spacing */}
          <div style={{ display: 'grid', gap: 8 }}>
            {chainList.map((row) => (
              <div
                key={row.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr minmax(30px,auto) minmax(66px,auto)',
                  alignItems: 'center',
                  columnGap: 18,
                  fontSize: 13
                }}
              >
                <ChainBadge chain={row.id} />
                <span style={{ opacity: 0.9 }}>
                  {row.id === 'pulse' ? 'PulseChain' : row.id === 'eth' ? 'Ethereum' : 'Base'}
                </span>
                <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtUsd0(row.usd)}
                </span>
                <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', opacity: 0.9 }}>
                  {row.pct.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: donut — hidden only when the card is genuinely too narrow */}
        <div
          style={{
            flex: '0 0 auto',
            display: showPie ? 'flex' : 'none',
            alignItems: 'center',
            justifyContent: 'flex-end',
            marginRight: -10, // keep your nudge
            paddingLeft: 8, // keep your tidy gap
            overflow: 'visible'
          }}
        >
          <KwChainAllocationPie items={donutData} size={188} thickness={22} showLegend={false} showCenter={false} />
        </div>
      </Card.Body>
    </Card>
  );
}
