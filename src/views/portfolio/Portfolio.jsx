// src/views/portfolio/Portfolio.jsx
/* eslint-disable import/no-relative-parent-imports */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Row, Col, Card, Form } from 'react-bootstrap';

import { useWallets } from '../../contexts/WalletContext';
import walletsStatic from '../../data/wallets.js';
import { buildPortfolioDetailed } from '../../services/portfolioAggService';

// ---------- formats ----------
const fmtUSD = (n) => {
  const amt = (Number(n) || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `USD $${amt}`;
};
const fmtAmt = (n, p = 6) => {
  const x = Number(n) || 0;
  return !isFinite(x)
    ? '0'
    : x >= 1
    ? x.toLocaleString(undefined, { maximumFractionDigits: 4 })
    : x.toPrecision(p);
};
const keyFor = (t) =>
  `${t.chain}:${t.address || 'native'}:${(t.symbol || '').toUpperCase()}`;

// ---- minimal junk filter ----
const DENY = new Set(['ETHG', 'AICC']);
function isJunkToken(t) {
  const sym = String(t.symbol || '').toUpperCase().trim();
  if (DENY.has(sym)) return true;
  if (t.possible_spam === true || t.is_spam === true) return true;
  const price = Number(t.priceUsd ?? t.price);
  if (Number.isNaN(price) || price > 100000) return true;
  const amount = Number(t.amount);
  if (!isFinite(amount) || amount < 0) return true;
  return false;
}

// ---------------- Colours (ETH green, PULSE purple, BASE blue) ----------------
const CHAIN_COLORS = { eth: '#2ecc71', pulse: '#9b59b6', base: '#3498db' };
const chainLabel = (c) => (c === 'pulse' ? 'Pulse' : c === 'base' ? 'Base' : 'ETH');

// ---------------- Big chip (header) ----------------
// Theme-aware chip: inactive adapts to theme; active uses provided accent color
const BigChip = ({ active, onClick, children, color }) => (
  <button
    type="button"
    className={`kw-chip ${active ? 'is-active' : ''}`}
    onClick={onClick}
    style={{ ['--kw-chip-accent']: color }}
  >
    {children}
  </button>
);

// ---------------- Small chip (row identifier) ----------------
const smallChipStyle = (color) => ({
  display: 'inline-block',
  borderRadius: 8,
  padding: '2px 6px',
  fontSize: 11,
  lineHeight: 1.0,
  color: '#fff',
  background: color
});
const SmallChainChip = ({ chain, className = '' }) => (
  <span className={className} style={smallChipStyle(CHAIN_COLORS[chain] || '#6c757d')}>
    {chainLabel(chain)}
  </span>
);

// ---------------- Loading shimmer ----------------
const LoadingStyles = () => (
  <style>{`
    @keyframes kinkoShimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
    .kinko-loading-cell { position: relative; overflow: hidden; height: 56px;
      background: linear-gradient(90deg,
        rgba(255,255,255,0.04) 0%,
        rgba(255,255,255,0.08) 25%,
        rgba(255,255,255,0.14) 50%,
        rgba(255,255,255,0.08) 75%,
        rgba(255,255,255,0.04) 100%);
      background-size: 200% 100%; animation: kinkoShimmer 5s linear infinite; border-radius: 6px; }
    .kinko-loading-label { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      font-size: 0.95rem; color: rgba(255,255,255,0.7); text-shadow: 0 1px 0 rgba(0,0,0,0.35); }

    /* Row layout tweaks */
    .kw-row { padding: 8px 0; }
    .kw-left { display:flex; align-items:center; gap:10px; min-width: 0; }
    .kw-dot { flex: 0 0 18px; width:18px; height:18px; border-radius:50%; background: var(--bs-secondary); opacity:.6; }
    .kw-name { min-width:0; }
    .kw-symbol { font-weight:600; white-space:nowrap; }
    .kw-sub { font-size:12px; color: var(--bs-secondary-color); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .kw-cols { display:flex; align-items:center; gap:18px; }
    .kw-col { text-align:right; }
    .kw-price { width:140px; }
    .kw-amount { width:170px; }
    .kw-value { width:140px; }
    .kw-delta.up { color: #1fbf75; }     /* green */
    .kw-delta.down { color: #e55353; }   /* red */

    /* Theme-aware subtitle for dark mode */
    [data-pc-theme='dark'] .kw-sub{ color: rgba(255,255,255,.65); }

    /* Theme-aware filter chips */
    .kw-chip{
      border: 1px solid var(--bs-border-color);
      border-radius: 10px;
      padding: 6px 12px;
      font-size: .9rem;
      line-height: 1;
      cursor: pointer;
      background: color-mix(in srgb, var(--bs-body-color) 8%, transparent);
      color: var(--bs-body-color);
    }
    [data-pc-theme='dark'] .kw-chip{
      background: color-mix(in srgb, #ffffff 10%, transparent);
      color: #fff;
      border-color: rgba(255,255,255,.2);
    }
    .kw-chip.is-active{
      background: var(--kw-chip-accent);
      border-color: var(--kw-chip-accent);
      color: #fff;
    }

    @media (max-width: 768px){
      .kw-price { width: 120px; }
      .kw-amount { width: 150px; }
      .kw-value { width: 130px; }
      .kw-cols { gap:12px; }
    }
  `}</style>
);
function LoadingBlock({ label = 'Loading…' }) {
  return (
    <div className="kinko-loading-cell mb-2">
      <div className="kinko-loading-label">{label}</div>
    </div>
  );
}

// ---------------- View‑All cache ----------------
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const CACHE_PREFIX = 'kw:viewall-cache:'; // key = prefix + mode + ':' + walletsSig

const now = () => Date.now();
const walletsSigOf = (arr) =>
  (arr || [])
    .map((w) => (w.address || '').toLowerCase())
    .filter(Boolean)
    .sort()
    .join(',');

function readCache(mode, sig) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + mode + ':' + sig);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !data.updatedAt) return null;
    const fresh = now() - Number(data.updatedAt) < CACHE_TTL;
    return { ...data, fresh };
  } catch { return null; }
}
function writeCache(mode, sig, payload) {
  try {
    const data = { ...payload, updatedAt: now() };
    localStorage.setItem(CACHE_PREFIX + mode + ':' + sig, JSON.stringify(data));
  } catch { /* ignore */ }
}

