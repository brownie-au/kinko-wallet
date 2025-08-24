// src/views/portfolio/Portfolio.jsx
/* eslint-disable import/no-relative-parent-imports */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Row, Col, Card, Form } from 'react-bootstrap';
import { getPortfolioTotalUsd, /* read cache */ setPortfolioTotalUsd } from '../../utils/portfolioTotal';
import { useWallets } from '../../contexts/WalletContext';
import walletsStatic from '../../data/wallets.js';
import { buildPortfolioDetailed } from '../../services/portfolioAggService';

// shared chain UI (chips + small chain badge)
import { ChainSelector, ChainBadge } from '../../components/ChainUI';
import TokenLogo from '../../components/TokenLogo';

// 🔒 reuse existing global token blocklist
import { isBlockedToken } from '../../data/tokenBlocklist';

// ✅ publish Top tokens for Dashboard (now top 6 to match tiles)
import { writeTopTokensCache } from '../../services/topTokensService';

// ✅ NEW: publish this page’s total to the global PortfolioValueContext
import { usePortfolioValue, PORTFOLIO_SOURCE } from '../../contexts/PortfolioValueContext.jsx';

// --- shared keys so other pages can read the total ---
const LS_TOTAL_KEY = 'kw:lastTotalUsd';
const LS_PCT_KEY = 'kw:lastChangePct24h';
const LS_UPDATED_KEY = 'kw:lastTotalUpdatedAt';
// how many to publish for the dashboard tiles
const TOPN_DASHBOARD = 6;

// === NEW (Plan B) — per-chain totals for Dashboard donut/list ===
const LS_CHAIN_TOTALS_KEY = 'kw:chainTotalsUsd:v1';
function publishChainTotalsFromTokens(list = []) {
  try {
    const totals = { eth: 0, pulse: 0, base: 0 };
    for (const t of list) {
      const chain = String(t?.chain || '').toLowerCase();
      const id =
        chain.startsWith('eth') ? 'eth' :
          chain.startsWith('base') ? 'base' :
            (chain === 'pls' || chain === 'plsx' || chain.startsWith('pulse')) ? 'pulse' :
              null;
      if (!id) continue;

      const price = Number(t.priceUsd ?? t.price ?? 0);
      const amount = Number(t.amount ?? 0);
      const valueUsd = Number(t.valueUsd ?? (amount * price) ?? 0);
      if (valueUsd > 0) totals[id] += valueUsd;
    }
    localStorage.setItem(
      LS_CHAIN_TOTALS_KEY,
      JSON.stringify({ updatedAt: Date.now(), totals })
    );
    // Notify other pages in the same tab
    window.dispatchEvent(new StorageEvent('storage', { key: LS_CHAIN_TOTALS_KEY, newValue: 'updated' }));
  } catch {
    /* ignore */
  }
}

