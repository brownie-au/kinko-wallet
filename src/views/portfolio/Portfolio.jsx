// src/views/portfolio/Portfolio.jsx
/* eslint-disable import/no-relative-parent-imports */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Row, Col, Card, Form } from 'react-bootstrap';

import { useWallets } from '../../contexts/WalletContext';
import walletsStatic from '../../data/wallets.js';
import { buildPortfolioDetailed } from '../../services/portfolioAggService';

// shared chain UI (chips + small chain badge)
import { ChainSelector, ChainBadge } from '../../components/ChainUI';

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

// ---------------- Loading shimmer + layout helpers ----------------
const Styles = () => (
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

    /* ------- scope + shared column geometry ------- */
    .kw-scope{
      --kw-price: 140px;
      --kw-amount: 170px;
      --kw-value: 140px;
      /* reserve the same space used by the Expand/Hide button in header */
      --kw-action: 84px;
      --kw-gap: 18px;
    }

    .kw-row { padding: 8px 0; }
    .kw-left { display:flex; align-items:center; gap:10px; min-width: 0; }
    .kw-dot { flex: 0 0 18px; width:18px; height:18px; border-radius:50%; background: var(--bs-secondary); opacity:.6; }
    .kw-name { min-width:0; }
    .kw-symbol { font-weight:600; white-space:nowrap; }
    .kw-sub { font-size:12px; color: var(--bs-secondary-color); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

    .kw-cols { display:flex; align-items:center; gap: var(--kw-gap); }
    .kw-col { text-align:right; }
    .kw-price { width: var(--kw-price); }
    .kw-amount { width: var(--kw-amount); }
    .kw-value { width: var(--kw-value); }
    .kw-delta.up { color: #1fbf75; }
    .kw-delta.down { color: #e55353; }
    [data-pc-theme='dark'] .kw-sub{ color: rgba(255,255,255,.65); }

    /* ------- breakdown under token label; columns align to header ------- */
    .kw-break { margin-top: 4px; }
    /* header row for "Balance Breakdown" label with correct column grid */
    .kw-break-hdr{
      display:grid;
      grid-template-columns: 1fr var(--kw-price) var(--kw-amount) var(--kw-value) var(--kw-action);
      column-gap: var(--kw-gap);
      align-items: end;
      margin-bottom: 2px;
    }
    .kw-break-title { font-size:12px; color: var(--bs-secondary-color); letter-spacing:.3px; }

    /* each breakdown line follows the same 5-column grid */
    .kw-break-row{
      display:grid;
      grid-template-columns: 1fr var(--kw-price) var(--kw-amount) var(--kw-value) var(--kw-action);
      column-gap: var(--kw-gap);
      align-items:center;
      line-height:18px;
      font-size:12px;
      position: relative;
      border-radius: 6px;
      transition: background-color .15s ease, box-shadow .15s ease;
    }
    .kw-break-name{ white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .kw-right{ text-align:right; }

    /* --- Hover highlight for breakdown rows --- */
    .kw-break-row:hover{
      background: rgba(255,255,255,.06);         /* dark theme */
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.08);
    }
    :root:not([data-pc-theme='dark']) .kw-break-row:hover{
      background: rgba(0,0,0,.04);               /* light theme */
      box-shadow: inset 0 0 0 1px rgba(0,0,0,.08);
    }
    @media (prefers-reduced-motion: reduce){
      .kw-break-row{ transition: none; }
    }

    @media (max-width: 768px){
      .kw-scope{
        --kw-price: 120px;
        --kw-amount: 150px;
        --kw-value: 130px;
        --kw-action: 84px; /* usually similar on mobile */
        --kw-gap: 12px;
      }
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

// ---------------- View-All cache ----------------
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

  // in-memory cache
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
      <Styles />

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

                {/* Chain selector (uniform across app) */}
                <ChainSelector value={mode} onChange={setMode} />
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
          <button
            type="button"
            className="badge"
            style={{
              border: '1px solid var(--bs-border-color)',
              borderRadius: 10,
              padding: '6px 12px',
              background: 'var(--bs-secondary-bg)',
              color: 'var(--bs-body-color)'
            }}
            onClick={() => load(true)}
            title="Refresh"
          >
            Refresh
          </button>
        </Col>
      </Row>

      {/* Sub-label */}
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
          <Card className="shadow-sm kw-scope">
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

                const label =
                  (t.chain === 'pulse') ? 'Pulse' :
                  (t.chain === 'base')  ? 'Base'  : 'ETH';

                return (
                  <div key={`${k}:${i}`} className="kw-row border-bottom">
                    <div className="d-flex align-items-center justify-content-between">
                      {/* LEFT: avatar dot + chain badge + symbol/name */}
                      <div className="kw-left">
                        <div className="kw-dot" />
                        {mode === 'all' && <ChainBadge chain={t.chain}>{label}</ChainBadge>}
                        <div className="kw-name">
                          <div className="kw-symbol">
                            {t.symbol || '—'}
                          </div>
                          <div className="kw-sub">
                            {t.name || (t.address ? `${t.address.slice(0,6)}…${t.address.slice(-4)}` : 'Native')}
                          </div>
                        </div>
                      </div>

                      {/* RIGHT: price/amount/value + expand */}
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
                        <div style={{ width: 'var(--kw-action)' }}>
                          <button className="btn btn-sm btn-outline-secondary w-100" onClick={()=>toggleExpand(k)}>
                            {open ? 'Hide' : 'Expand'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {open && (
                      <div className="kw-break">
                        {/* Header row under the token name; columns mirror header (inc. action placeholder) */}
                        <div className="kw-break-hdr">
                          <div className="kw-break-title text-muted">Balance Breakdown</div>
                          <div /> {/* price spacer */}
                          <div /> {/* amount hdr placeholder */}
                          <div /> {/* value hdr placeholder */}
                          <div /> {/* action spacer */}
                        </div>

                        {/* Rows: [names | (price spacer) | amount | value | action spacer] */}
                        {rows.length === 0 && (
                          <div className="kw-break-row">
                            <div className="text-muted">No holdings.</div>
                            <div></div><div></div><div></div><div></div>
                          </div>
                        )}
                        {rows.map((r, idx)=>(
                          <div key={idx} className="kw-break-row">
                            <div className="kw-break-name">{walletName(r.wallet)}</div>
                            <div></div> {/* price spacer */}
                            <div className="kw-right">{fmtAmt(r.amount)} {t.symbol}</div>
                            <div className="kw-right">{fmtUSD((Number(r.amount)||0) * price)}</div>
                            <div></div> {/* action spacer */}
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
