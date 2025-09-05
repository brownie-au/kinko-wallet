// src/sections/dashboard/default/TopTokensRow.jsx
/* eslint-disable import/no-relative-parent-imports */
import { useMemo } from 'react';
import { Card, Button } from 'react-bootstrap';
import useTopTokens from '../../../hooks/useTopTokens';
import { setForceGlobalChipOnce } from '../../../utils/uiState';
import TokenLogo from '../../../components/TokenLogo';
import { ChainBadge } from '../../../components/ChainUI';
import { getWalletCache } from '../../../utils/walletCache';
import { getManagedWalletAddresses } from '../../../services/snapshotService';

/* ---------- formatters ---------- */
const fmtUsd = (n) =>
    `USD $${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function fmtTokenPrice(n) {
    const v = Number(n) || 0;
    if (!isFinite(v) || v === 0) return '$0.00';
    if (v >= 1000) return `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    if (v >= 1) return `$${v.toLocaleString(undefined, { maximumFractionDigits: 4 })}`;
    if (v >= 0.01) return `$${v.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 })}`;
    return `$${v.toPrecision(6)}`;
}
const fmtPct = (n) =>
    `${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

/* ---------- chain helpers ---------- */
function chainIdOf(chain) {
    switch (String(chain || '').toLowerCase()) {
        case 'pulse': return 369;
        case 'bsc': return 56;
        case 'polygon': return 137;
        case 'base': return 8453;
        case 'eth':
        case 'ethereum':
        default: return 1;
    }
}
function chainLabel(c) {
    const s = String(c || '').toLowerCase();
    return s === 'pulse' ? 'Pulse' : s === 'bsc' ? 'BSC' : s === 'polygon' ? 'Polygon' : s === 'base' ? 'Base' : 'ETH';
}

/* IMPORTANT: key format must match Portfolio.jsx keyFor(tt) logic */
const tokenKey = (t) =>
    `${String(t?.chain || '').toLowerCase()}:${(t?.address || t?.contract || (String(t?.symbol).toUpperCase() === 'PLS' ? 'native' : '') || '').toLowerCase()
    }:${(t?.symbol || '').toUpperCase()
    }`;

/* ---------- wallet-cache lookup ---------- */
// Build a per‑token bag from wallet caches (same source as the table).
// Each entry: { chain, address, symbol, amount, valueUsd, priceUsd }
function useWalletTokenLookup() {
    return useMemo(() => {
        const bag = [];
        const addrs = getManagedWalletAddresses();
        for (const addr of addrs) {
            if (!addr) continue;
            const wc = getWalletCache(addr, { maxAge: Number.MAX_SAFE_INTEGER }) || {};
            const tokens = wc?.tokens || wc?.portfolioTokens || wc?.assets || [];
            for (const r of tokens) {
                const chain = (r?.chain || r?.network || '').toLowerCase();
                const address = (r?.address || r?.contract || (String(r?.symbol).toUpperCase() === 'PLS' ? 'native' : '')).toLowerCase();
                const symbol = (r?.symbol || r?.ticker || '').toUpperCase();
                const amount = Number(r?.amount ?? r?.balance ?? 0) || 0;
                const valueUsd = Number(r?.valueUsd ?? r?.usd ?? r?.totalUsd ?? 0) || 0;
                const priceUsd = Number(r?.priceUsd ?? r?.price ?? (amount > 0 ? valueUsd / amount : 0)) || 0;
                bag.push({ chain, address, symbol, amount, valueUsd, priceUsd });
            }
        }
        return bag;
    }, []);
}

/* Resolve unit price for a tile t using wallet caches (same source as table) */
function resolveTokenPrice(t, lookupRows) {
    const chain = String(t?.chain || '').toLowerCase();
    const symbol = (t?.symbol || '').toUpperCase();
    const addr = (t?.address || t?.contract || (symbol === 'PLS' ? 'native' : '')).toLowerCase();

    // 1) exact (chain + address + symbol)
    const exact = lookupRows.filter(r =>
        r.chain === chain && (!!addr ? r.address === addr : true) && r.symbol === symbol && r.priceUsd > 0
    );
    if (exact.length) {
        const amt = exact.reduce((a, r) => a + r.amount, 0);
        const val = exact.reduce((a, r) => a + r.valueUsd, 0);
        if (amt > 0) return val / amt;
    }

    // 2) fallback: chain + symbol (address missing in top cache)
    const sameSym = lookupRows.filter(r => r.chain === chain && r.symbol === symbol);
    if (sameSym.length) {
        const amt = sameSym.reduce((a, r) => a + r.amount, 0);
        const val = sameSym.reduce((a, r) => a + r.valueUsd, 0);
        if (amt > 0) return val / amt;
    }

    // 3) finally: use the tile’s own fields if present
    const tAmt = Number(t?.amount) || 0;
    const tVal = Number(t?.valueUsd) || 0;
    if (tAmt > 0) return tVal / tAmt;

    return 0;
}

/* ---------- styles ---------- */
const Styles = () => (
    <style>{`
    .kwt5-wrap { margin-top: .25rem; }
    .kwt5-grid { display:grid; grid-template-columns: repeat(6, minmax(0,1fr)); gap:12px; }
    @media (max-width: 1200px){ .kwt5-grid{ grid-template-columns: repeat(3,minmax(0,1fr)); } }
    @media (max-width: 768px){  .kwt5-grid{ grid-template-columns: repeat(2,minmax(0,1fr)); } }
    .kwt5-card{ border:1px solid var(--bs-border-color); box-shadow:0 2px 6px rgba(0,0,0,.12);
      transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease; }
    .kwt5-card:hover{ transform: translateY(-1px); box-shadow:0 6px 16px rgba(0,0,0,.18);
      border-color: color-mix(in srgb, var(--bs-border-color) 70%, #fff 30%); }
    .kwt5-card .card-body{ padding:10px 12px; }
    .kwt5-head{ display:grid; grid-template-columns:36px 1fr auto; gap:10px; align-items:center; margin-bottom:6px; }
    .kwt5-symbol{ font-weight:900; letter-spacing:.2px; font-size:16px; }
    .kwt5-subline{ display:flex; align-items:center; gap:6px; margin-top:2px; font-size:12px; min-height:18px; }
    .kwt5-iconbtn{ --btn-size:28px; width:var(--btn-size); height:var(--btn-size); padding:0;
      display:inline-flex; align-items:center; justify-content:center; border-radius:8px;
      border:1px solid var(--bs-border-color); background:var(--bs-secondary-bg); }
    .kwt5-block{ display:flex; align-items:flex-end; justify-content:space-between; gap:8px; }
    .kwt5-price-line{ display:flex; align-items:baseline; gap:8px; font-size:13px; line-height:1.1; }
    .kwt5-delta.up{ color:#1fbf75; } .kwt5-delta.down{ color:#e55353; }
    .kwt5-usd{ margin-top:4px; font-weight:800; font-size:15px; }
    .kwt5-right{ display:flex; align-items:center; gap:8px; }
    .kwt5-right .kwt5-right-text small{ font-size:11px; color:var(--bs-secondary-color); }
    [data-pc-theme='dark'] .kwt5-right .kwt5-right-text small{ color: rgba(255,255,255,.85); }
    .kwt5-vbar{ width:10px; height:52px; border-radius:6px; background:var(--bs-secondary-bg);
      overflow:hidden; position:relative; }
    .kwt5-vbar > i{ position:absolute; bottom:0; left:0; right:0; background:var(--bs-primary);
      display:block; width:100%; height:0%; transition:height .3s ease; }
  `}</style>
);

/* ---------- UI bits ---------- */
function ChartIcon() {
    return (
        <svg className="kwt5-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M3 19h18v2H3zM7 10a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v7H7v-7zm6-4a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v11h-3V6zm-9 8a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v3H4v-3z" />
        </svg>
    );
}

function VerticalPercent({ pct }) {
    const safe = Math.max(0, Math.min(100, Number(pct) || 0));
    return <div className="kwt5-vbar"><i style={{ height: `${safe}%` }} /></div>;
}

/* ---------- Tile ---------- */
function Tile({ t, totalUsd, lookupRows }) {
    const pct = useMemo(() => {
        const v = Number(t?.valueUsd) || 0; const tot = Number(totalUsd) || 0;
        return tot > 0 ? (v / tot) * 100 : 0;
    }, [t, totalUsd]);

    // Resolve price from wallet caches (same as table)
    const unitPrice = resolveTokenPrice(t, lookupRows);

    const change = t?.change24hPct;
    const deltaCls = change == null ? '' : change >= 0 ? 'up' : 'down';
    // WHITE-LINE FIX: don’t render a placeholder when change is missing
    const deltaTxt = change == null ? '' : `${change >= 0 ? '▲' : '▼'} ${fmtPct(Math.abs(change))}`;

    // EXPAND FIX: persist focus keys before routing
    const openViewAll = () => {
        try {
            localStorage.setItem('kw:focusToken', t?.symbol || t?.address || t?.contract || '');
            localStorage.setItem('kw:focusTokenKey', tokenKey(t));
            // Force-select the All chain pill when landing on /portfolio
            setForceGlobalChipOnce('all');
        } catch { }
        window.location.assign('/portfolio');
    };

    const logoChainId = chainIdOf(t?.chain);
    const logoAddr = t?.address || t?.contract || null;

    return (
        <Card className="kwt5-card" role="button" onClick={openViewAll}>
            <Card.Body>
                <div className="kwt5-head">
                    <div><TokenLogo chainId={logoChainId} address={logoAddr} symbol={t?.symbol} size={36} /></div>
                    <div className="min-w-0">
                        <div className="kwt5-symbol">{t?.symbol || t?.name || '—'}</div>
                        <div className="kwt5-subline">
                            <ChainBadge chain={t?.chain}>{chainLabel(t?.chain)}</ChainBadge>
                        </div>
                    </div>
                    <div>
                        <Button
                            className="kwt5-iconbtn"
                            variant="light"
                            as="a"
                            href={`https://dexscreener.com/search?q=${encodeURIComponent(t?.address || t?.symbol || '')}`}
                            title="Open chart"
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <ChartIcon />
                        </Button>
                    </div>
                </div>

                <div className="kwt5-block">
                    <div className="me-2 flex-grow-1">
                        <div className="kwt5-price-line">
                            <span>{fmtTokenPrice(unitPrice)}</span>
                            {deltaTxt && <small className={`kwt5-delta ${deltaCls}`}>{deltaTxt}</small>}
                        </div>
                        <div className="kwt5-usd">{fmtUsd(t?.valueUsd)}</div>
                    </div>
                    <div className="kwt5-right">
                        <div className="kwt5-right-text">
                            <div className="fw-semibold">{fmtPct(pct)}</div>
                            <small>of portfolio</small>
                        </div>
                        <VerticalPercent pct={pct} />
                    </div>
                </div>
            </Card.Body>
        </Card>
    );
}

/* ---------- Main ---------- */
export default function TopTokensRow() {
    const top = useTopTokens(6);
    const totalUsd = Number(localStorage.getItem('kw:lastTotalUsd') || 0) || 0;
    const lookupRows = useWalletTokenLookup();

    const list = useMemo(
        () => [...(top || [])].filter(x => (Number(x.valueUsd) || 0) > 0).slice(0, 6),
        [top]
    );

    const goAll = () => {
        try {
            // Force-select the All chain pill when landing on /portfolio
            setForceGlobalChipOnce('all');
        } catch { }
        // keep behaviour consistent with tile click (no focus set here)
        window.location.assign('/portfolio');
    };

    return (
        <div className="kwt5-wrap">
            <Styles />
            <div className="d-flex align-items-center justify-content-between mb-2">
                <h6 className="m-0 text-uppercase text-muted">Top Tokens</h6>
                <Button size="sm" variant="outline-secondary" onClick={goAll}>View All</Button>
            </div>

            <div className="kwt5-grid">
                {list.length > 0
                    ? list.map((t, i) => (
                        <Tile key={(t.address || t.contract || t.symbol || i) + String(i)} t={t} totalUsd={totalUsd} lookupRows={lookupRows} />
                    ))
                    : Array.from({ length: 6 }).map((_, i) => (
                        <Card key={`placeholder-${i}`} className="kwt5-card">
                            <Card.Body className="d-flex align-items-center justify-content-center text-muted" style={{ minHeight: 92 }}>
                                <small>Waiting for data…</small>
                            </Card.Body>
                        </Card>
                    ))
                }
            </div>
        </div>
    );
}