// ---- extract % change if present on token ----
function getChangePct(t) {
  const candidates = [
    t.change24hPct,
    t.change24h,
    t.priceChange24hPct,
    t.price_change_pct_24h,
    t.price_change_24h_pct
  ];
  const val = candidates.find((v) => typeof v === 'number' && isFinite(v));
  return typeof val === 'number' ? val : null;
}

export default function Portfolio() {
  // Context + fallbacks
  let ctx;
  try { ctx = useWallets(); } catch { ctx = undefined; }
  const fromCtx = Array.isArray(ctx?.wallets) ? ctx.wallets : [];
  const fromLS  = (() => { try { return JSON.parse(localStorage.getItem('wallets') || '[]'); } catch { return []; } })();
  const wallets = (fromCtx.length ? fromCtx : (fromLS.length ? fromLS : walletsStatic));
  const walletsSig = walletsSigOf(wallets);

  // 'all' | 'eth' | 'pulse' | 'base'
  const [mode, setMode] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [totalUsd, setTotalUsd] = useState(0);
  const [tokens, setTokens] = useState([]);
  const [breakdown, setBreakdown] = useState(new Map());
  const [expanded, setExpanded] = useState(new Set());
  const [q, setQ] = useState('');

  // in‑memory cache
  const memCacheRef = useRef(new Map()); // key -> {totalUsd,tokens,breakdown,updatedAt}

  const walletCount = wallets.length;

  const walletName = (addr) =>
    wallets.find(
      (w) => (w.address || '').toLowerCase() === (addr || '').toLowerCase()
    )?.name || 'Wallet';

  async function load(force = false) {
    setError(null);

    const memKey = mode + '|' + walletsSig;

    // 1) Try memory cache
    const memHit = memCacheRef.current.get(memKey);
    if (!force && memHit && now() - memHit.updatedAt < CACHE_TTL) {
      setTotalUsd(memHit.totalUsd);
      setTokens(memHit.tokens);
      setBreakdown(new Map(memHit.breakdown));
      setLoading(false);
      return;
    }

    // 2) Try localStorage cache (fresh)
    const ls = readCache(mode, walletsSig);
    if (!force && ls && ls.fresh) {
      setTotalUsd(ls.totalUsd);
      setTokens(ls.tokens);
      setBreakdown(new Map(ls.breakdown || []));
      setLoading(false);
      memCacheRef.current.set(memKey, { ...ls });
      return;
    }

    // 3) Show stale quickly while refreshing
    if (!force && (memHit || ls)) {
      const stale = memHit || ls;
      setTotalUsd(stale.totalUsd || 0);
      setTokens(stale.tokens || []);
      setBreakdown(new Map(stale.breakdown || []));
    } else {
      setLoading(true);
    }

    try {
      const { totalUsd, tokens, breakdown } = await buildPortfolioDetailed(wallets, { only: mode, force });
      setTotalUsd(totalUsd);
      setTokens(tokens);
      setBreakdown(breakdown);

      const payload = { totalUsd, tokens, breakdown: Array.from(breakdown.entries()), updatedAt: now() };
      memCacheRef.current.set(memKey, payload);
      writeCache(mode, walletsSig, payload);
    } catch (e) {
      setError(e?.message || 'Failed to load portfolio');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(false); /* eslint-disable-next-line */ }, [walletCount, walletsSig, mode]);

  // search + junk filter
  const visibleTokens = useMemo(() => {
    const base = tokens.filter((t) => !isJunkToken(t));
    const s = (q || '').trim().toLowerCase();
    if (!s) return base;
    return base.filter((t) =>
      (t.name || '').toLowerCase().includes(s) ||
      (t.symbol || '').toLowerCase().includes(s) ||
      (t.address || t.contract || '').toLowerCase().includes(s)
    );
  }, [tokens, q]);

  const toggleExpand = (k) => {
    const next = new Set(expanded);
    next.has(k) ? next.delete(k) : next.add(k);
    setExpanded(next);
  };

  return (
    <>
      <LoadingStyles />

      {/* HEADER */}
      <Row className="mb-4">
        <Col>
          <Card className="shadow-sm border-0">
            <Card.Body>
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-3">
                <div>
                  <div className="text-muted" style={{ fontSize: 18, fontWeight: 600 }}>
                    All Wallets
                  </div>

                  <h2 className="mb-1" style={{ fontWeight: 800 }}>{fmtUSD(totalUsd)}</h2>

                  <div className="d-inline-flex align-items-center gap-2" style={{ fontSize: 12 }}>
                    <span className="text-success">24h: +0.00%</span>
                    <span className="text-muted">• Wallets: {walletCount}</span>
                  </div>
                </div>

                {/* Chain chips */}
                <div className="d-flex align-items-center gap-2">
                  <BigChip active={mode === 'all'}   onClick={() => setMode('all')}   color="#0d6efd">All</BigChip>
                  <BigChip active={mode === 'eth'}   onClick={() => setMode('eth')}   color={CHAIN_COLORS.eth}>Ethereum</BigChip>
                  <BigChip active={mode === 'pulse'} onClick={() => setMode('pulse')} color={CHAIN_COLORS.pulse}>PulseChain</BigChip>
                  <BigChip active={mode === 'base'}  onClick={() => setMode('base')}  color={CHAIN_COLORS.base}>Base</BigChip>
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* CONTROLS */}
      <Row className="mb-3">
        <Col md={6} className="mb-2">
          <Form.Control
            placeholder="Search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </Col>
        <Col md={6} className="text-md-end">
          <BigChip active={false} onClick={() => load(true)} color="#6c757d">
            Refresh
          </BigChip>
        </Col>
      </Row>

      {/* Sub‑label */}
      <Row className="mb-2">
        <Col>
          <small className="text-muted">
            {mode === 'all'
              ? 'All chains — ERC-20 & PRC-20 tokens'
              : mode === 'pulse'
              ? 'PulseChain — PRC-20 tokens'
              : `${mode === 'base' ? 'Base' : 'Ethereum'} — ERC-20 tokens`}
          </small>
        </Col>
      </Row>

      {error && (
        <Row><Col><Card className="mb-3"><Card.Body className="text-danger">{error}</Card.Body></Card></Col></Row>
      )}

      {/* Token rows (aggregated) */}
      <Row>
        <Col>
          <Card className="shadow-sm">
            <Card.Header><strong>Top Tokens</strong></Card.Header>
            <Card.Body>
              {loading && (
                <LoadingBlock label={`Loading ${mode === 'pulse' ? 'PRC-20' : mode === 'all' ? 'ERC-20 & PRC-20' : 'ERC-20'}…`} />
              )}

              {!loading && visibleTokens.length === 0 && <div className="text-muted">No tokens found.</div>}

              {!loading && visibleTokens.map((t,i)=>{
                const k = keyFor(t);
                const open = expanded.has(k);
                const rows = breakdown.get(k) || [];
                const price = Number(t.priceUsd ?? t.price ?? 0);
                const delta = getChangePct(t);
                const deltaCls = delta == null ? '' : delta >= 0 ? 'up' : 'down';
                const deltaTxt = delta == null ? '' : `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(2)}%`;

                return (
                  <div key={`${k}:${i}`} className="kw-row border-bottom">
                    <div className="d-flex align-items-center justify-content-between">
                      {/* LEFT: avatar dot + chain chip + symbol/name */}
                      <div className="kw-left">
                        <div className="kw-dot" />
                        {/* chip BEFORE name per request */}
                        {mode === 'all' && <SmallChainChip className="me-1" chain={(t.chain || 'eth')} />}
                        <div className="kw-name">
                          <div className="kw-symbol">
                            {t.symbol || '—'}
                          </div>
                          <div className="kw-sub">
                            {t.name || (t.address ? `${t.address.slice(0,6)}…${t.address.slice(-4)}` : 'Native')}
                          </div>
                        </div>
                      </div>

                      {/* RIGHT: columns pulled a bit left with smaller widths/gaps */}
                      <div className="kw-cols">
                        <div className="kw-col kw-price">
                          <div className="text-muted" style={{ fontSize: 12 }}>Price</div>
                          <div>{fmtUSD(price)}</div>
                          {delta != null && (
                            <div className={`kw-delta ${deltaCls}`} style={{ fontSize: 12 }}>{deltaTxt}</div>
                          )}
                        </div>
                        <div className="kw-col kw-amount">
                          <div className="text-muted" style={{ fontSize: 12 }}>Amount</div>
                          <div>{fmtAmt(t.amount)} {t.symbol}</div>
                        </div>
                        <div className="kw-col kw-value">
                          <div className="text-muted" style={{ fontSize: 12 }}>Value</div>
                          <div className="fw-semibold">{fmtUSD(t.valueUsd)}</div>
                        </div>
                        <div>
                          <button className="btn btn-sm btn-outline-secondary" onClick={()=>toggleExpand(k)}>
                            {open ? 'Hide' : 'Expand'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {open && (
                      <div className="mt-3 ms-4">
                        <div className="text-muted mb-2" style={{ fontSize: 12 }}>Balance Breakdown</div>
                        {rows.length === 0 && <div className="text-muted" style={{ fontSize: 12 }}>No holdings.</div>}
                        {rows.map((r, idx)=>(
                          <div key={idx} className="d-flex justify-content-between" style={{ fontSize: 12, lineHeight: '22px' }}>
                            <div>{walletName(r.wallet)}</div>
                            <div className="text-end">{fmtAmt(r.amount)} {t.symbol}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
}
