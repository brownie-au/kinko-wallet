// src/views/portfolio/Portfolio.jsx
/* eslint-disable import/no-relative-parent-imports */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Row, Col, Card, Form } from 'react-bootstrap';
import { getPortfolioTotalUsd, /* read cache */ setPortfolioTotalUsd } from '../../utils/portfolioTotal';
import { useWallets } from '../../contexts/WalletContext';
// Use live aggregator for Ethereum (completeness), cache-first for others
import { buildPortfolioDetailedFromCache, buildPortfolioDetailed as buildPortfolioLive } from '../../services/portfolioAggService';

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
const LS_PCT_META_KEY = 'kw:lastChangePct24hMeta';
const LS_FIRST_SEEN_KEY = 'kw:portfolio:firstSeenAt';
const LS_SNAP_24H_KEY = 'kw:portfolio:snap:24h';
const DAY_MS = 24 * 60 * 60 * 1000;
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
      if (isJunkToken(t)) continue;
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

function saveTotalsToLS(totalUsd, changePct24h, meta = null) {
  try {
    localStorage.setItem(LS_TOTAL_KEY, String(Number(totalUsd) || 0));
    if (Number.isFinite(changePct24h)) {
      localStorage.setItem(LS_PCT_KEY, String(changePct24h));
    } else {
      localStorage.removeItem(LS_PCT_KEY);
    }
    localStorage.setItem(LS_UPDATED_KEY, String(Date.now()));
    if (meta) localStorage.setItem(LS_PCT_META_KEY, JSON.stringify(meta));
    else localStorage.removeItem(LS_PCT_META_KEY);
  } catch { }
}

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { }
}

function ensureFirstSeen(nowMs) {
  try {
    const existing = localStorage.getItem(LS_FIRST_SEEN_KEY);
    if (existing) {
      const ms = Date.parse(existing);
      if (!Number.isNaN(ms)) return { iso: existing, ms };
    }
  } catch { }
  const iso = new Date(nowMs).toISOString();
  try { localStorage.setItem(LS_FIRST_SEEN_KEY, iso); } catch { }
  return { iso, ms: nowMs };
}

function readSnapshot() {
  const snap = readJson(LS_SNAP_24H_KEY);
  if (!snap || typeof snap.totalUsd !== 'number' || !snap.ts) return null;
  const ms = Date.parse(snap.ts);
  if (Number.isNaN(ms)) return null;
  return { ...snap, ms };
}

function writeSnapshot(totalUsd, nowMs) {
  const payload = { ts: new Date(nowMs).toISOString(), totalUsd: Number(totalUsd) || 0 };
  writeJson(LS_SNAP_24H_KEY, payload);
  return { ...payload, ms: nowMs };
}

function computePortfolioChangeMeta(tokens = [], totalUsd = 0) {
  const nowMs = Date.now();
  const total = Number(totalUsd) || 0;
  const firstSeen = ensureFirstSeen(nowMs);
  let snapshot = readSnapshot();
  if (!snapshot) snapshot = writeSnapshot(total, nowMs);

  let withData = 0;
  let considered = 0;

  let sumThen = 0;
  let missing = 0;

  for (const token of tokens || []) {
    const amount = Number(token?.amount ?? token?.balance ?? 0) || 0;
    const price = Number(token?.priceUsd ?? token?.price ?? 0) || 0;
    const value = Number(token?.valueUsd ?? token?.usd ?? (amount * price)) || 0;
    if (!(value > 0)) continue;
    considered += 1;
    const pct = getChangePct(token);
    if (typeof pct === 'number' && Number.isFinite(pct)) {
      const denom = 1 + (pct / 100);
      if (denom > 1e-6) {
        const thenVal = value / denom;
        if (Number.isFinite(thenVal)) {
          withData += 1;
          sumThen += thenVal;
          continue;
        }
      }
    }
    missing += value;
  }

  if (withData > 0) {
    const approx = missing > 0.01;
    const thenTotal = sumThen + missing;
    const pct = thenTotal > 0 ? ((total - thenTotal) / thenTotal) * 100 : 0;
    snapshot = writeSnapshot(total, nowMs);
    return {
      mode: 'api',
      pct,
      approx,
      missingUsd: missing,
      tokensWithChange: withData,
      tokensConsidered: considered,
      updatedAt: new Date(nowMs).toISOString(),
      snapshotTs: snapshot.ts
    };
  }

  if (snapshot.totalUsd > 0 && nowMs - snapshot.ms >= DAY_MS) {
    const pct = ((total - snapshot.totalUsd) / snapshot.totalUsd) * 100;
    snapshot = writeSnapshot(total, nowMs);
    return {
      mode: 'snapshot',
      pct,
      approx: false,
      updatedAt: new Date(nowMs).toISOString(),
      snapshotTs: snapshot.ts
    };
  }

  const remainingMs = Math.max(firstSeen.ms + DAY_MS - nowMs, 0);
  if (!snapshot || !snapshot.ts) snapshot = writeSnapshot(total, nowMs);
  return {
    mode: 'countdown',
    pct: null,
    approx: false,
    remainingMs,
    firstSeenAt: firstSeen.iso,
    updatedAt: new Date(nowMs).toISOString(),
    snapshotTs: snapshot.ts
  };
}

