// src/sections/dashboard/default/PortfolioValueCard.jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { Card } from 'react-bootstrap';

import KwChainAllocationPie from '../../../components/kw-ChainAllocationPie';
import { ChainBadge } from '../../../components/ChainUI';
import {
  usePortfolioValue,
  HEX_STAKING_SOURCE,
  EHEX_STAKING_SOURCE
} from '../../../contexts/PortfolioValueContext.jsx';

const LS_TOTAL_KEY = 'kw:lastTotalUsd';
const LS_PCT_KEY = 'kw:lastChangePct24h';
const LS_CHAIN_TOTALS_KEY = 'kw:chainTotalsUsd:v1';

// optional LS fallbacks some staking views may write
const LS_HEX_STAKE_SUMMARY = 'kw:staking:hex:summary';
const LS_EHEX_STAKE_SUMMARY = 'kw:staking:ehex:summary';

// orange/yellow accent for staking chip
const STAKING_COLOUR = '#F5A200';

// read cached per-chain totals used by this tile
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

// robust numeric extraction from number/string/object
function toUsd(value) {
  if (value == null) return 0;

  // direct numeric or numeric string
  const n = Number(value);
  if (Number.isFinite(n)) return n;

  // object shapes we’ve seen: { usd }, { totalUsd }, { total }, { value }
  if (typeof value === 'object') {
    const candidates = [value.usd, value.totalUsd, value.total, value.value, value.amountUsd];
    for (const c of candidates) {
      const m = Number(c);
      if (Number.isFinite(m)) return m;
    }
  }
  return 0;
}

// Chip sized & styled to match ChainBadge pills; colour overridable
function StakingChip({ bgColor = STAKING_COLOUR, fgColor = '#fff', label = 'STAKES' }) {
  return (
    <span
      className="badge rounded-pill"
      style={{
        backgroundColor: bgColor,
        color: fgColor,
        // keep sizing consistent with other ChainBadge pills
        padding: '4px 8.2px',
        fontSize: 11,
        lineHeight: 1
      }}
    >
      {label}
    </span>
  );
}

export default function PortfolioValueCard() {
  const [totalUsd, setTotalUsd] = useState(0); // LS fallback for Portfolio page total
  const [pct24h, setPct24h] = useState(0);
  const [chainTotals, setChainTotals] = useState({});

  // aggregated sources from global context
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

  // ---------- aggregated staking value (HEX + eHEX) ----------
  const stakingUsd = useMemo(() => {
    let sum = 0;
    const used = new Set();

    // 1) canonical keys if present
    if (HEX_STAKING_SOURCE) {
      sum += toUsd(sources?.[HEX_STAKING_SOURCE]);
      used.add(HEX_STAKING_SOURCE);
    }
    if (EHEX_STAKING_SOURCE) {
      sum += toUsd(sources?.[EHEX_STAKING_SOURCE]);
      used.add(EHEX_STAKING_SOURCE);
    }

    // 2) if nothing yet, discover any other staking-like keys
    if (!sum && sources && typeof sources === 'object') {
      for (const [k, v] of Object.entries(sources)) {
        const kk = String(k || '').toLowerCase();
        if (used.has(k)) continue;
        if (kk.includes('staking') || kk.includes('stake')) {
          sum += toUsd(v);
        }
      }
    }

    // 3) LS fallback (if a staking view wrote summaries)
    if (!sum) {
      try {
        const hexLS = JSON.parse(localStorage.getItem(LS_HEX_STAKE_SUMMARY) || 'null');
        const ehexLS = JSON.parse(localStorage.getItem(LS_EHEX_STAKE_SUMMARY) || 'null');
        sum = toUsd(hexLS) + toUsd(ehexLS);
      } catch {
        // ignore
      }
    }

    return sum || 0;
  }, [sources]);

  // rows: pulse, eth, base + staking (descending)
  const chainList = useMemo(() => {
    const entries = [
      ['pulse', Number(chainTotals.pulse || 0)],
      ['eth', Number(chainTotals.eth || 0)],
      ['base', Number(chainTotals.base || 0)],
      ['staking', stakingUsd]
    ].filter(([, v]) => v > 0);

    entries.sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((acc, [, v]) => acc + v, 0) || 0;

    return entries.map(([id, usd]) => ({ id, usd, pct: total ? (usd / total) * 100 : 0 }));
  }, [chainTotals, stakingUsd]);

  // Keep the donut as chain allocation only (Pulse/Eth/Base)
  const donutData = useMemo(
    () =>
      chainList
        .filter(({ id }) => id === 'pulse' || id === 'eth' || id === 'base')
        .map(({ id, usd }) => ({ id, valueUsd: usd })),
    [chainList]
  );

  // ---------- total display (prefer context; else sum of rows; else LS) ----------
  const displayTotalRaw = useMemo(() => {
    const ctxTotal = Number(aggregatedTotal) || 0;
    if (ctxTotal > 0) return ctxTotal;

    // sum what we're showing in the rows (keeps top in-sync with chips)
    const rowsSum =
      Number(chainTotals.pulse || 0) +
      Number(chainTotals.eth || 0) +
      Number(chainTotals.base || 0) +
      Number(stakingUsd || 0);

    if (rowsSum > 0) return rowsSum;

    // final fallback to sticky LS portfolio total
    return Number(totalUsd) || 0;
  }, [aggregatedTotal, chainTotals, stakingUsd, totalUsd]);

  const formattedTotal = useMemo(
    () =>
      (Number(displayTotalRaw) || 0).toLocaleString(undefined, {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2
      }),
    [displayTotalRaw]
  );

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
        {/* LEFT: numbers + per-asset rows */}
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
                {row.id === 'staking' ? (
                  <>
                    {/* pill sized like ChainBadge; colours overridable via props */}
                    <StakingChip />
                    {/* same muted label colour as others */}
                    <span style={{ opacity: 0.9 }}>
                      Staking &amp; Mining
                    </span>
                  </>
                ) : (
                  <>
                    <ChainBadge chain={row.id} />
                    <span style={{ opacity: 0.9 }}>
                      {row.id === 'pulse' ? 'PulseChain' : row.id === 'eth' ? 'Ethereum' : 'Base'}
                    </span>
                  </>
                )}

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
            paddingLeft: 8,   // tidy gap
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
