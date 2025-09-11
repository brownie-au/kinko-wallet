// src/views/portfolio/Portfolio.jsx
/* eslint-disable import/no-relative-parent-imports */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Row, Col, Card, Form } from 'react-bootstrap';
import { getPortfolioTotalUsd, /* read cache */ setPortfolioTotalUsd } from '../../utils/portfolioTotal';
import { useWallets } from '../../contexts/WalletContext';
import { buildPortfolioDetailedFromCache as buildPortfolioDetailed } from '../../services/portfolioAggService';

// NEW: 24h change service (batch via DexScreener for contract tokens)
import { tokenKey as changeKey } from '../../services/change24hService';

// NEW: 24h change for native coins (ETH, PLS, etc.)
import { tokenKey as nativeKey } from '../../services/change24hNativeService';
// Disable direct network calls from components; background client handles refresh
const fetchChange24hFromDexScreener = async () => new Map();
const fetchNativeChange24h = async () => new Map();

// shared chain UI (chips + small chain badge)
import { ChainSelector, ChainBadge } from '../../components/ChainUI';
import { getGlobalNetChip, setGlobalNetChip, setLastSection, consumeForceGlobalChipOnce } from '../../utils/uiState';
import TokenLogo from '../../components/TokenLogo';

// 🔒 reuse existing global token blocklist
import { isTokenBlacklisted } from '../../data/tokenBlocklist';

// ✅ publish Top tokens for Dashboard (now top 6 to match tiles)
import { writeTopTokensCache } from '../../services/topTokensService';

// ✅ publish this page’s total to the global PortfolioValueContext
import { usePortfolioValue, PORTFOLIO_SOURCE } from '../../contexts/PortfolioValueContext.jsx';

// --- shared keys so other pages can read the total ---
const LS_TOTAL_KEY = 'kw:lastTotalUsd';
const LS_PCT_KEY = 'kw:lastChangePct24h';
const LS_UPDATED_KEY = 'kw:lastTotalUpdatedAt';
const TOPN_DASHBOARD = 6;

// === per-chain totals cache (used by Dashboard + here for instant chips) ===
// NOTE: we now write/read under `${LS_CHAIN_TOTALS_KEY}:${walletsSig}` to avoid stale cross-wallet values.
const LS_CHAIN_TOTALS_KEY = 'kw:chainTotalsUsd:v1';

// ---- helpers: cache IO ----
const now = () => Date.now();

// Build the LS key with optional wallet signature
const chainTotalsKeyFor = (sig) => (sig ? `${LS_CHAIN_TOTALS_KEY}:${sig}` : LS_CHAIN_TOTALS_KEY);

// Read per-chain totals (tries wallet-specific key first, then legacy).
function readChainTotalsCache(sig) {
  try {
    const tryKeys = [chainTotalsKeyFor(sig), LS_CHAIN_TOTALS_KEY];
    for (const key of tryKeys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const { totals = {}, updatedAt = 0 } = JSON.parse(raw);
      return {
        eth: +totals.eth || +totals.ethereum || 0,
        pulse: +totals.pulse || +totals.pulsechain || +totals.pls || 0,
        bsc: +totals.bsc || 0,
        polygon: +totals.polygon || +totals.matic || +totals.pol || 0,
        base: +totals.base || 0,
        updatedAt: +updatedAt || 0
      };
    }
    return { eth: 0, pulse: 0, bsc: 0, polygon: 0, base: 0, updatedAt: 0 };
  } catch {
    return { eth: 0, pulse: 0, bsc: 0, polygon: 0, base: 0, updatedAt: 0 };
  }
}

