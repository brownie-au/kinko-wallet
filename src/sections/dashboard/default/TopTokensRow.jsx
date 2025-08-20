// src/sections/dashboard/default/TopTokensRow.jsx
/* eslint-disable import/no-relative-parent-imports */
import { useMemo } from 'react';
import { Card, Button } from 'react-bootstrap';
import useTopTokens from '../../../hooks/useTopTokens';
import TokenLogo from '../../../components/TokenLogo';
import { ChainBadge } from '../../../components/ChainUI';
import { getWalletCache } from '../../../utils/walletCache';
import wallets from '../../../data/wallets.js';

// ---------- helpers ----------
const fmtUsd = (n) =>
    `USD $${(Number(n) || 0).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;

function fmtTokenPrice(n) {
    const v = Number(n) || 0;
    if (!isFinite(v) || v === 0) return '$0.00';
    if (v >= 1000) return `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    if (v >= 1) return `$${v.toLocaleString(undefined, { maximumFractionDigits: 4 })}`;
    if (v >= 0.01) return `$${v.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 })}`;
    return `$${v.toPrecision(6)}`;
}

const fmtPct = (n) =>
    `${(Number(n) || 0).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}%`;

function getTotalFromLS() {
    try { return Number(localStorage.getItem('kw:lastTotalUsd') || 0); } catch { return 0; }
}
function dexUrlFor(t) {
    if (t?.dexUrl) return t.dexUrl;
    const q = encodeURIComponent(t?.address || t?.symbol || '');
    return `https://dexscreener.com/search?q=${q}`;
}
function chainIdOf(chain) {
    switch (String(chain || '').toLowerCase()) {
        case 'pulse': return 369;
        case 'base': return 8453;
        case 'eth':
        case 'ethereum':
        default: return 1;
    }
}
function chainLabel(c) {
    return String(c || '').toLowerCase() === 'pulse'
        ? 'Pulse'
        : String(c || '').toLowerCase() === 'base'
            ? 'Base'
            : 'ETH';
}
const tokenKey = (t) => `${String(t?.chain || '').toLowerCase()}:${(t?.address || 'native').toLowerCase()}:${(t?.symbol || '').toUpperCase()}`;

// Build a quick lookup from wallet caches so we can show price/amount even if Top-5 cache lacked them.
function useWalletTokenLookup() {
    return useMemo(() => {
        const bag = new Map();
        for (const w of (wallets || [])) {
            const addr = (w?.address || w)?.toLowerCase?.() || '';
            if (!addr) continue;
            const wc = getWalletCache(addr, { maxAge: Number.MAX_SAFE_INTEGER }) || {};
            const tokens = wc?.tokens || wc?.portfolioTokens || wc?.assets || [];
            for (const t of tokens) {
                const key = tokenKey(t);
                const prev = bag.get(key) || { amount: 0, valueUsd: 0, price: 0, ...t };
                const amount = Number(t?.amount ?? t?.balance ?? 0) || 0;
                const valueUsd = Number(t?.valueUsd ?? t?.usd ?? 0) || 0;
                const price = Number(t?.priceUsd ?? t?.price ?? (amount > 0 ? valueUsd / amount : 0)) || 0;
                prev.amount += amount;
                prev.valueUsd += valueUsd;
                // prefer non-zero price
                prev.price = prev.price || price;
                prev.address = t?.address || prev.address || '';
                prev.chain = t?.chain || prev.chain;
                prev.symbol = t?.symbol || prev.symbol;
                bag.set(key, prev);
            }
        }
        return bag; // key -> {amount, price, valueUsd, ...}
    }, []);
}

// ---------- styles ----------
const Styles = () => (
    <style>{`
    .kwt5-wrap { margin-top: .25rem; }
    /* Perfect fit: 6 equal columns on wide screens */
    .kwt5-grid { display:grid; grid-template-columns: repeat(6, minmax(0,1fr)); gap:12px; }
    @media (max-width: 1200px){ .kwt5-grid{ grid-template-columns: repeat(3,minmax(0,1fr)); } }
    @media (max-width: 768px){  .kwt5-grid{ grid-template-columns: repeat(2,minmax(0,1fr)); } }

    .kwt5-card{ border:1px solid var(--bs-border-color); box-shadow:0 2px 6px rgba(0,0,0,.12);
      transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease; }
    .kwt5-card:hover{ transform: translateY(-1px); box-shadow:0 6px 16px rgba(0,0,0,.18);
      border-color: color-mix(in srgb, var(--bs-border-color) 70%, #fff 30%); }
    .kwt5-card .card-body{ padding:10px 12px; }

    .kwt5-head{ display:grid; grid-template-columns:36px 1fr auto; gap:10px; align-items:center; margin-bottom:6px; }
    .kwt5-symbol{ font-weight:900; letter-spacing:.2px; font-size:16px; } /* bigger ticker */
    .kwt5-subline{ display:flex; align-items:center; gap:6px; margin-top:2px; font-size:12px; min-height:18px; }

    .kwt5-iconbtn{ --btn-size:28px; width:var(--btn-size); height:var(--btn-size); padding:0;
      display:inline-flex; align-items:center; justify-content:center; border-radius:8px;
      border:1px solid var(--bs-border-color); background:var(--bs-secondary-bg); }
    .kwt5-iconbtn:hover{ background: color-mix(in srgb, var(--bs-secondary-bg) 75%, #fff 25%);
      border-color: color-mix(in srgb, var(--bs-border-color) 65%, #fff 35%); }
    .kwt5-icon{ width:16px; height:16px; opacity:.85; }

    .kwt5-block{ display:flex; align-items:flex-end; justify-content:space-between; gap:8px; }
    .kwt5-price-line{ display:flex; align-items:baseline; gap:8px; font-size:13px; line-height:1.1; }
    .kwt5-delta.up{ color:#1fbf75; } .kwt5-delta.down{ color:#e55353; }
    .kwt5-usd{ margin-top:4px; font-weight:800; font-size:15px; }

    .kwt5-right{ display:flex; align-items:center; gap:8px; }
    .kwt5-right .kwt5-right-text{ text-align:right; }
    .kwt5-right .kwt5-right-text small{ font-size:11px; color:var(--bs-secondary-color); }
    [data-pc-theme='dark'] .kwt5-right .kwt5-right-text small{ color: rgba(255,255,255,.85); }

    .kwt5-vbar{ width:10px; height:52px; border-radius:6px; background:var(--bs-secondary-bg);
      overflow:hidden; position:relative; }
    .kwt5-vbar > i{ position:absolute; bottom:0; left:0; right:0; background:var(--bs-primary);
      display:block; width:100%; height:0%; transition:height .3s ease; }
  `}</style>
);

