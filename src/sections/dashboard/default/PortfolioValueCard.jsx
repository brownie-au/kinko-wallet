import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, OverlayTrigger, Tooltip } from 'react-bootstrap';

import KwChainAllocationPie from '../../../components/kw-ChainAllocationPie';
import { ChainBadge } from '../../../components/ChainUI';
import {
  usePortfolioValue,
  HEX_STAKING_SOURCE,
  EHEX_STAKING_SOURCE
} from '../../../contexts/PortfolioValueContext.jsx';
import { useWallets } from '../../../contexts/WalletContext.jsx';

const LS_TOTAL_KEY = 'kw:lastTotalUsd';
const LS_PCT_KEY = 'kw:lastChangePct24h';
const LS_PCT_META_KEY = 'kw:lastChangePct24hMeta';
const LS_CHAIN_TOTALS_KEY = 'kw:chainTotalsUsd:v1';
const chainTotalsKeyFor = (sig) => (sig ? `${LS_CHAIN_TOTALS_KEY}:${sig}` : LS_CHAIN_TOTALS_KEY);
const APPROX_TOOLTIP = 'Approximate based on market 24h change.';
const COUNTDOWN_TOOLTIP = 'Full 24h change available after your first 24h of usage.';

// optional LS fallbacks some staking views may write
const LS_HEX_STAKE_SUMMARY = 'kw:staking:hex:summary';
const LS_EHEX_STAKE_SUMMARY = 'kw:staking:ehex:summary';

const STAKING_COLOUR = '#F5A200';