// Legacy single-key writer (kept for compatibility in case something else imports it)
function publishChainTotalsFromTokens(list = []) {
  try {
    const totals = { eth: 0, pulse: 0, bsc: 0, polygon: 0, base: 0 };
    for (const t of list) {
      const chain = String(t?.chain || '').toLowerCase();
      const id =
        chain.startsWith('eth') ? 'eth'
          : chain.startsWith('base') ? 'base'
            : chain.startsWith('bsc') ? 'bsc'
              : (chain.startsWith('polygon') || chain === 'matic' || chain === 'pol') ? 'polygon'
                : (chain === 'pls' || chain === 'plsx' || chain.startsWith('pulse')) ? 'pulse'
                  : null;
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
    window.dispatchEvent(new StorageEvent('storage', { key: LS_CHAIN_TOTALS_KEY, newValue: 'updated' }));
  } catch { /* ignore */ }
}

// replace existing publishChainTotalsForWalletSig with this:
function publishChainTotalsForWalletSig(list = [], sig) {
  try {
    if (!sig) return;

    // EXACTLY match chip logic
    const totals = { eth: 0, pulse: 0, bsc: 0, polygon: 0, base: 0 };
    for (const t of list) {
      if (isJunkToken(t)) continue;                          // ← filter junk/spam
      const chain = String(t?.chain || '').toLowerCase();
      const price = Number(t.priceUsd ?? t.price ?? 0);
      const val = Number(t.valueUsd ?? (Number(t.amount || 0) * price)) || 0;
      if (val <= 0) continue;

      if (chain.startsWith('eth')) totals.eth += val;
      else if (chain === 'pulse' || chain.startsWith('pls')) totals.pulse += val;
      else if (chain.startsWith('bsc')) totals.bsc += val;
      else if (chain.startsWith('polygon') || chain === 'matic' || chain === 'pol') totals.polygon += val;
      else if (chain.startsWith('base')) totals.base += val;
    }

    const out = {
      updatedAt: Date.now(),
      totals: {
        // alias-safe: every reader will see the same number
        eth: totals.eth,
        ethereum: totals.eth,
        pulse: totals.pulse,
        pulsechain: totals.pulse,
        pls: totals.pulse,
        bsc: totals.bsc,
        polygon: totals.polygon,
        matic: totals.polygon,
        pol: totals.polygon,
        base: totals.base
      }
    };

    const key = `${LS_CHAIN_TOTALS_KEY}:${sig}`;
    localStorage.setItem(key, JSON.stringify(out));
    try { localStorage.removeItem(LS_CHAIN_TOTALS_KEY); } catch { }
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: 'updated' }));
  } catch { /* ignore */ }
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

// smart precision for token prices
const fmtPriceUSD = (n) => {
  const p = Number(n) || 0;
  let d;
  if (p >= 0.5) d = 2;
  else if (p >= 0.1) d = 4;
  else if (p >= 0.01) d = 5;
  else if (p >= 0.001) d = 6;
  else if (p >= 0.0001) d = 7;
  else d = 8;
  const s = p.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
  return `USD $${s}`;
};

const keyFor = (t) =>
  `${t.chain}:${t.address || 'native'}:${(t.symbol || '').toUpperCase()}`;