function ChartIcon() {
    return (
        <svg className="kwt5-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M3 19h18v2H3zM7 10a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v7H7v-7zm6-4a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v11h-3V6zm-9 8a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v3H4v-3z" />
        </svg>
    );
}

function VerticalPercent({ pct }) {
    const safe = Math.max(0, Math.min(100, Number(pct) || 0));
    return (
        <div className="kwt5-vbar">
            <i style={{ height: `${safe}%` }} />
        </div>
    );
}

function Tile({ t, totalUsd, lookup }) {
    const pct = useMemo(() => {
        const v = Number(t?.valueUsd) || 0; const tot = Number(totalUsd) || 0;
        return tot > 0 ? (v / tot) * 100 : 0;
    }, [t, totalUsd]);

    // enrich price/amount from wallet caches if missing
    const k = tokenKey(t);
    const detail = lookup.get(k);
    const derivedPrice = detail?.price || (Number(t?.amount) > 0 ? (Number(t?.valueUsd) / Number(t?.amount)) : 0);
    const price = Number(t?.priceUsd ?? t?.price ?? derivedPrice ?? 0);

    const change = t?.change24hPct;
    const deltaCls = change == null ? '' : change >= 0 ? 'up' : 'down';
    const deltaTxt = change == null ? '—' : `${change >= 0 ? '▲' : '▼'} ${fmtPct(Math.abs(change))}`;

    const openViewAll = () => {
        try {
            localStorage.setItem('kw:focusToken', t?.symbol || t?.address || '');
            localStorage.setItem('kw:focusTokenKey', k);
        } catch { }
        window.location.assign('/portfolio');
    };

    const logoChainId = chainIdOf(t?.chain);
    const logoAddr = t?.address || null;

    return (
        <Card className="kwt5-card" role="button" onClick={openViewAll}>
            <Card.Body>
                {/* Header */}
                <div className="kwt5-head">
                    <div>
                        <TokenLogo chainId={logoChainId} address={logoAddr} symbol={t?.symbol} size={36} />
                    </div>

                    <div className="min-w-0">
                        <div className="kwt5-symbol">{t?.symbol || t?.name || '—'}</div>
                        <div className="kwt5-subline">
                            <ChainBadge chain={t?.chain}>{chainLabel(t?.chain)}</ChainBadge>
                        </div>
                    </div>

                    {/* chart icon on the left of % cluster */}
                    <div>
                        <Button
                            className="kwt5-iconbtn"
                            variant="light"
                            as="a"
                            href={dexUrlFor(t)}
                            title="Open chart"
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <ChartIcon />
                        </Button>
                    </div>
                </div>

                {/* Values block */}
                <div className="kwt5-block">
                    <div className="me-2 flex-grow-1">
                        <div className="kwt5-price-line">
                            <span>{fmtTokenPrice(price)}</span>
                            <small className={`kwt5-delta ${deltaCls}`}>{deltaTxt}</small>
                        </div>
                        <div className="kwt5-usd">{fmtUsd(t?.valueUsd)}</div>
                    </div>

                    {/* Percentage + label + vertical bar */}
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

export default function TopTokensRow() {
    const top = useTopTokens(6);            // fetch 6
    const totalUsd = getTotalFromLS() || 0;
    const lookup = useWalletTokenLookup();

    const list = useMemo(
        () => [...(top || [])].filter(x => (Number(x.valueUsd) || 0) > 0).slice(0, 6),
        [top]
    );

    const goAll = () => window.location.assign('/portfolio');

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
                        <Tile key={(t.address || t.symbol || i) + String(i)} t={t} totalUsd={totalUsd} lookup={lookup} />
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