function applyChangeSnapshot(tokens, totalUsd) {
  const meta = computePortfolioChangeMeta(tokens, totalUsd);
  saveTotalsToLS(totalUsd, meta?.pct ?? null, meta);
  return meta;
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

    /* Light theme override */
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
      color: #555555; text-shadow: none;
    }

    .kwp-scope{
      --kw-price: 140px;
      --kw-amount: 170px;
      --kw-value: 140px;
      --kw-change: 120px;
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
      align-items: center; min-width: 0;
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
    .kwp-change { width: var(--kw-change); display:flex; flex-direction:column; align-items:flex-end; text-align:right; gap:4px; }

    .kwp-change-pill { display:inline-flex; align-items:center; justify-content:center; gap:4px; padding:2px 10px; border-radius:999px; font-size:0.85rem; font-weight:600; background: rgba(108,117,125,0.15); color: var(--bs-secondary-color); }
    .kwp-change-pill.up { color: #16c784; background: rgba(22,199,132,0.18); }
    .kwp-change-pill.down { color: #ea3943; background: rgba(234,57,67,0.18); }
    .kwp-change-pill.zero { color: var(--bs-secondary-color); background: rgba(108,117,125,0.18); }
    .kwp-change-pill.muted { color: var(--bs-secondary-color); background: transparent; opacity: 0.7; }
    .kwp-change-arrow { line-height: 1; }
    :root[data-pc-theme='dark'] .kwp-change-pill { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.85); }
    :root[data-pc-theme='dark'] .kwp-change-pill.up { background: rgba(22,199,132,0.28); color: #32d296; }
    :root[data-pc-theme='dark'] .kwp-change-pill.down { background: rgba(234,57,67,0.28); color: #ff6b6b; }
    :root[data-pc-theme='dark'] .kwp-sub{ color: rgba(255,255,255,.65); }

    /* Softer per-wallet $ change colours to match the pills */
    .kwp-change-up   { color: #32d296; } /* darker green like the pill */
    .kwp-change-down { color: #ff6b6b; } /* darker red like the pill  */

    .kwp-break { margin-top: 4px; }
    .kwp-break-hdr{
      display:grid;
      grid-template-columns: 1fr var(--kw-price) var(--kw-amount) var(--kw-value) var(--kw-change) var(--kw-action);
      column-gap: var(--kw-gap);
      align-items: end;
      margin-bottom: 2px;
    }
    .kwp-break-title { font-size:12px; color: var(--bs-secondary-color); letter-spacing:.3px; }

    .kwp-break-row{
      display:grid;
      grid-template-columns: 1fr var(--kw-price) var(--kw-amount) var(--kw-value) var(--kw-change) var(--kw-action);
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
    [data-pc-theme='dark'] .k-chain-btn { --k-chip-bg: #2b2f36; --k-chip-fg: #f3f6fb; border-color: #3e4451; }
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
    :root:not([data-theme='dark']):not([data-pc-theme='dark']) .kw-copy-btn{ color: rgba(0,0,0,0.6); }
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

// Small copy icon
function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="9" width="12" height="12" rx="2" ry="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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
    t.pctChange24h,
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
const SOURCE_LABELS = {
  defillama: 'DefiLlama',
  dexscreener: 'DexScreener',
  'dex(wpls)': 'Dex (WPLS)',
  dex: 'DexScreener',
  blockscout: 'Blockscout',
  legacy: 'Legacy'
};

function formatChangeSource(raw) {
  const key = String(raw || '').toLowerCase();
  if (!key) return null;
  if (Object.prototype.hasOwnProperty.call(SOURCE_LABELS, key)) return SOURCE_LABELS[key];
  return key.replace(/(^|[\s_-])([a-z])/g, (m, p, c) => `${p}${c.toUpperCase()}`);
}

function ChangeBadge({ pct, source }) {
  if (pct == null) {
    return <span className="kwp-change-pill muted" title="24h change not available">&mdash;</span>;
  }
  const label = formatChangeSource(source);
  const tooltip = label ? `24h change from market data (${label})` : '24h change from market data';
  const isZero = Math.abs(pct) < 0.005;
  if (isZero) {
    return <span className="kwp-change-pill zero" title={tooltip}>0.00%</span>;
  }
  const positive = pct > 0;
  const arrow = positive ? String.fromCharCode(0x25B2) : String.fromCharCode(0x25BC);
  const className = positive ? 'kwp-change-pill up' : 'kwp-change-pill down';
  return (
    <span className={className} title={tooltip}>
      <span className="kwp-change-arrow">{arrow}</span>
      {Math.abs(pct).toFixed(2)}%
    </span>
  );
}

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

  useEffect(() => { setLastSection('portfolio'); }, []);
  const initialChip = useMemo(() => {
    const forced = consumeForceGlobalChipOnce();
    if (forced) return forced;
    const saved = getGlobalNetChip();
    return saved || 'all';
  }, []);
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

  // toast state
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

  const maybeExpandFromFocus = (list) => {
    try {
      const want = (localStorage.getItem('kw:focusToken') || '').trim();
      const wantKey = (localStorage.getItem('kw:focusTokenKey') || '').trim();
      if (!want && !wantKey) return;

      let match = null;

      if (wantKey) {
        const keyLc = wantKey.toLowerCase();
        match = (list || []).find((tt) => keyFor(tt).toLowerCase() === keyLc) || null;
      }

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
        try {
          localStorage.removeItem('kw:focusToken');
          localStorage.removeItem('kw:focusTokenKey');
        } catch { }
      }
    } catch { }
  };

  async function load(force = false) {
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
      applyChangeSnapshot(memHit.tokens || [], memHit.totalUsd);
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
      applyChangeSnapshot(ls.tokens || [], ls.totalUsd);
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
      applyChangeSnapshot(stale.tokens || [], st);
      if (mode === 'all') publishChainTotalsForWalletSig(stale.tokens || [], walletsSig);
      setBooting(false);
      setRefreshing(true);
    } else {
      setBooting(true);
      setRefreshing(false);
    }

    try {
      const builder = (mode === 'eth') ? buildPortfolioLive : buildPortfolioDetailedFromCache;
      const { totalUsd, tokens, breakdown } = await builder(wallets, { only: mode, force });
      if (reqIdRef.current !== myReq) return;
      setTotalUsd(totalUsd);
      persistTotal(totalUsd);

      let tokensWithValue = (tokens || []).map((t) => {
        const price = Number(t.priceUsd ?? t.price ?? 0);
        const amount = Number(t.amount ?? 0);
        const valueUsd = Number(t.valueUsd ?? (t.usd ?? (amount * price)));
        return { ...t, valueUsd };
      });

      try {
        const [changeMap, nativeMap] = await Promise.all([
          fetchChange24hFromDexScreener(tokensWithValue),
          fetchNativeChange24h(tokensWithValue)
        ]);
        tokensWithValue = tokensWithValue.map((t) => {
          const contractPct = changeMap.get(changeKey(t));
          const nativePct = (!t.address && !t.contract) ? nativeMap.get(nativeKey(t)) : null;
          const pct = (contractPct != null && Number.isFinite(contractPct))
            ? Number(contractPct)
            : (nativePct != null && Number.isFinite(nativePct)) ? Number(nativePct) : null;
          return (pct != null) ? { ...t, change24hPct: pct } : t;
        });
      } catch { /* non-fatal */ }

      if (reqIdRef.current !== myReq) return;
      setTokens(tokensWithValue);
      setBreakdown(breakdown);
      maybeExpandFromFocus(tokensWithValue);
      applyChangeSnapshot(tokensWithValue, totalUsd);

      const payload = { totalUsd, tokens: tokensWithValue, breakdown: Array.from(breakdown.entries()), updatedAt: now() };
      memCacheRef.current.set(memKey, payload);
      writeCache(mode, walletsSig, payload);

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

  useEffect(() => { load(false); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [walletsSig, mode]);
  useEffect(() => { maybeExpandFromFocus(tokens); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [tokens]);

  const { setSource, removeSource } = usePortfolioValue();
  useEffect(() => { if (mode === 'all') setSource(PORTFOLIO_SOURCE, Number(totalUsd) || 0); }, [mode, totalUsd, setSource]);
  useEffect(() => () => removeSource(PORTFOLIO_SOURCE), [removeSource]);

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

  const cached = readChainTotalsCache(walletsSig);
  const effectiveTotals = useMemo(() => {
    const computed = chainTotalsFromTokens;
    const hasAny = (computed.eth + computed.pulse + computed.bsc + computed.polygon + computed.base) > 0;
    return hasAny ? computed : { eth: cached.eth, pulse: cached.pulse, bsc: cached.bsc, polygon: cached.polygon, base: cached.base };
  }, [chainTotalsFromTokens, cached.eth, cached.pulse, cached.bsc, cached.polygon, cached.base]);

  const headerTotalUsd = useMemo(() => {
    if (mode === 'eth') return effectiveTotals.eth || 0;
    if (mode === 'pulse') return effectiveTotals.pulse || 0;
    if (mode === 'bsc') return effectiveTotals.bsc || 0;
    if (mode === 'polygon') return effectiveTotals.polygon || 0;
    if (mode === 'base') return effectiveTotals.base || 0;
    return (effectiveTotals.eth + effectiveTotals.pulse + effectiveTotals.bsc + effectiveTotals.polygon + effectiveTotals.base) || Number(totalUsd) || 0;
  }, [mode, effectiveTotals, totalUsd]);

  const assetChips = useMemo(() => {
    const possible = [
      { key: 'eth', label: 'Ethereum', usd: norm(effectiveTotals.eth), color: '#10b981' },
      { key: 'pulse', label: 'PulseChain', usd: norm(effectiveTotals.pulse), color: '#cc08c6' },
      { key: 'bsc', label: 'BSC', usd: norm(effectiveTotals.bsc), color: '#F3BA2F' },
      { key: 'polygon', label: 'Polygon', usd: norm(effectiveTotals.polygon), color: '#7b3fe4' },
      { key: 'base', label: 'Base', usd: norm(effectiveTotals.base), color: '#3b82f6' }
    ];

    const filtered = mode === 'all'
      ? possible
      : possible.filter(r => r.key === (mode === 'pulse' ? 'pulse' : mode === 'eth' ? 'eth' : mode === 'bsc' ? 'bsc' : mode === 'polygon' ? 'polygon' : 'base'));

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

  const copyContract = async (addr) => {
    if (!addr) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(addr);
      } else {
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

                  <h2 className="mb-1 kw-grand-total">{fmtUSD(headerTotalUsd)}</h2>

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
                const changeSource = t.changeSource || t.priceSource || null;

                const label = (t.chain === 'pulse') ? 'Pulse' : (t.chain === 'bsc') ? 'BSC' : (t.chain === 'polygon') ? 'POL' : (t.chain === 'base') ? 'Base' : 'ETH';
                const logoChainId = chainIdOf(t.chain);
                const logoAddr = (t.address || t.contract || '') || null;

                const copyAddr = (t.address || t.contract || '').trim();

                return (
                  <div key={`${k}:${i}`} className="kwp-row">
                    <div className="d-flex align-items-center justify-content-between">
                      {/* LEFT */}
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

                      {/* RIGHT: price/amount/value + change + action */}
                      <div className="kwp-cols">
                        <div className="kwp-col kwp-price">
                          <div className="text-muted" style={{ fontSize: 12 }}>Price</div>
                          <div className="kw-price">{fmtPriceUSD(price)}</div>
                        </div>
                        <div className="kwp-col kwp-amount">
                          <div className="text-muted" style={{ fontSize: 12 }}>Amount</div>
                          <div>{fmtAmt(t.amount)} {t.symbol}</div>
                        </div>
                        <div className="kwp-col kwp-value">
                          <div className="text-muted" style={{ fontSize: 12 }}>Value</div>
                          <div className="fw-semibold">{fmtUSD(Number(t.valueUsd ?? (Number(t.amount || 0) * price)))}</div>
                        </div>
                        <div className="kwp-col kwp-change">
                          <div className="text-muted" style={{ fontSize: 12 }}>24h Change</div>
                          <ChangeBadge pct={delta} source={changeSource} />
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
                          <div /> <div /> <div /> <div /> <div />
                        </div>

                        {rows.length === 0 && (
                          <div className="kwp-break-row">
                            <div className="text-muted">No holdings.</div>
                            <div></div><div></div><div></div><div></div><div></div>
                          </div>
                        )}

                        {rows.map((r, idx) => {
                          const amt = Number(r.amount) || 0;
                          const valNow = amt * price;
                          // show only the +/- USD DIFFERENCE for the last 24h (no minus sign; color encodes direction)
                          const deltaUsd = (delta == null || !isFinite(delta)) ? null : valNow * (delta / 100);
                          const cls =
                            deltaUsd == null || Math.abs(deltaUsd) < 0.005
                              ? 'kwp-right text-muted'
                              : deltaUsd > 0
                                ? 'kwp-right kwp-change-up fw-semibold'
                                : 'kwp-right kwp-change-down fw-semibold';

                          return (
                            <div key={idx} className="kwp-break-row">
                              <div className="kwp-break-name">{walletName(r.wallet)}</div>
                              <div></div>{/* price placeholder, aligned with header */}
                              <div className="kwp-right">{fmtAmt(r.amount)} {t.symbol}</div>
                              <div className="kwp-right">{fmtUSD(valNow)}</div>
                              <div className={cls}>
                                {deltaUsd == null ? '—' : fmtUSD(Math.abs(deltaUsd))}
                              </div>
                              <div></div>{/* action placeholder */}
                            </div>
                          );
                        })}
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