function saveTotalsToLS(totalUsd, changePct24h = 0) {
  try {
    localStorage.setItem(LS_TOTAL_KEY, String(Number(totalUsd) || 0));
    localStorage.setItem(LS_PCT_KEY, String(Number(changePct24h) || 0));
    localStorage.setItem(LS_UPDATED_KEY, String(Date.now()));
  } catch { }
}

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
  // ✅ first: global address/contract blocklist
  const addr = String(t.address || t.contract || '').toLowerCase();
  if (addr && isBlockedToken && isBlockedToken(addr)) return true;

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

    .kwp-scope{
      --kw-price: 140px;
      --kw-amount: 170px;
      --kw-value: 140px;
      --kw-action: 84px;
      --kw-gap: 18px;
    }

    /* ---- ROW + HOVER (keep faint highlighter) ---- */
    .kwp-row { padding: 8px 12px; border-bottom: 1px solid var(--bs-border-color);
      border-radius: 8px; transition: background-color .15s ease, box-shadow .15s ease; }
    .kwp-row:hover { background: rgba(255,255,255,.06); box-shadow: inset 0 0 0 1px rgba(255,255,255,.08); }
    :root:not([data-pc-theme='dark']) .kwp-row:hover { background: rgba(0,0,0,.04); box-shadow: inset 0 0 0 1px rgba(0,0,0,.08); }

    /* ---- LEFT SIDE: grid with explicit buffer column ---- */
    .kwp-left { 
      display: grid;
      grid-template-columns: 36px 12px minmax(0, 1fr); /* logo | spacer | name */
      align-items: center;
      min-width: 0;
    }
    .kwp-logo { width: 36px; height: 36px; display: flex; align-items: center; }
    .kwp-spacer { width: 12px; } /* the buffer that aligns all tickers/chips */

    .kwp-name { min-width:0; }
    .kwp-symbol { font-weight:600; white-space:nowrap; }
    .kwp-sub { font-size:12px; color: var(--bs-secondary-color); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

    .kwp-name-inline{ font-weight:400; font-size:12px; color: var(--bs-secondary-color); }
    [data-pc-theme='dark'] .kwp-name-inline{ color: rgba(255,255,255,.70); }

    .kwp-ticker{ font-size: 1.1rem; font-weight: 700; }

    .kwp-cols { display:flex; align-items:center; gap: var(--kw-gap); }
    .kwp-col { text-align:right; }
    .kwp-price { width: var(--kw-price); }
    .kwp-amount { width: var(--kw-amount); }
    .kwp-value { width: var(--kw-value); }
    .kwp-delta.up { color: #1fbf75; }
    .kwp-delta.down { color: #e55353; }
    [data-pc-theme='dark'] .kwp-sub{ color: rgba(255,255,255,.65); }

    .kwp-break { margin-top: 4px; }
    .kwp-break-hdr{
      display:grid;
      grid-template-columns: 1fr var(--kw-price) var(--kw-amount) var(--kw-value) var(--kw-action);
      column-gap: var(--kw-gap);
      align-items: end;
      margin-bottom: 2px;
    }
    .kwp-break-title { font-size:12px; color: var(--bs-secondary-color); letter-spacing:.3px; }

    .kwp-break-row{
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
    .kwp-break-name{ white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .kwp-right{ text-align:right; }

    .kwp-break-row:hover{
      background: rgba(255,255,255,.06);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.08);
    }
    :root:not([data-pc-theme='dark']) .kwp-break-row:hover{
      background: rgba(0,0,0,.04);
      box-shadow: inset 0 0 0 1px rgba(0,0,0,.08);
    }
    @media (prefers-reduced-motion: reduce){
      .kwp-break-row{ transition: none; }
    }

    .k-chain-btn {
      padding: var(--k-chip-padding-y, 6px) var(--k-chip-padding-x, 12px);
      border-radius: var(--k-chip-radius, 12px);
      font-size: var(--k-chip-font, .9rem);
      line-height: 1;
      cursor: pointer;
      border: 1px solid var(--bs-border-color);
      background: var(--k-chip-bg, var(--bs-secondary-bg));
      color: var(--k-chip-fg, var(--bs-body-color));
      box-shadow: 0 1px 0 rgba(0,0,0,.05);
      transition: background-color .18s ease, color .18s ease, border-color .18s ease, box-shadow .18s ease;
    }
    .k-chain-btn:hover {
      background: color-mix(in srgb, var(--k-chip-bg, var(--bs-secondary-bg)) 85%, #fff 15%);
      border-color: color-mix(in srgb, var(--bs-border-color) 70%, #fff 30%);
    }
    .k-chain-btn.is-active {
      background: var(--k-chip-active-bg, var(--bs-primary));
      color: #fff;
      border-color: transparent;
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--k-chip-active-bg, var(--bs-primary)) 35%, #000 65%) inset;
    }
    [data-pc-theme='dark'] .k-chain-btn {
      --k-chip-bg: #2b2f36;
      --k-chip-fg: #f3f6fb;
      border-color: #3e4451;
      box-shadow: 0 1px 0 rgba(0,0,0,.35);
    }
    [data-pc-theme='dark'] .k-chain-btn:hover {
      background: #383e49;
      border-color: #4d5564;
    }
    [data-pc-theme='dark'] .k-chain-btn.is-active {
      color: #fff;
      border-color: transparent;
      box-shadow: 0 0 0 1px rgba(10,167,255,.25) inset;
    }
    .k-chain-btn:focus-visible {
      outline: 2px solid color-mix(in srgb, var(--k-chip-active-bg, var(--bs-primary)) 70%, #fff 30%);
      outline-offset: 2px;
    }

    @media (max-width: 768px){
      .kwp-scope{
        --kw-price: 120px;
        --kw-amount: 150px;
        --kw-value: 130px;
        --kw-action: 84px;
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

// ---- chainId resolver for TokenLogo ----
function chainIdOf(chain) {
  switch (String(chain || '').toLowerCase()) {
    case 'pulse': return 369;   // PulseChain
    case 'base': return 8453;   // Base
    case 'eth':
    case 'ethereum':
    default: return 1;          // Ethereum
  }
}

export default function Portfolio() {
  // Context (safe if provider missing)
  let ctx;
  try { ctx = useWallets(); } catch { ctx = undefined; }
  const replaceWallets = ctx?.replaceWallets ?? (() => { });
  const fromCtx = Array.isArray(ctx?.wallets) ? ctx.wallets : [];

  const fromLS = (() => { try { return JSON.parse(localStorage.getItem('wallets') || '[]'); } catch { return []; } })();
  const wallets = (fromCtx.length ? fromCtx : (fromLS.length ? fromLS : walletsStatic));
  const walletsSig = walletsSigOf(wallets);

  useEffect(() => {
    if (wallets && wallets.length) replaceWallets(wallets);
  }, [walletsSig, replaceWallets]);

  // 'all' | 'eth' | 'pulse' | 'base'
  const [mode, setMode] = useState('all');

  const [booting, setBooting] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [totalUsd, setTotalUsd] = useState(() => getPortfolioTotalUsd());
  const [lastUpdated, setLastUpdated] = useState(() => {
    try { return Number(localStorage.getItem('kw:lastPortfolioTotalUsdAt') || 0); } catch { return 0; }
  });

  const [tokens, setTokens] = useState([]);
  const [breakdown, setBreakdown] = useState(new Map());
  const [expanded, setExpanded] = useState(new Set());
  const [q, setQ] = useState('');

  const memCacheRef = useRef(new Map());

  const walletCount = wallets.length;

  const walletName = (addr) =>
    wallets.find(
      (w) => (w.address || '').toLowerCase() === (addr || '').toLowerCase()
    )?.name || 'Wallet';

  const persistTotal = (v) => {
    setPortfolioTotalUsd(v);
    setLastUpdated(Date.now());
  };

  // === helper: expand a token if Dashboard set focus keys ===
  const maybeExpandFromFocus = (list) => {
    try {
      const want = (localStorage.getItem('kw:focusToken') || '').trim();
      const wantKey = (localStorage.getItem('kw:focusTokenKey') || '').trim();
      if (!want && !wantKey) return;

      const match = (list || []).find((tt) =>
        (wantKey && keyFor(tt).toLowerCase() === wantKey.toLowerCase()) ||
        (want && (
          (tt.symbol || '').toLowerCase() === want.toLowerCase() ||
          ((tt.address || tt.contract || '').toLowerCase() === want.toLowerCase())
        ))
      );

      if (match) {
        const k = keyFor(match);
        setExpanded((prev) => {
          const n = new Set(prev);
          n.add(k);
          return n;
        });
        // clear only after a successful match so we can retry if needed
        localStorage.removeItem('kw:focusToken');
        localStorage.removeItem('kw:focusTokenKey');
      }
    } catch { /* noop */ }
  };
  // === END helper ===

  async function load(force = false) {
    setError(null);

    const memKey = mode + '|' + walletsSig;

    const memHit = memCacheRef.current.get(memKey);
    if (!force && memHit && now() - memHit.updatedAt < CACHE_TTL) {
      setTotalUsd(memHit.totalUsd);
      persistTotal(memHit.totalUsd);
      setTokens(memHit.tokens);
      setBreakdown(new Map(memHit.breakdown));
      // expand from focus when serving from memory cache
      maybeExpandFromFocus(memHit.tokens);
      // NEW: publish per-chain totals for Dashboard when on "all"
      if (mode === 'all') publishChainTotalsFromTokens(memHit.tokens);
      setBooting(false);
      setRefreshing(false);
      return;
    }

    const ls = readCache(mode, walletsSig);
    if (!force && ls && ls.fresh) {
      setTotalUsd(ls.totalUsd);
      persistTotal(ls.totalUsd);
      setTokens(ls.tokens);
      setBreakdown(new Map(ls.breakdown || []));
      // expand from focus when serving from LS cache
      maybeExpandFromFocus(ls.tokens);
      // NEW: publish per-chain totals for Dashboard when on "all"
      if (mode === 'all') publishChainTotalsFromTokens(ls.tokens);
      setBooting(false);
      setRefreshing(false);
      memCacheRef.current.set(memKey, { ...ls });
      // ✅ publish Top-N from cached data if we're on All chains
      if (mode === 'all') {
        try {
          const topN = [...(ls.tokens || [])]
            .filter((t) => !isJunkToken(t) && (Number(t.valueUsd) || 0) > 0)
            .sort((a, b) => Number(b.valueUsd) - Number(a.valueUsd))
            .slice(0, TOPN_DASHBOARD)
            .map((t) => ({
              symbol: t.symbol,
              name: t.name || t.symbol,
              chain: t.chain,
              address: t.address || t.contract || '',
              logo: t.logo || t.icon || '',
              valueUsd: Number(t.valueUsd) || 0,
              change24hPct: getChangePct(t),
              dexUrl: t.dexUrl || null
            }));
          writeTopTokensCache(topN);
        } catch { }
      }
      return;
    }

    if (!force && (memHit || ls)) {
      const stale = memHit || ls;
      const st = stale.totalUsd || 0;
      setTotalUsd(st);
      persistTotal(st);
      setTokens(stale.tokens || []);
      setBreakdown(new Map(stale.breakdown || []));
      // NEW: publish per-chain totals for Dashboard when on "all"
      if (mode === 'all') publishChainTotalsFromTokens(stale.tokens || []);
      setBooting(false);
      setRefreshing(true);
    } else {
      setBooting(true);
      setRefreshing(false);
    }

    try {
      const { totalUsd, tokens, breakdown } = await buildPortfolioDetailed(wallets, { only: mode, force });
      setTotalUsd(totalUsd);
      persistTotal(totalUsd);

      const tokensWithValue = (tokens || []).map((t) => {
        const price = Number(t.priceUsd ?? t.price ?? 0);
        const amount = Number(t.amount ?? 0);
        const valueUsd = Number(t.valueUsd ?? (t.usd ?? (amount * price)));
        return { ...t, valueUsd };
      });

      setTokens(tokensWithValue);
      setBreakdown(breakdown);
      // expand from focus when serving fresh build
      maybeExpandFromFocus(tokensWithValue);

      const payload = { totalUsd, tokens: tokensWithValue, breakdown: Array.from(breakdown.entries()), updatedAt: now() };
      memCacheRef.current.set(memKey, payload);
      writeCache(mode, walletsSig, payload);
      saveTotalsToLS(totalUsd, 0);

      // NEW: publish per-chain totals for Dashboard when on "all"
      if (mode === 'all') publishChainTotalsFromTokens(tokensWithValue);

      // ✅ publish Top-N for Dashboard (ONLY when viewing the full portfolio)
      if (mode === 'all') {
        try {
          const topN = [...tokensWithValue]
            .filter((t) => !isJunkToken(t) && (Number(t.valueUsd) || 0) > 0)
            .sort((a, b) => Number(b.valueUsd) - Number(a.valueUsd))
            .slice(0, TOPN_DASHBOARD)
            .map((t) => ({
              symbol: t.symbol,
              name: t.name || t.symbol,
              chain: t.chain,
              address: t.address || t.contract || '',
              logo: t.logo || t.icon || '',
              valueUsd: Number(t.valueUsd) || 0,
              change24hPct: getChangePct(t),
              dexUrl: t.dexUrl || null
            }));
          writeTopTokensCache(topN);
        } catch { }
      }
    } catch (e) {
      setError(e?.message || 'Failed to load portfolio');
    } finally {
      setBooting(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(false); /* eslint-disable-next-line */ }, [walletCount, walletsSig, mode]);

  // Retry expand whenever tokens update (in case timing was off)
  useEffect(() => {
    maybeExpandFromFocus(tokens);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens]);

  // ====== NEW: publish this page’s total into the global context ======
  const { setSource, removeSource } = usePortfolioValue();

  // Only publish the "All Wallets" figure to the global total.
  useEffect(() => {
    if (mode === 'all') {
      setSource(PORTFOLIO_SOURCE, Number(totalUsd) || 0);
    }
    // do not overwrite when on filtered modes; keeps last known "all" value
  }, [mode, totalUsd, setSource]);

  // Clean up registration on unmount (nice-to-have)
  useEffect(() => {
    return () => removeSource(PORTFOLIO_SOURCE);
  }, [removeSource]);
  // ====== END new context wiring ======

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

  const lastUpdatedLabel = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '—';

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

                  {/* Unified with Dashboard/Index: kw-grand-total */}
                  <h2 className="mb-1 kw-grand-total">{fmtUSD(totalUsd)}</h2>

                  <div className="d-inline-flex align-items-center gap-2" style={{ fontSize: 12 }}>
                    <span className="text-success">24h: +0.00%</span>
                    <span className="text-muted">• Wallets: {walletCount}</span>
                    <span className="text-muted">
                      • Updated: {lastUpdatedLabel}{refreshing ? ' (refreshing...)' : ''}
                    </span>
                  </div>
                </div>

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
            className="k-chain-btn"
            onClick={() => load(true)}
            title="Refresh"
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
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
          <Card className="shadow-sm kwp-scope">
            <Card.Header><strong>Top Tokens</strong></Card.Header>
            <Card.Body>
              {booting && (
                <LoadingBlock label={`Loading ${mode === 'pulse' ? 'PRC-20' : mode === 'all' ? 'ERC-20 & PRC-20' : 'ERC-20'}…`} />
              )}

              {!booting && visibleTokens.length === 0 && <div className="text-muted">No tokens found.</div>}

              {!booting && visibleTokens.map((t, i) => {
                const k = keyFor(t);
                const open = expanded.has(k);
                const rows = breakdown.get(k) || [];
                const price = Number(t.priceUsd ?? t.price ?? 0);
                const delta = getChangePct(t);
                const deltaCls = delta == null ? '' : delta >= 0 ? 'up' : 'down';
                const deltaTxt = delta == null ? '' : `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(2)}%`;

                const label =
                  (t.chain === 'pulse') ? 'Pulse' :
                    (t.chain === 'base') ? 'Base' : 'ETH';

                const logoChainId = chainIdOf(t.chain);
                // IMPORTANT: keep checksum casing if present
                const logoAddr = (t.address || t.contract || '') || null;

                return (
                  <div key={`${k}:${i}`} className="kwp-row">
                    <div className="d-flex align-items-center justify-content-between">
                      {/* LEFT: icon + spacer + symbol/name (chips sit on line 2) */}
                      <div className="kwp-left">
                        <div className="kwp-logo">
                          <TokenLogo
                            chainId={logoChainId}
                            address={logoAddr}
                            symbol={t.symbol}
                            size={36}
                          />
                        </div>
                        <div className="kwp-spacer" />
                        <div className="kwp-name">
                          <div className="kwp-symbol">
                            <strong className="kwp-ticker">{t.symbol || '—'}</strong>
                            <span className="kwp-name-inline">
                              {' - '}
                              {t.name || (t.address ? `${t.address.slice(0, 6)}…${t.address.slice(-4)}` : 'Native')}
                            </span>
                          </div>
                          <div className="kwp-sub">
                            {mode === 'all' && <ChainBadge chain={t.chain}>{label}</ChainBadge>}
                          </div>
                        </div>
                      </div>

                      {/* RIGHT: price/amount/value + expand */}
                      <div className="kwp-cols">
                        <div className="kwp-col kwp-price">
                          <div className="text-muted" style={{ fontSize: 12 }}>Price</div>
                          <div>{fmtUSD(price)}</div>
                          {delta != null && (
                            <div className={`kwp-delta ${deltaCls}`} style={{ fontSize: 12 }}>{deltaTxt}</div>
                          )}
                        </div>
                        <div className="kwp-col kwp-amount">
                          <div className="text-muted" style={{ fontSize: 12 }}>Amount</div>
                          <div>{fmtAmt(t.amount)} {t.symbol}</div>
                        </div>
                        <div className="kwp-col kwp-value">
                          <div className="text-muted" style={{ fontSize: 12 }}>Value</div>
                          <div className="fw-semibold">{fmtUSD(Number(t.valueUsd ?? (Number(t.amount || 0) * price)))}</div>
                        </div>
                        <div style={{ width: 'var(--kw-action)' }}>
                          <button className="btn btn-sm btn-outline-secondary w-100" onClick={() => toggleExpand(k)}>
                            {open ? 'Hide' : 'Expand'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {open && (
                      <div className="kwp-break">
                        <div className="kwp-break-hdr">
                          <div className="kwp-break-title text-muted">Balance Breakdown</div>
                          <div /> <div /> <div /> <div />
                        </div>

                        {rows.length === 0 && (
                          <div className="kwp-break-row">
                            <div className="text-muted">No holdings.</div>
                            <div></div><div></div><div></div><div></div>
                          </div>
                        )}
                        {rows.map((r, idx) => (
                          <div key={idx} className="kwp-break-row">
                            <div className="kwp-break-name">{walletName(r.wallet)}</div>
                            <div></div>
                            <div className="kwp-right">{fmtAmt(r.amount)} {t.symbol}</div>
                            <div className="kwp-right">{fmtUSD((Number(r.amount) || 0) * price)}</div>
                            <div></div>
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
