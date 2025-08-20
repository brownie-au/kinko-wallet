// src/sections/dashboard/default/PortfolioValueCard.jsx
import { useEffect, useMemo, useState } from 'react';
import { Card } from 'react-bootstrap';

import KwChainAllocationPie from '../../../components/kw-ChainAllocationPie';
import { ChainBadge } from '../../../components/ChainUI';

const LS_TOTAL_KEY = 'kw:lastTotalUsd';
const LS_PCT_KEY = 'kw:lastChangePct24h';
const LS_CHAIN_TOTALS_KEY = 'kw:chainTotalsUsd:v1';

function readPerChainTotals() {
  try {
    const raw = localStorage.getItem(LS_CHAIN_TOTALS_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj?.totals || {};
  } catch { return {}; }
}

export default function PortfolioValueCard() {
  const [totalUsd, setTotalUsd] = useState(0);
  const [pct24h, setPct24h] = useState(0);
  const [chainTotals, setChainTotals] = useState({});

  useEffect(() => {
    const pullTotals = () => {
      try {
        setTotalUsd(Number(localStorage.getItem(LS_TOTAL_KEY) || 0) || 0);
        setPct24h(Number(localStorage.getItem(LS_PCT_KEY) || 0) || 0);
      } catch { setTotalUsd(0); setPct24h(0); }
    };
    const pullChains = () => setChainTotals(readPerChainTotals());

    pullTotals(); pullChains();

    const onStorage = (e) => {
      if (e.key === LS_TOTAL_KEY || e.key === LS_PCT_KEY) pullTotals();
      if (e.key === LS_CHAIN_TOTALS_KEY) pullChains();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const formattedTotal = useMemo(
    () => (Number(totalUsd) || 0).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 }),
    [totalUsd]
  );

  // rows: pulse, eth, base (descending)
  const chainList = useMemo(() => {
    const entries = [
      ['pulse', Number(chainTotals.pulse || 0)],
      ['eth', Number(chainTotals.eth || 0)],
      ['base', Number(chainTotals.base || 0)],
    ].filter(([, v]) => v > 0);
    entries.sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((acc, [, v]) => acc + v, 0) || 0;
    return entries.map(([id, usd]) => ({ id, usd, pct: total ? (usd / total) * 100 : 0 }));
  }, [chainTotals]);

  const donutData = useMemo(() => chainList.map(({ id, usd }) => ({ id, valueUsd: usd })), [chainList]);

  const fmtUsd0 = (n) => new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0
  }).format(Number(n || 0));

  const up = Number(pct24h) >= 0;

  return (
    <Card className="h-100">
      <Card.Body className="d-flex align-items-stretch">
        {/* LEFT: numbers + per-chain rows */}
        <div
          style={{
            minWidth: 336,
            flex: '1 1 336px',
            paddingRight: 36,          // ← gutter so % doesn’t kiss the pie
          }}
        >
          <div className="text-muted mb-1">Total Portfolio Value</div>
          <div className="h3 mb-1">USD ${formattedTotal}</div>
          <div className={up ? 'text-success mb-3' : 'text-danger mb-3'}>
            {up ? '▲' : '▼'} {Math.abs(Number(pct24h) || 0).toFixed(2)}% (24h)
          </div>

          {/* Right‑aligned $ and %; balanced widths & spacing */}
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

        {/* RIGHT: donut — nudged right a touch for visual balance */}
        <div
          style={{
            flex: '0 0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            marginRight: -10,          // small nudge beyond card padding
            paddingLeft: 8,            // keeps a tidy gap from the text block
            overflow: 'visible'
          }}
        >
          <KwChainAllocationPie
            items={donutData}
            size={188}
            thickness={22}
            showLegend={false}
            showCenter={false}
          />
        </div>
      </Card.Body>
    </Card>
  );
}