// ---- minimal junk filter ----
function isJunkToken(t) {
  if (isTokenBlacklisted && isTokenBlacklisted(t)) return true;
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

    /* Light theme override: stronger contrast on white backgrounds */
    :root:not([data-theme='dark']):not([data-pc-theme='dark']) .kinko-loading-cell {
      background: linear-gradient(90deg,
        #f3f3f3 0%,
        #ececec 25%,
        #e0e0e0 50%,
        #ececec 75%,
        #f3f3f3 100%);
      background-size: 200% 100%;
    }
    :root:not([data-theme='dark']):not([data-pc-theme='dark']) .kinko-loading-label {
      color: #555555;
      text-shadow: none;
    }

    .kwp-scope{
      --kw-price: 140px;
      --kw-amount: 170px;
      --kw-value: 140px;
      --kw-action: 84px;
      --kw-gap: 18px;
    }

    .kwp-row { padding: 8px 12px; border-bottom: 1px solid var(--bs-border-color);
      border-radius: 8px; transition: background-color .15s ease, box-shadow .15s ease; }
    .kwp-row:hover { background: rgba(255,255,255,.06); box-shadow: inset 0 0 0 1px rgba(255,255,255,.08); }
    :root:not([data-pc-theme='dark']) .kwp-row:hover { background: rgba(0,0,0,.04); box-shadow: inset 0 0 0 1px rgba(0,0,0,.08); }

    .kwp-left { 
      display: grid;
      grid-template-columns: 36px 12px minmax(0, 1fr);
      align-items: center;
      min-width: 0;
    }
    .kwp-logo { width: 36px; height: 36px; display: flex; align-items: center; }
    .kwp-spacer { width: 12px; }

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
    }
    [data-pc-theme='dark'] .k-chain-btn:hover { background: #383e49; border-color: #4d5564; }
    [data-pc-theme='dark'] .k-chain-btn.is-active { color: #fff; border-color: transparent; }
    .k-chain-btn:focus-visible {
      outline: 2px solid color-mix(in srgb, var(--k-chip-active-bg, var(--bs-primary)) 70%, #fff 30%);
      outline-offset: 2px;
    }

    /* --- copy icon button + toast --- */
    .kw-copy-btn{
      display:inline-flex; align-items:center; justify-content:center;
      width:22px; height:22px; margin-left:8px;
      border-radius:8px; cursor:pointer;
      border:1px solid var(--bs-border-color);
      background: var(--bs-secondary-bg);
      opacity:.85; transition: opacity .15s ease, background-color .15s ease, transform .06s ease;
    }
    /* Light theme: stronger icon contrast only */
    :root:not([data-theme='dark']):not([data-pc-theme='dark']) .kw-copy-btn{
      color: rgba(0,0,0,0.6); /* darker icon stroke */
    }
    .kw-copy-btn:hover{ opacity:1; background: color-mix(in srgb, var(--bs-secondary-bg) 85%, #fff 15%); }
    .kw-copy-btn:active{ transform: translateY(1px); }
    [data-pc-theme='dark'] .kw-copy-btn{ background:#2b2f36; border-color:#3e4451; }
    .kw-copy-btn svg{ width:16px; height:16px; }

    .kw-toast{
      position: fixed; bottom: 24px; left: 50%;
      transform: translateX(-50%) translateY(8px);
      background: rgba(0,0,0,.85); color:#fff;
      padding:10px 14px; border-radius:10px;
      box-shadow: 0 10px 30px rgba(0,0,0,.35);
      font-size:14px; pointer-events:none;
      opacity:0; transition: opacity .25s ease, transform .25s ease;
      z-index: 9999;
    }
    .kw-toast.show{ opacity:1; transform: translateX(-50%) translateY(0); }

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

// Small copy icon (overlapping squares)
function CopyIcon() {
  const searchRef = useRef(null);

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect
        x="9" y="9" width="12" height="12" rx="2" ry="2"
        fill="none" stroke="currentColor" strokeWidth="2"
      />
      <path
        d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
        fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

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
    case 'bsc': return 56;      // BSC
    case 'polygon': return 137; // Polygon
    case 'base': return 8453;   // Base
    case 'eth':
    case 'ethereum':
    default: return 1;          // Ethereum
  }
}

// small normaliser
const norm = (n) => (Number.isFinite(+n) ? +n : 0);

export default function Portfolio() {
  // Context (safe if provider missing)
  let ctx;
  try { ctx = useWallets(); } catch { ctx = undefined; }
  const replaceWallets = ctx?.replaceWallets ?? (() => { });
  const fromCtx = Array.isArray(ctx?.wallets) ? ctx.wallets : [];

  const fromLS = (() => { try { return JSON.parse(localStorage.getItem('wallets') || '[]'); } catch { return []; } })();
  const wallets = (fromCtx.length ? fromCtx : fromLS);
  const walletsSig = walletsSigOf(wallets);

  useEffect(() => {
    if (wallets && wallets.length) replaceWallets(wallets);
  }, [walletsSig, replaceWallets]);

  // Sticky chain filter sourced from global UI state
  useEffect(() => { setLastSection('portfolio'); }, []);
  const initialChip = useMemo(() => {
    // One-time override from Dashboard (Top Tokens tiles or View All)
    // If present and fresh, use it for initial chip without changing sticky state.
    const forced = consumeForceGlobalChipOnce();
    if (forced) return forced;
    const saved = getGlobalNetChip();
    return saved || 'all';
  }, []);
  // 'all' | 'eth' | 'pulse' | 'bsc' | 'polygon' | 'base'
  const [mode, setMode] = useState(initialChip);
  const onChipChange = (code) => {
    setMode(code);
    try { setGlobalNetChip(code); } catch { }
  };

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
  const searchRef = useRef(null);

  const memCacheRef = useRef(new Map());
  const reqIdRef = useRef(0);
  const loadingRef = useRef(false);

  // toast state for copy feedback
  const [toast, setToast] = useState({ show: false, text: '' });
  const toastTimerRef = useRef(null);
  const showToast = (text) => {
    setToast({ show: true, text });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast({ show: false, text: '' }), 2000);
  };
  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

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

      let match = null;

      // 1) If a composite key is provided, require an exact match (chain+address+symbol)
      if (wantKey) {
        const keyLc = wantKey.toLowerCase();
        match = (list || []).find((tt) => keyFor(tt).toLowerCase() === keyLc) || null;
      }

      // 2) Fallback only when no key match found: allow symbol OR address match
      if (!match && want) {
        const wantLc = want.toLowerCase();
        match = (list || []).find((tt) => (
          (tt.symbol || '').toLowerCase() === wantLc ||
          ((tt.address || tt.contract || '').toLowerCase() === wantLc)
        )) || null;
      }

      if (match) {
        const k = keyFor(match);
        setExpanded((prev) => {
          const n = new Set(prev);
          n.add(k);
          return n;
        });
        // Clear hints once we successfully expanded
        try {
          localStorage.removeItem('kw:focusToken');
          localStorage.removeItem('kw:focusTokenKey');
        } catch { /* ignore */ }
        return;
      }

      // If no match yet, keep the hints so the next tokens update can try again
    } catch { /* noop */ }
  };

  async function load(force = false) {
    // If a force-refresh is requested while a load is in-flight, ignore the click
    if (loadingRef.current && force) return;
    const myReq = ++reqIdRef.current;
    loadingRef.current = true;
    setError(null);

    const memKey = mode + '|' + walletsSig;

    const memHit = memCacheRef.current.get(memKey);
    if (!force && memHit && now() - memHit.updatedAt < CACHE_TTL) {
      if (reqIdRef.current !== myReq) return;
      setTotalUsd(memHit.totalUsd);
      persistTotal(memHit.totalUsd);
      setTokens(memHit.tokens);
      setBreakdown(new Map(memHit.breakdown));
      maybeExpandFromFocus(memHit.tokens);
      if (mode === 'all') publishChainTotalsForWalletSig(memHit.tokens, walletsSig);
      setBooting(false);
      setRefreshing(false);
      loadingRef.current = false;
      return;
    }

    const ls = readCache(mode, walletsSig);
    if (!force && ls && ls.fresh) {
      if (reqIdRef.current !== myReq) return;
      setTotalUsd(ls.totalUsd);
      persistTotal(ls.totalUsd);
      setTokens(ls.tokens);
      setBreakdown(new Map(ls.breakdown || []));
      maybeExpandFromFocus(ls.tokens);
      if (mode === 'all') publishChainTotalsForWalletSig(ls.tokens, walletsSig);
      setBooting(false);
      setRefreshing(false);
      memCacheRef.current.set(memKey, { ...ls });
      if (mode === 'all') {
        try {
          const topN = [...(ls.tokens || [])]
            .filter((t) => !isJunkToken(t) && (Number(t.valueUsd) || 0) > 0)
            .sort((a, b) => Number(b.valueUsd) - Number(a.valueUsd))
            .slice(0, TOPN_DASHBOARD)
            .map((t) => ({
              symbol: t.symbol, name: t.name || t.symbol, chain: t.chain,
              address: t.address || t.contract || '', logo: t.logo || t.icon || '',
              valueUsd: Number(t.valueUsd) || 0, amount: Number(t.amount ?? t.balance) || 0,
              priceUsd: Number(t.priceUsd ?? t.price ?? 0) || (
                Number(t.amount ?? t.balance) > 0
                  ? (Number(t.valueUsd) || 0) / Number(t.amount ?? t.balance)
                  : 0
              ),
              change24hPct: getChangePct(t), dexUrl: t.dexUrl || null
            }));
          writeTopTokensCache(topN);
        } catch { }
      }
      loadingRef.current = false;
      return;
    }

    if (!force && (memHit || ls)) {
      const stale = memHit || ls;
      const st = stale.totalUsd || 0;
      setTotalUsd(st);
      persistTotal(st);
      setTokens(stale.tokens || []);
      setBreakdown(new Map(stale.breakdown || []));
      if (mode === 'all') publishChainTotalsForWalletSig(stale.tokens || [], walletsSig);
      setBooting(false);
      setRefreshing(true);
    } else {
      setBooting(true);
      setRefreshing(false);
    }

    try {
      const { totalUsd, tokens, breakdown } = await buildPortfolioDetailed(wallets, { only: mode, force });
      if (reqIdRef.current !== myReq) return; // stale
      setTotalUsd(totalUsd);
      persistTotal(totalUsd);

      // Compute value for each token
      let tokensWithValue = (tokens || []).map((t) => {
        const price = Number(t.priceUsd ?? t.price ?? 0);
        const amount = Number(t.amount ?? 0);
        const valueUsd = Number(t.valueUsd ?? (t.usd ?? (amount * price)));
        return { ...t, valueUsd };
      });

      // Attach 24h % change (contract + native) in parallel, then merge
      try {
        const [changeMap, nativeMap] = await Promise.all([
          fetchChange24hFromDexScreener(tokensWithValue),
          fetchNativeChange24h(tokensWithValue)
        ]);
        tokensWithValue = tokensWithValue.map((t) => {
          // prefer contract change when available
          const contractPct = changeMap.get(changeKey(t));
          const nativePct = (!t.address && !t.contract) ? nativeMap.get(nativeKey(t)) : null;
          const pct = (contractPct != null && Number.isFinite(contractPct))
            ? Number(contractPct)
            : (nativePct != null && Number.isFinite(nativePct)) ? Number(nativePct) : null;
          return (pct != null) ? { ...t, change24hPct: pct } : t;
        });
      } catch { /* non-fatal */ }

      if (reqIdRef.current !== myReq) return; // stale
      setTokens(tokensWithValue);
      setBreakdown(breakdown);
      maybeExpandFromFocus(tokensWithValue);

      const payload = { totalUsd, tokens: tokensWithValue, breakdown: Array.from(breakdown.entries()), updatedAt: now() };
      memCacheRef.current.set(memKey, payload);
      writeCache(mode, walletsSig, payload);
      saveTotalsToLS(totalUsd, 0);

      if (mode === 'all') publishChainTotalsForWalletSig(tokensWithValue, walletsSig);

      if (mode === 'all') {
        try {
          const topN = [...tokensWithValue]
            .filter((t) => !isJunkToken(t) && (Number(t.valueUsd) || 0) > 0)
            .sort((a, b) => Number(b.valueUsd) - Number(a.valueUsd))
            .slice(0, TOPN_DASHBOARD)
            .map((t) => ({
              symbol: t.symbol, name: t.name || t.symbol, chain: t.chain,
              address: t.address || t.contract || '', logo: t.logo || t.icon || '',
              valueUsd: Number(t.valueUsd) || 0, amount: Number(t.amount ?? t.balance) || 0,
              priceUsd: Number(t.priceUsd ?? t.price ?? 0) || (
                Number(t.amount ?? t.balance) > 0
                  ? (Number(t.valueUsd) || 0) / Number(t.amount ?? t.balance)
                  : 0
              ),
              // pass through our new field so the dashboard tiles show ▲/▼
              change24hPct: getChangePct(t),
              dexUrl: t.dexUrl || null
            }));
          writeTopTokensCache(topN);
        } catch { }
      }
    } catch (e) {
      setError(e?.message || 'Failed to load portfolio');
    } finally {
      if (reqIdRef.current === myReq) {
        setBooting(false);
        setRefreshing(false);
        loadingRef.current = false;
      }
    }
  }

  useEffect(() => { load(false); /* eslint-disable-next-line */ }, [walletsSig, mode]);

  // Retry expand whenever tokens update (in case timing was off)
  useEffect(() => { maybeExpandFromFocus(tokens); /* eslint-disable-next-line */ }, [tokens]);

  // ====== publish this page’s total into the global context ======
  const { setSource, removeSource } = usePortfolioValue();

  useEffect(() => {
    if (mode === 'all') setSource(PORTFOLIO_SOURCE, Number(totalUsd) || 0);
  }, [mode, totalUsd, setSource]);

  useEffect(() => () => removeSource(PORTFOLIO_SOURCE), [removeSource]);

  // ====== per-chain totals from current tokens ======
  const chainTotalsFromTokens = useMemo(() => {
    const totals = { pulse: 0, eth: 0, bsc: 0, polygon: 0, base: 0 };
    for (const t of tokens) {
      if (isJunkToken(t)) continue;
      const chain = String(t.chain || '').toLowerCase();
      const price = Number(t.priceUsd ?? t.price ?? 0);
      const val = Number(t.valueUsd ?? (Number(t.amount || 0) * price)) || 0;
      if (val <= 0) continue;
      if (chain.startsWith('eth')) totals.eth += val;
      else if (chain === 'pulse' || chain.startsWith('pls')) totals.pulse += val;
      else if (chain.startsWith('bsc')) totals.bsc += val;
      else if (chain.startsWith('polygon') || chain === 'matic' || chain === 'pol') totals.polygon += val;
      else if (chain.startsWith('base')) totals.base += val;
    }
    return totals;
  }, [tokens]);

  // ====== choose totals to show in chips immediately (cache-first) ======
  const cached = readChainTotalsCache(walletsSig);
  const effectiveTotals = useMemo(() => {
    // If fresh build hasn't populated tokens yet, fall back to cached totals so chips render instantly.
    const computed = chainTotalsFromTokens;
    const hasAny = (computed.eth + computed.pulse + computed.bsc + computed.polygon + computed.base) > 0;
    return hasAny ? computed : { eth: cached.eth, pulse: cached.pulse, bsc: cached.bsc, polygon: cached.polygon, base: cached.base };
  }, [chainTotalsFromTokens, cached.eth, cached.pulse, cached.bsc, cached.polygon, cached.base]);

  // ====== header total reflects current mode ======
  const headerTotalUsd = useMemo(() => {
    if (mode === 'eth') return effectiveTotals.eth || 0;
    if (mode === 'pulse') return effectiveTotals.pulse || 0;
    if (mode === 'bsc') return effectiveTotals.bsc || 0;
    if (mode === 'polygon') return effectiveTotals.polygon || 0;
    if (mode === 'base') return effectiveTotals.base || 0;
    // all
    return (effectiveTotals.eth + effectiveTotals.pulse + effectiveTotals.bsc + effectiveTotals.polygon + effectiveTotals.base) || Number(totalUsd) || 0;
  }, [mode, effectiveTotals, totalUsd]);

  // ====== chips: All shows all; others show only the selected chain ======
  const assetChips = useMemo(() => {
    const possible = [
      { key: 'eth', label: 'Ethereum', usd: norm(effectiveTotals.eth), color: '#10b981' },
      { key: 'pulse', label: 'PulseChain', usd: norm(effectiveTotals.pulse), color: '#cc08c6' },
      { key: 'bsc', label: 'BSC', usd: norm(effectiveTotals.bsc), color: '#F3BA2F' },
      { key: 'polygon', label: 'Polygon', usd: norm(effectiveTotals.polygon), color: '#7b3fe4' },
      { key: 'base', label: 'Base', usd: norm(effectiveTotals.base), color: '#3b82f6' }
    ];

    const filtered = mode === 'all'
      ? possible // show all chips in All
      : possible.filter(r => r.key === (mode === 'pulse' ? 'pulse' : mode === 'eth' ? 'eth' : mode === 'bsc' ? 'bsc' : mode === 'polygon' ? 'polygon' : 'base'));

    // Keep Base visible even if 0.00; other non-selected chains are hidden by the filter above.
    filtered.sort((a, b) => b.usd - a.usd);
    return filtered;
  }, [effectiveTotals, mode]);

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

  // copy contract handler (only used on mode === 'all')
  const copyContract = async (addr) => {
    if (!addr) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(addr);
      } else {
        // fallback
        const ta = document.createElement('textarea');
        ta.value = addr;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      showToast('Contract copied to clipboard');
    } catch {
      showToast('Copy failed');
    }
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

                  {/* Total reflects selected chain (or All) */}
                  <h2 className="mb-1 kw-grand-total">{fmtUSD(headerTotalUsd)}</h2>

                  {/* Chips: cache-first values; All shows all, chain views show one */}
                  <div className="d-flex flex-wrap align-items-center gap-2 mb-1" style={{ fontSize: 12 }}>
                    {assetChips.map((r) => {
                      const denom = (mode === 'all')
                        ? (effectiveTotals.eth + effectiveTotals.pulse + effectiveTotals.bsc + effectiveTotals.polygon + effectiveTotals.base)
                        : headerTotalUsd;
                      const pct = denom > 0 ? Math.round((r.usd / denom) * 1000) / 10 : 0;
                      return (
                        <div
                          key={r.key}
                          className="kw-asset-chip d-inline-flex align-items-center px-2 py-1 rounded-pill"
                          title={`${r.label}: USD ${r.usd.toLocaleString('en-AU', { maximumFractionDigits: 0 })}${denom > 0 ? ` (${pct}%)` : ''}`}
                        >
                          <span
                            style={{ width: 10, height: 10, borderRadius: '50%', display: 'inline-block', marginRight: 8, backgroundColor: r.color }}
                          />
                          <span className="me-2">{r.label}</span>
                          <span className="text-muted">
                            ${r.usd.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            {denom > 0 && <> &nbsp;•&nbsp; {pct}%</>}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="d-inline-flex align-items-center gap-2" style={{ fontSize: 12 }}>
                    <span className="text-success">24h: +0.00%</span>
                    <span className="text-muted">• Wallets: {walletCount}</span>
                    <span className="text-muted">• Updated: {lastUpdatedLabel}{refreshing ? ' (refreshing...)' : ''}</span>
                  </div>
                </div>

                <ChainSelector value={mode} onChange={onChipChange} />
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* CONTROLS */}
      <Row className="mb-3">
        <Col md={6} className="mb-2">
          <div className="kw-search-wrap">
            <Form.Control
              placeholder="Search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              ref={searchRef}
            />
            {q && (
              <button
                type="button"
                className="kw-search-clear"
                onClick={() => { setQ(''); setTimeout(() => searchRef?.current?.focus?.(), 0); }}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>
        </Col>
        <Col md={6} className="text-md-end">
          <button type="button" className="k-chain-btn" onClick={() => load(true)} title="Refresh">
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </Col>
      </Row>

      {/* Sub-label */}
      <Row className="mb-2">
        <Col>
          <small className="text-muted">
            {mode === 'all'
              ? 'All chains - ERC-20, BEP-20 & PRC-20 tokens'
              : mode === 'pulse'
                ? 'PulseChain - PRC-20 tokens'
                : mode === 'bsc'
                  ? 'BSC - BEP-20 tokens'
                  : mode === 'polygon'
                    ? 'Polygon - ERC-20 tokens'
                    : `${mode === 'base' ? 'Base' : 'Ethereum'} - ERC-20 tokens`}
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

                // Show shorter ticker for Polygon on View All: POL
                const label = (t.chain === 'pulse') ? 'Pulse' : (t.chain === 'bsc') ? 'BSC' : (t.chain === 'polygon') ? 'POL' : (t.chain === 'base') ? 'Base' : 'ETH';
                const logoChainId = chainIdOf(t.chain);
                const logoAddr = (t.address || t.contract || '') || null;

                // address we can copy (only if exists)
                const copyAddr = (t.address || t.contract || '').trim();

                return (
                  <div key={`${k}:${i}`} className="kwp-row">
                    <div className="d-flex align-items-center justify-content-between">
                      {/* LEFT: icon + spacer + symbol/name */}
                      <div className="kwp-left">
                        <div className="kwp-logo">
                          <TokenLogo chainId={logoChainId} address={logoAddr} symbol={t.symbol} size={36} />
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
                          <div className="kwp-sub d-flex align-items-center">
                            {mode === 'all' && <ChainBadge chain={t.chain}>{label}</ChainBadge>}
                            {/* Copy icon ONLY on View All + when token has a contract address */}
                            {mode === 'all' && !!copyAddr && (
                              <button
                                type="button"
                                className="kw-copy-btn"
                                title="Copy contract to clipboard"
                                onClick={() => copyContract(copyAddr)}
                                aria-label="Copy contract"
                              >
                                <CopyIcon />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* RIGHT: price/amount/value + expand */}
                      <div className="kwp-cols">
                        <div className="kwp-col kwp-price">
                          <div className="text-muted" style={{ fontSize: 12 }}>Price</div>
                          <div className="kw-price">{fmtPriceUSD(price)}</div>
                          {delta != null && (<div className={`kwp-delta ${deltaCls}`} style={{ fontSize: 12 }}>{deltaTxt}</div>)}
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

      {/* toast */}
      <div className={`kw-toast ${toast.show ? 'show' : ''}`}>{toast.text}</div>
    </>
  );
}