/* ----------------------- helpers ----------------------- */
function num(x) {
  if (x == null) return 0;
  if (typeof x === 'number') return Number.isFinite(x) ? x : 0;
  if (typeof x === 'string') {
    const cleaned = x.replace(/[, ]+/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Prefer canonical key when aliases disagree by >20% */
function preferCanonical({ aliases, totals }) {
  const vals = aliases.map(k => num(totals?.[k]));
  const max = Math.max(...vals);
  if (!Number.isFinite(max) || max <= 0) return 0;

  const canonical = num(totals?.[aliases[0]]);
  if (canonical > 0 && (max - Math.min(canonical, max)) / max > 0.2) return canonical;

  for (const k of aliases) {
    const v = num(totals?.[k]);
    if (v > 0) return v;
  }
  return max || 0;
}

/**
 * Read per-wallet chain totals (no legacy fallback).
 * The Portfolio writer now standardizes aliases inside the object, so we just canonicalise.
 */
function readChainTotalsCache(sig) {
  try {
    const raw = localStorage.getItem(chainTotalsKeyFor(sig));
    if (!raw) return { eth: 0, pulse: 0, bsc: 0, polygon: 0, base: 0, updatedAt: 0 };

    const parsed = JSON.parse(raw);
    const totals = parsed?.totals || parsed || {};

    const ethUsd = preferCanonical({ aliases: ['ethereum', 'eth'], totals });
    const pulseUsd = preferCanonical({ aliases: ['pulse', 'pulsechain', 'pls'], totals });
    const bscUsd = preferCanonical({ aliases: ['bsc'], totals });
    const polygonUsd = preferCanonical({ aliases: ['polygon', 'matic', 'pol'], totals });
    const baseUsd = preferCanonical({ aliases: ['base'], totals });

    const updatedAt = num(parsed?.updatedAt);

    return { eth: ethUsd, pulse: pulseUsd, bsc: bscUsd, polygon: polygonUsd, base: baseUsd, updatedAt };
  } catch {
    return { eth: 0, pulse: 0, bsc: 0, polygon: 0, base: 0, updatedAt: 0 };
  }
}

function readChangeMeta() {
  try {
    const raw = localStorage.getItem(LS_PCT_META_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function formatCountdown(ms) {
  const minutes = Math.ceil(Math.max(0, Number(ms) || 0) / 60000);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const hh = hours.toString().padStart(2, '0');
  const mm = mins.toString().padStart(2, '0');
  return `${hh}h ${mm}m`;
}

// robust numeric extraction for staking context values
function toUsd(value) {
  if (value == null) return 0;
  const n = Number(value);
  if (Number.isFinite(n)) return n;
  if (typeof value === 'object') {
    for (const c of [value.usd, value.totalUsd, value.total, value.value, value.amountUsd]) {
      const m = Number(c);
      if (Number.isFinite(m)) return m;
    }
  }
  return 0;
}

function StakingChip({ bgColor = STAKING_COLOUR, fgColor = '#fff', label = 'STAKES' }) {
  return (
    <span
      className="badge rounded-pill"
      style={{ backgroundColor: bgColor, color: fgColor, padding: '4px 8.2px', fontSize: 11, lineHeight: 1 }}
    >
      {label}
    </span>
  );
}

/* ----------------------- component ----------------------- */
export default function PortfolioValueCard() {
  // Wallet signature (context → LS → default), same as Portfolio.jsx
  let ctx;
  try { ctx = useWallets(); } catch { ctx = undefined; }
  const fromCtx = Array.isArray(ctx?.wallets) ? ctx.wallets : [];
  const fromLS = (() => { try { return JSON.parse(localStorage.getItem('wallets') || '[]'); } catch { return []; } })();
  const wallets = (fromCtx.length ? fromCtx : fromLS);
  const walletsSig = (wallets || [])
    .map((w) => (w.address || '').toLowerCase())
    .filter(Boolean)
    .sort()
    .join(',');

  const [totalUsd, setTotalUsd] = useState(0);
  const [pct24h, setPct24h] = useState(null);
  const [changeMeta, setChangeMeta] = useState(() => readChangeMeta());

  const [{ eth, pulse, bsc, polygon, base }, setChainTotals] = useState({ eth: 0, pulse: 0, bsc: 0, polygon: 0, base: 0 });
  const lastTsRef = useRef(0);

  const { total: aggregatedTotal, sources } = usePortfolioValue();

  const bodyRef = useRef(null);
  const [showPie, setShowPie] = useState(true);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const BASE = 336 + 36 + 188;
    const HIDE_AT = BASE - 50;
    const SHOW_AT = HIDE_AT + 12;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry?.contentRect?.width || el.clientWidth || 0;
      setShowPie(prev => (prev ? w >= HIDE_AT : w >= SHOW_AT));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // One-time migration: if per-wallet missing but legacy exists, migrate then delete legacy.
  useEffect(() => {
    try {
      const key = chainTotalsKeyFor(walletsSig);
      if (!localStorage.getItem(key)) {
        const legacy = localStorage.getItem(LS_CHAIN_TOTALS_KEY);
        if (legacy) {
          localStorage.setItem(key, legacy);
          try { localStorage.removeItem(LS_CHAIN_TOTALS_KEY); } catch { }
          window.dispatchEvent(new StorageEvent('storage', { key, newValue: 'migrated' }));
        }
      }
    } catch { }
  }, [walletsSig]);

  // sticky totals + per-chain totals (storage listener + same-tab polling)
  useEffect(() => {
    const pullTotals = () => {
      try {
        const total = Number(localStorage.getItem(LS_TOTAL_KEY) || 0) || 0;
        setTotalUsd(total);
        const meta = readChangeMeta();
        setChangeMeta(meta);
        const rawPct = localStorage.getItem(LS_PCT_KEY);
        let nextPct = null;
        const metaPct = meta?.pct;
        if (typeof metaPct === 'number' && Number.isFinite(metaPct)) {
          nextPct = metaPct;
        } else if (rawPct != null) {
          const parsed = Number(rawPct);
          if (Number.isFinite(parsed)) nextPct = parsed;
        }
        setPct24h(nextPct);
      } catch {
        setTotalUsd(0);
        setChangeMeta(null);
        setPct24h(null);
      }
    };
    const pullChains = () => {
      const next = readChainTotalsCache(walletsSig);
      const changed =
        next.updatedAt > (lastTsRef.current || 0) ||
        next.eth !== eth || next.pulse !== pulse || next.bsc !== bsc || next.polygon !== polygon || next.base !== base;
      if (changed) {
        lastTsRef.current = next.updatedAt || Date.now();
        setChainTotals({ eth: next.eth, pulse: next.pulse, bsc: next.bsc, polygon: next.polygon, base: next.base });
      }
    };

    pullTotals();
    pullChains();

    const onStorage = (e) => {
      if (e.key === LS_TOTAL_KEY || e.key === LS_PCT_KEY || e.key === LS_PCT_META_KEY) pullTotals();
      if (e.key === chainTotalsKeyFor(walletsSig)) pullChains(); // per-wallet only
    };
    window.addEventListener('storage', onStorage);
    const id = setInterval(pullChains, 4000); // same-tab refresh
    return () => { window.removeEventListener('storage', onStorage); clearInterval(id); };
  }, [eth, pulse, bsc, polygon, base, walletsSig]);

  // staking: HEX + eHEX aggregation with fallbacks
  const stakingUsd = useMemo(() => {
    let sum = 0;
    const used = new Set();
    if (HEX_STAKING_SOURCE) { sum += toUsd(sources?.[HEX_STAKING_SOURCE]); used.add(HEX_STAKING_SOURCE); }
    if (EHEX_STAKING_SOURCE) { sum += toUsd(sources?.[EHEX_STAKING_SOURCE]); used.add(EHEX_STAKING_SOURCE); }
    if (!sum && sources && typeof sources === 'object') {
      for (const [k, v] of Object.entries(sources)) {
        const kk = String(k || '').toLowerCase();
        if (used.has(k)) continue;
        if (kk.includes('staking') || kk.includes('stake')) sum += toUsd(v);
      }
    }
    if (!sum) {
      try {
        const hexLS = JSON.parse(localStorage.getItem(LS_HEX_STAKE_SUMMARY) || 'null');
        const ehexLS = JSON.parse(localStorage.getItem(LS_EHEX_STAKE_SUMMARY) || 'null');
        sum = toUsd(hexLS) + toUsd(ehexLS);
      } catch { /* ignore */ }
    }
    return sum || 0;
  }, [sources]);

  // rows (sorted)
  const chainList = useMemo(() => {
    const entries = [
      ['pulse', num(pulse)],
      ['eth', num(eth)],
      ['bsc', num(bsc)],
      ['polygon', num(polygon)],
      ['base', num(base)],
      ['staking', num(stakingUsd)]
    ].filter(([, v]) => v > 0);
    entries.sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((acc, [, v]) => acc + v, 0) || 0;
    return entries.map(([id, usd]) => ({ id, usd, pct: total ? (usd / total) * 100 : 0 }));
  }, [pulse, eth, bsc, polygon, base, stakingUsd]);

  // donut (chains + staking)
    const donutData = useMemo(
        () =>
        chainList.map(({ id, usd }) => {
            if (id === 'staking') {
                return { id, valueUsd: usd, color: STAKING_COLOUR };
              }
            return { id, valueUsd: usd };
          }),
    [chainList]
      );

  // headline = max(context, rows sum), else sticky LS
  const displayTotalRaw = useMemo(() => {
    const ctx = num(aggregatedTotal);
    const rows = num(pulse) + num(eth) + num(bsc) + num(polygon) + num(base) + num(stakingUsd);
    if (ctx >= rows) return ctx;
    if (rows > 0) return rows;
    return num(totalUsd);
  }, [aggregatedTotal, pulse, eth, polygon, base, stakingUsd, totalUsd]);

  const formattedTotal = useMemo(
    () => (Number(displayTotalRaw) || 0).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 }),
    [displayTotalRaw]
  );

  const fmtUsd0 = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
    .format(Number(n || 0));

  const meta = changeMeta || {};
  const pctFromMeta = typeof meta.pct === 'number' && Number.isFinite(meta.pct) ? meta.pct : null;
  const pctValue = pctFromMeta ?? (typeof pct24h === 'number' && Number.isFinite(pct24h) ? pct24h : null);
  const approx = Boolean(meta.approx);
  const mode = meta.mode || (pctValue != null ? 'api' : 'unknown');

  let changeClass = 'text-muted mb-3';
  let changeLabel = '0.00% (24h)';
  let changeTooltip;

  if (mode === 'countdown' && typeof meta.remainingMs === 'number') {
    changeClass = 'text-muted mb-3';
    changeLabel = `Collecting 24h history — ${formatCountdown(meta.remainingMs)} remaining`;
    changeTooltip = COUNTDOWN_TOOLTIP;
  } else if (pctValue != null) {
    const isZero = Math.abs(pctValue) < 0.005;
    const prefix = approx ? '~ ' : '';
    const formatted = Math.abs(pctValue).toFixed(2);
    if (isZero) {
      changeLabel = `${prefix}${formatted}% (24h)`;
      changeClass = 'text-muted mb-3';
    } else if (pctValue > 0) {
      changeLabel = `${prefix}▲ ${formatted}% (24h)`;
      changeClass = 'text-success mb-3';
    } else {
      changeLabel = `${prefix}▼ ${formatted}% (24h)`;
      changeClass = 'text-danger mb-3';
    }
    if (approx) changeTooltip = APPROX_TOOLTIP;
  }

  const changeDiv = (
    <div className={changeClass} style={changeTooltip ? { cursor: 'help' } : undefined}>
      {changeLabel}
    </div>
  );

  const changeNode = changeTooltip ? (
    <OverlayTrigger placement="top" overlay={<Tooltip>{changeTooltip}</Tooltip>}>
      {changeDiv}
    </OverlayTrigger>
  ) : changeDiv;

  return (
    <Card className="h-100">
      <Card.Body ref={bodyRef} className="d-flex align-items-stretch">
        {/* LEFT: numbers + per-asset rows */}
        <div style={{ minWidth: 336, flex: '1 1 336px', paddingRight: 36 }}>
          <div className="text-muted mb-1">Total Portfolio Value</div>
          <div className="h3 mb-1 kw-color-total">USD ${formattedTotal}</div>
          {changeNode}

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
                    <StakingChip />
                    <span style={{ opacity: 0.9 }}>Staking &amp; Mining</span>
                  </>
                ) : (
                  <>
                    <ChainBadge chain={row.id}>{row.id === 'polygon' ? 'POL' : undefined}</ChainBadge>
                    <span style={{ opacity: 0.9 }}>
                      {row.id === 'pulse' ? 'PulseChain' : row.id === 'eth' ? 'Ethereum' : row.id === 'bsc' ? 'BSC' : row.id === 'polygon' ? 'Polygon' : 'Base'}
                    </span>
                  </>
                )}
                <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtUsd0(row.usd)}</span>
                <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', opacity: 0.9 }}>
                  {row.pct.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: donut */}
        <div
          style={{
            flex: '0 0 auto',
            display: showPie ? 'flex' : 'none',
            alignItems: 'center',
            justifyContent: 'flex-end',
            marginRight: -10,
            paddingLeft: 8,
            overflow: 'visible'
          }}
        >
          <KwChainAllocationPie items={donutData} size={188} thickness={22} showLegend={false} showCenter={false} />
        </div>
      </Card.Body>
    </Card>
  );
}
