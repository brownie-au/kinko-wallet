/* eslint-disable import/no-relative-parent-imports */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Row, Col, Card, Button, Form, Modal } from 'react-bootstrap';

// Base still uses Moralis (for now)
import { getPortfolioWithPrices } from '../../services/moralisService.js';
// ETH: align with View All (Blockscout discovery + DefiLlama prices)
import { buildPortfolioDetailed } from '../../services/portfolioAggService';
// PulseChain stays on Blockscout + Dexscreener
import { fetchPulsechainTokens } from '../../services/pulsechainService.js';

// Shared, theme-aware chain UI
import { ChainSelector, ChainChip } from '../../components/ChainUI';
// use the same logo component as the portfolio page
import TokenLogo from '../../components/TokenLogo';

// ✅ smart low‑price formatter (shared)
import { fmtPriceUSD } from '../../utils/priceFormat';

import wallets from '../../data/wallets.js';
import { isTokenBlacklisted } from '../../data/tokenBlocklist';
import {
  setWalletCache,
  getWalletCache,
  clearWalletCache,
  clearWalletPrefix,
  WALLET_CACHE_DEFAULT_TTL
} from '../../utils/walletCache';
import { getCachedJSON } from '../../utils/kinkoCache';

import {
  getLastSection,
  setLastSection,
  getWalletNetChip,
  setWalletNetChip
} from '../../utils/uiState';

// ----------------------------- utils -----------------------------
const fmtUSD = (n) => {
  const amt = (Number(n) || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `USD $${amt}`;
};

const fmtNum = (n) =>
  (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 6 });

const short = (a) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || '');

const addrStyle = {
  fontFamily: 'monospace',
  fontSize: 18,
  lineHeight: '24px',
  display: 'inline-block',
  verticalAlign: 'middle'
};

// helper to translate chain code -> numeric chainId for TokenLogo
const chainIdOf = (chain) => {
  switch (String(chain || '').toLowerCase()) {
    case 'pulse': return 369;
    case 'base': return 8453;
    case 'eth':
    case 'ethereum':
    default: return 1;
  }
};

// ---------------- wallet name/chain resolver (robust) ----------------
function findByAddrLoose(arr, addrLower) {
  const array = Array.isArray(arr) ? arr : [];
  const addrFields = ['address', 'addr', 'account', 'publicKey', 'public_key', 'hash', 'id', 'wallet'];

  let item = array.find((w) =>
    addrFields.some((f) => (w?.[f] || '').toLowerCase() === addrLower)
  );
  if (item) return item;

  item = array.find((w) => {
    const vals = addrFields.map((f) => (w?.[f] || '').toLowerCase());
    return vals.some((v) => v && (addrLower.startsWith(v) || addrLower.endsWith(v)));
  });
  return item || null;
}

function findAnyWalletRecord(addressLower) {
  let rec = findByAddrLoose(wallets, addressLower);
  if (rec) return rec;

  try {
    const keys = ['wallets', 'kinko:wallets', 'kinko_wallets', 'portfolio:wallets'];
    for (const k of keys) {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const groups = [];

      if (Array.isArray(parsed)) groups.push(parsed);
      else if (parsed && typeof parsed === 'object') {
        groups.push([parsed]);
        Object.values(parsed).forEach((v) => { if (Array.isArray(v)) groups.push(v); });
      }

      for (const g of groups) {
        const hit = findByAddrLoose(g, addressLower);
        if (hit) return hit;
      }
    }
  } catch { /* ignore */ }

  return null;
}

function normalizeChain(x) {
  const s = (x ?? '').toString().toLowerCase();
  if (s.includes('pulse') || s === '369') return 'pulse';
  if (s.includes('base') || s === '8453') return 'base';
  return 'eth';
}

function resolveWalletName(address) {
  const a = (address || '').toLowerCase();
  if (!a) return 'Wallet';
  const rec = findAnyWalletRecord(a);
  return rec?.name || rec?.label || rec?.title || rec?.nickname || 'Wallet';
}

function resolveGroupId(address) {
  const rec = findAnyWalletRecord((address || '').toLowerCase()) || {};
  return (
    rec.group ||
    rec.grp ||
    rec.collection ||
    rec.folder ||
    rec.section ||
    rec.category ||
    rec.groupId ||
    'default'
  );
}

// -------- tiny icon button --------
const IconButton = ({ title, onClick, children }) => (
  <button
    type="button"
    className="btn btn-sm btn-outline-secondary p-1 d-inline-flex align-items-center justify-content-center"
    style={{ width: 24, height: 24, borderRadius: 6 }}
    title={title}
    onClick={onClick}
  >
    {children}
  </button>
);

const CopyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="11" height="11" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const QrIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <rect x="3" y="3" width="6" height="6" rx="1" />
    <rect x="15" y="3" width="6" height="6" rx="1" />
    <rect x="3" y="15" width="6" height="6" rx="1" />
    <rect x="15" y="15" width="2" height="2" />
    <rect x="19" y="15" width="2" height="2" />
    <rect x="15" y="19" width="2" height="2" />
    <rect x="19" y="19" width="2" height="2" />
  </svg>
);

// ---- loading shimmer ----
const LoadingStyles = () => (
  <style>{`
    @keyframes kinkoShimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    .kinko-loading-cell {
      position: relative;
      overflow: hidden;
      height: 56px;
      background: linear-gradient(
        90deg,
        rgba(255,255,255,0.04) 0%,
        rgba(255,255,255,0.08) 25%,
        rgba(255,255,255,0.14) 50%,
        rgba(255,255,255,0.08) 75%,
        rgba(255,255,255,0.04) 100%
      );
      background-size: 200% 100%;
      animation: kinkoShimmer 5s linear infinite;
      border-radius: 6px;
    }
    .kinko-loading-label {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.95rem;
      color: rgba(255,255,255,0.7);
      text-shadow: 0 1px 0 rgba(0,0,0,0.35);
    }
  `}</style>
);

/* ---- chip styles (high-specificity so Bootstrap can't override) ---- */
const ChipStyles = () => (
  <style>{`
    .k-chip, .k-chip.k-chip-ghost { 
      display:inline-flex; align-items:center; justify-content:center;
      padding:.5rem .8rem; line-height:1; font-size:.85rem;
      border-radius:9999px; border:1px solid transparent;
      user-select:none; cursor:pointer;
      transition:background-color .15s ease, border-color .15s ease, color .15s ease, box-shadow .15s ease;
      text-decoration:none;
    }
    .k-chip.k-chip-ghost {
      background: transparent !important;
      border-color: rgba(255,255,255,.18) !important;
      color: rgba(255,255,255,.85) !important;
      box-shadow: inset 0 -1px 0 rgba(255,255,255,.04);
    }
    .k-chip.k-chip-ghost:hover  { background: rgba(255,255,255,.06) !important; border-color: rgba(255,255,255,.28) !important; }
    .k-chip.k-chip-ghost:active { background: rgba(255,255,255,.12) !important; }
    html[data-theme="light"] .k-chip.k-chip-ghost {
      border-color: rgba(0,0,0,.15) !important;
      color: rgba(0,0,0,.8) !important;
    }
    html[data-theme="light"] .k-chip.k-chip-ghost:hover  { background: rgba(0,0,0,.06) !important; border-color: rgba(0,0,0,.25) !important; }
    html[data-theme="light"] .k-chip.k-chip-ghost:active { background: rgba(0,0,0,.10) !important; }
  `}</style>
);

/* ---- compact token cell styles ---- */
const TokenCellStyles = () => (
  <style>{`
    .kw-cell { display:flex; align-items:center; gap:10px; min-width:0; }
    .kw-logo { flex:0 0 28px; }
    .kw-name { min-width:0; }
    .kw-symbol { white-space:nowrap; font-weight:700; color: var(--bs-body-color); }
    .kw-name-inline { font-size:12px; color: var(--bs-secondary-color); }
    .kw-sub { margin-top:2px; font-size:12px; color: var(--bs-secondary-color); }

    /* Dark theme readability */
    [data-pc-theme='dark'] .kw-name-inline { color: rgba(255,255,255,.72); }
    [data-pc-theme='dark'] .kw-sub         { color: rgba(255,255,255,.60); }

    /* Optional: if your theme also sets html[data-theme='dark'] */
    html[data-theme='dark'] .kw-name-inline { color: rgba(255,255,255,.72); }
    html[data-theme='dark'] .kw-sub         { color: rgba(255,255,255,.60); }
  `}</style>
);

const LoadingRow = ({ label = 'Loading…', colSpan = 5 }) => (
  <tr>
    <td colSpan={colSpan} className="px-3 py-3">
      <div className="kinko-loading-cell">
        <div className="kinko-loading-label">{label}</div>
      </div>
    </td>
  </tr>
);

// ==============================  PAGE  ==============================
export default function WalletDetail() {
  const { address = '' } = useParams();
  const walletName = useMemo(() => resolveWalletName(address), [address]);

  useEffect(() => { setLastSection('wallets'); }, []);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [native, setNative] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [q, setQ] = useState('');
  const [sortKey, setSortKey] = useState('value');
  const [sortDir, setSortDir] = useState('desc');
  const [showQR, setShowQR] = useState(false);
  const [refreshBump, setRefreshBump] = useState(0); // manual refresh trigger

  // Sticky chip logic
  const groupId = useMemo(() => resolveGroupId(address), [address]);
  const initialChip = useMemo(() => {
    const last = getLastSection();
    const saved = getWalletNetChip(groupId);
    return (last === 'wallets' && saved) ? saved : 'all';
  }, [groupId]);
  const [activeChain, setActiveChain] = useState(initialChip);
  useEffect(() => { setActiveChain(initialChip); }, [address, groupId, initialChip]);

  // Default to "All" when switching wallets
  const prevAddrRef = useRef('');
  useEffect(() => {
    if (!prevAddrRef.current) { prevAddrRef.current = address; return; }
    if (prevAddrRef.current !== address) {
      setActiveChain('all');
      try {
        const gid = resolveGroupId(address);
        setWalletNetChip(gid, 'all');
      } catch { }
      prevAddrRef.current = address;
    }
  }, [address]);

  const onChipChange = (code) => { setActiveChain(code); setWalletNetChip(groupId, code); };

  // Normalise any token for cache format
  const mapTokenForCache = (t, chainHint) => {
    const priceUsd = Number(t.priceUsd ?? t.price ?? 0);
    const amount = Number(t.amount ?? 0);
    const valueUsd = Number(t.valueUsd ?? t.value ?? amount * priceUsd);
    return {
      symbol: (t.symbol || t.ticker || (t.name || 'TOKEN')).toUpperCase(),
      name: t.name || t.symbol || 'Token',
      amount, priceUsd, valueUsd,
      contract: t.contract || t.address || null,
      logo: t.logo || t.iconUrl || null,
      chain: t.chain ?? chainHint
    };
  };

  // ---- adapt Pulse -> UI (ensure priceUsd/valueUsd) ----
  const adaptPulseTokens = (rows) => {
    const list = Array.isArray(rows) ? rows.slice() : [];
    const plsIdx = list.findIndex(
      (r) => r.address === 'PLS' || r.symbol === 'PLS' || r.address === 'native'
    );
    const pls = plsIdx >= 0 ? list.splice(plsIdx, 1)[0] : null;

    const nat = pls
      ? {
        name: 'PulseChain',
        symbol: 'PLS',
        amount: Number(pls.balance || 0),
        price: Number(pls.price || 0),
        priceUsd: Number(pls.price || 0),
        value: Number(pls.value || 0),
        valueUsd: Number(pls.value || 0),
        contract: 'native',
        logo: pls.iconUrl || null,
        chain: 'pulse'
      }
      : null;

    const toks = list.map((r) => {
      const price = Number(r.price || r.priceUsd || 0);
      const amount = Number(r.balance || r.amount || 0);
      const value = Number(r.value || r.valueUsd || amount * price);
      return {
        name: r.name || r.symbol || 'Token',
        symbol: r.symbol || '',
        amount,
        price,
        priceUsd: price,
        value,
        valueUsd: value,
        contract: r.address || null,
        logo: r.iconUrl || null,
        chain: 'pulse'
      };
    });

    const totalUSD = (nat ? nat.valueUsd : 0) + toks.reduce((s, t) => s + (t.valueUsd || 0), 0);
    return { native: nat, tokens: toks, totalUSD };
  };

  // ---- adapt ETH list (ethereumService -> UI) ----
  const adaptEthFromList = (rows) => {
    const list = Array.isArray(rows)
      ? rows.slice()
      : Array.isArray(rows?.tokens)
        ? rows.tokens.slice()
        : [];

    const natIdx = list.findIndex((r) => (r.symbol === 'ETH') || (r.address === 'native'));
    const natRow = natIdx >= 0 ? list.splice(natIdx, 1)[0] : null;

    const nat = natRow ? {
      name: 'Ethereum',
      symbol: 'ETH',
      amount: Number(natRow.balance || 0),
      // price may be set as price or priceUSD in the service
      price: Number(natRow.price || natRow.priceUsd || 0),
      priceUsd: Number(natRow.price || natRow.priceUsd || 0),
      // value in service is stored as `usd`; fall back to amount * price when absent
      value: (function(){
        const p = Number(natRow.price || natRow.priceUsd || 0);
        const a = Number(natRow.balance || 0);
        const v = Number(natRow.value || natRow.valueUsd || natRow.usd || 0);
        return v > 0 ? v : (a * p);
      })(),
      valueUsd: (function(){
        const p = Number(natRow.price || natRow.priceUsd || 0);
        const a = Number(natRow.balance || 0);
        const v = Number(natRow.value || natRow.valueUsd || natRow.usd || 0);
        return v > 0 ? v : (a * p);
      })(),
      contract: 'native',
      logo: natRow.iconUrl || null,
      chain: 'eth'
    } : null;

    const toks = list.map((r) => {
      const price = Number(r.price || r.priceUsd || 0);
      const amount = Number(r.balance || r.amount || 0);
      const value = Number(r.value || r.valueUsd || amount * price);
      return {
        name: r.name || r.symbol || 'Token',
        symbol: r.symbol || '',
        amount,
        price,
        priceUsd: price,
        value,
        valueUsd: value,
        contract: r.address || null,
        logo: r.iconUrl || null,
        chain: 'eth'
      };
    });

    const totalUSD = (nat ? nat.valueUsd : 0) + toks.reduce((s, t) => s + (t.valueUsd || 0), 0);
    return { native: nat, tokens: toks, totalUSD };
  };

  // Fetch one chain and tag rows with chain
  async function fetchOneChain(chainCode) {
    if (chainCode === 'pulse') {
      const rows = await fetchPulsechainTokens(address);
      return adaptPulseTokens(rows);
    }
    if (chainCode === 'eth') {
      // Use the same aggregator path as /portfolio for parity
      const { totalUsd, tokens } = await buildPortfolioDetailed([{ address }], { only: 'eth' });
      const list = Array.isArray(tokens) ? tokens.slice() : [];
      const natIdx = list.findIndex((t) => t.address === 'native');
      const natRow = natIdx >= 0 ? list.splice(natIdx, 1)[0] : null;

      const nat = natRow ? {
        name: 'Ethereum',
        symbol: 'ETH',
        amount: Number(natRow.amount || 0),
        price: Number(natRow.priceUsd ?? natRow.price ?? 0),
        priceUsd: Number(natRow.priceUsd ?? natRow.price ?? 0),
        value: Number(natRow.valueUsd ?? natRow.value ?? 0),
        valueUsd: Number(natRow.valueUsd ?? natRow.value ?? 0),
        contract: 'native',
        logo: natRow.logo || null,
        chain: 'eth'
      } : null;

      const toks = list.map((r) => {
        const price = Number(r.priceUsd ?? r.price ?? 0);
        const amount = Number(r.amount ?? 0);
        const value = Number(r.valueUsd ?? r.value ?? amount * price);
        return {
          name: r.name || r.symbol || 'Token',
          symbol: r.symbol || '',
          amount,
          price,
          priceUsd: price,
          value,
          valueUsd: value,
          contract: r.address || null,
          logo: r.logo || null,
          chain: 'eth'
        };
      });

      return { native: nat, tokens: toks, totalUSD: Number(totalUsd || (nat?.valueUsd || 0) + toks.reduce((s, t) => s + (t.valueUsd || 0), 0)) };
    }
    // base via Moralis (balances + prices)
    const res = await getPortfolioWithPrices(address, chainCode);
    const nat = res?.native
      ? {
        ...res.native,
        chain: chainCode,
        priceUsd: Number(res?.native?.priceUsd ?? res?.native?.price ?? 0),
        valueUsd: Number(res?.native?.valueUsd ?? res?.native?.value ?? 0)
      }
      : null;

    const toks = Array.isArray(res?.tokens)
      ? res.tokens.map((t) => {
        const price = Number(t.priceUsd ?? t.price ?? 0);
        const amt = Number(t.amount ?? 0);
        const val = Number(t.valueUsd ?? t.value ?? amt * price);
        return { ...t, chain: chainCode, priceUsd: price, valueUsd: val };
      })
      : [];

    const totalUSD = Number(res?.totalUSD || (nat?.valueUsd || 0) + toks.reduce((s, t) => s + (t.valueUsd || 0), 0));
    return { native: nat, tokens: toks, totalUSD };
  }

  // --------- caching helpers ----------
  const CHAINS_FOR_ALL = ['eth', 'base', 'pulse'];
  // bump cache version to avoid stale entries from older ETH path
  const CACHE_VER = 'v2';
  const cacheKey = (chain) => `${address}:${chain}:${CACHE_VER}`;

  function tryHydrateFromCache(chain) {
    if (!address) return { hadCache: false, anyStale: false };
    if (chain === 'all') {
      let mergedTokens = [];
      let totalUsd = 0;
      let had = false;
      let stale = false;
      CHAINS_FOR_ALL.forEach((c) => {
        const snap = getWalletCache(cacheKey(c), { maxAge: WALLET_CACHE_DEFAULT_TTL });
        if (snap && Array.isArray(snap.tokens)) {
          had = true;
          stale = stale || !!snap.stale;
          const cleaned = (snap.tokens || []).filter((t) => !isTokenBlacklisted({ address: t.contract, symbol: t.symbol, name: t.name }));
          mergedTokens = mergedTokens.concat(cleaned.map((t) => ({ ...t, chain: t.chain || c })));
          totalUsd += Number(snap.totalUsd || 0);
        }
      });
      // Provider-level cache fallback (ETH + Pulse) for instant hydrate
      if (!had) {
        try {
          const ethC = getCachedJSON(`eth:tokens:${address.toLowerCase()}`, 10 * 60 * 1000);
          const plsC = getCachedJSON(`pls:tokens:${address.toLowerCase()}`, 10 * 60 * 1000);
          const add = [];
          const pushList = (arr, chainCode) => {
            if (!Array.isArray(arr)) return;
            arr.forEach((t) => {
              const mapped = mapTokenForCache({
                symbol: t.symbol, name: t.name, amount: t.amount ?? t.balance,
                priceUsd: t.priceUsd ?? t.price, valueUsd: t.valueUsd ?? t.value,
                contract: t.contract || t.address, logo: t.logo || t.iconUrl
              }, chainCode);
              if (!isTokenBlacklisted({ address: mapped.contract, symbol: mapped.symbol, name: mapped.name })) add.push({ ...mapped, chain: chainCode });
            });
          };
          pushList(Array.isArray(ethC) ? ethC : ethC?.tokens, 'eth');
          pushList(Array.isArray(plsC) ? plsC : plsC?.tokens, 'pulse');
          if (add.length) {
            mergedTokens = mergedTokens.concat(add);
            totalUsd += add.reduce((s, t) => s + (t.valueUsd || 0), 0);
            had = true; stale = true;
          }
        } catch { }
      }
      if (had) {
        setNative(null);
        setTokens(mergedTokens);
        document.title = `Kinko Wallet - ${walletName} - ${fmtUSD(totalUsd)}`;
        setLoading(false);
      }
      return { hadCache: had, anyStale: stale };
    }

    const snap = getWalletCache(cacheKey(chain), { maxAge: WALLET_CACHE_DEFAULT_TTL });
    if (snap && Array.isArray(snap.tokens)) {
      const cleaned = (snap.tokens || []).filter((t) => !isTokenBlacklisted({ address: t.contract, symbol: t.symbol, name: t.name }));
      setNative(null);
      setTokens(cleaned.map((t) => ({ ...t, chain: t.chain || chain })));
      document.title = `Kinko Wallet - ${walletName} - ${fmtUSD(Number(snap.totalUsd || 0))}`;
      setLoading(false);
      // if ETH cache looks suspiciously small, force a refresh in background
      const suspectSmallEth = (chain === 'eth' && cleaned.length <= 2);
      return { hadCache: true, anyStale: (!!snap.stale) || suspectSmallEth };
    }
    // Provider-level single-chain fallback
    try {
      if (chain === 'eth') {
        const ethC = getCachedJSON(`eth:tokens:${address.toLowerCase()}`, 10 * 60 * 1000);
        const arr = Array.isArray(ethC) ? ethC : ethC?.tokens;
        if (Array.isArray(arr) && arr.length) {
          const mapped = arr.map((t) => mapTokenForCache({
            symbol: t.symbol, name: t.name, amount: t.amount ?? t.balance,
            priceUsd: t.priceUsd ?? t.price, valueUsd: t.valueUsd ?? t.value,
            contract: t.contract || t.address, logo: t.logo || t.iconUrl
          }, 'eth')).filter((t) => !isTokenBlacklisted({ address: t.contract, symbol: t.symbol, name: t.name }));
          setNative(null); setTokens(mapped); setLoading(false);
          return { hadCache: true, anyStale: true };
        }
      }
      if (chain === 'pulse') {
        const plsC = getCachedJSON(`pls:tokens:${address.toLowerCase()}`, 10 * 60 * 1000);
        const arr = Array.isArray(plsC) ? plsC : plsC?.tokens;
        if (Array.isArray(arr) && arr.length) {
          const mapped = arr.map((t) => mapTokenForCache({
            symbol: t.symbol, name: t.name, amount: t.amount ?? t.balance,
            priceUsd: t.priceUsd ?? t.price, valueUsd: t.valueUsd ?? t.value,
            contract: t.contract || t.address, logo: t.logo || t.iconUrl
          }, 'pulse')).filter((t) => !isTokenBlacklisted({ address: t.contract, symbol: t.symbol, name: t.name }));
          setNative(null); setTokens(mapped); setLoading(false);
          return { hadCache: true, anyStale: true };
        }
      }
    } catch { }
    return { hadCache: false, anyStale: false };
  }

  function writeCache(chain, result) {
    const { tokens: tok, native: nat } = result || { tokens: [], native: null };
    const cachedTokensRaw = [
      ...(nat ? [mapTokenForCache({ ...nat, name: nat.name || nat.symbol || 'Native' }, chain)] : []),
      ...(Array.isArray(tok) ? tok.map((t) => mapTokenForCache(t, chain)) : []),
    ];
    const cachedTokens = cachedTokensRaw.filter((t) => !isTokenBlacklisted({ address: t.contract, symbol: t.symbol, name: t.name }));
    const cachedTotal = Number.isFinite(result?.totalUSD)
      ? Number(result.totalUSD)
      : cachedTokens.reduce((s, t) => s + (t.valueUsd || 0), 0);

    setWalletCache(cacheKey(chain), {
      chain,
      tokens: cachedTokens,
      totalUsd: cachedTotal
    });
  }

  // fetch -> set state -> cache (but show cache first if we have it)
  useEffect(() => {
    let dead = false;

    async function load() {
      setErr('');
      setLoading(true);

      const { hadCache, anyStale } = tryHydrateFromCache(activeChain);

      try {
        if (!hadCache || anyStale) {
          let result;
          if (activeChain === 'all') {
            const parts = await Promise.allSettled(CHAINS_FOR_ALL.map(fetchOneChain));
            const ok = parts
              .map((p, i) => (p.status === 'fulfilled' ? { ...p.value, _c: CHAINS_FOR_ALL[i] } : null))
              .filter(Boolean);

            ok.forEach((r) => writeCache(r._c, r));

            const natRows = ok.map((r) => r.native).filter(Boolean);
            const tokRows = ok.flatMap((r) => r.tokens || []);
            const cleaned = tokRows.filter((t) => !isTokenBlacklisted({ address: t.contract || t.address, symbol: t.symbol, name: t.name }));
            const totalUSD = ok.reduce((s, r) => s + (Number(r.totalUSD) || 0), 0);
            result = { native: null, tokens: [...natRows, ...cleaned], totalUSD };
          } else {
            result = await fetchOneChain(activeChain);
            // apply blacklist before caching & showing
            const cleanedTok = (result.tokens || []).filter((t) => !isTokenBlacklisted({ address: t.contract || t.address, symbol: t.symbol, name: t.name }));
            result = { ...result, tokens: cleanedTok };
            writeCache(activeChain, result);
          }

          if (!dead) {
            const { tokens: tok, native: nat, totalUSD } = result || { tokens: [], native: null, totalUSD: 0 };
            setNative(nat ? { ...nat } : null);
            setTokens(Array.isArray(tok) ? tok : []);
            document.title = `Kinko Wallet - ${walletName} - ${fmtUSD(totalUSD)}`;
          }
        }
      } catch (e) {
        if (!dead) setErr(e.message || `Failed to load ${activeChain.toUpperCase()} data`);
      } finally {
        if (!dead) setLoading(false);
      }
    }

    if (address) load();
    return () => { dead = true; };
  }, [address, walletName, activeChain, refreshBump]);

  // ----------------------------- table data & sorting -----------------------------
  const items = useMemo(() => {
    const base = native ? [native, ...tokens] : tokens.slice();
    const s = (q || '').trim().toLowerCase();
    const filtered = s
      ? base.filter(
        (t) =>
          (t.name || '').toLowerCase().includes(s) ||
          (t.symbol || '').toLowerCase().includes(s) ||
          (t.contract || '').toLowerCase().includes(s)
      )
      : base;

    const cmp = (a, b) => {
      const va =
        sortKey === 'name'
          ? (a.name || a.symbol || '').toLowerCase()
          : sortKey === 'price'
            ? (a.price ?? a.priceUsd ?? 0)
            : sortKey === 'amount'
              ? (a.amount ?? 0)
              : (a.value ?? a.valueUsd ?? 0);
      const vb =
        sortKey === 'name'
          ? (b.name || b.symbol || '').toLowerCase()
          : sortKey === 'price'
            ? (b.price ?? b.priceUsd ?? 0)
            : sortKey === 'amount'
              ? (b.amount ?? 0)
              : (b.value ?? b.valueUsd ?? 0);
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    };
    return filtered.sort(cmp);
  }, [native, tokens, q, sortKey, sortDir]);

  const totalUSD = useMemo(
    () => items.reduce((s, t) => s + (t.value ?? t.valueUsd ?? 0), 0),
    [items]
  );

  const onSort = (k) => {
    setSortKey((prev) => {
      if (prev !== k) { setSortDir('desc'); return k; }
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
      return k;
    });
  };

  const copy = (txt) => navigator.clipboard?.writeText(txt).catch(() => { });

  const chainName = (c) => (c === 'pulse' ? 'Pulse' : c === 'base' ? 'Base' : 'ETH');

  // Manual refresh: clear caches for this wallet and refetch
  const onRefresh = () => {
    if (!address) return;
    if (activeChain === 'all') {
      clearWalletPrefix(address);
    } else {
      clearWalletCache(`${address}:${activeChain}`);
    }
    setRefreshBump((n) => n + 1);
  };

  // ----------------------------- render -----------------------------
  return (
    <>
      <LoadingStyles /> {/* inject shimmer CSS */}
      <ChipStyles />    {/* chip styles */}
      <TokenCellStyles /> {/* token cell styles */}

      {/* HEADER */}
      <Row className="mb-4">
        <Col>
          <Card className="shadow-sm border-0">
            <Card.Body>
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-3">
                <div>
                  <div className="text-muted" style={{ fontSize: 18, fontWeight: 600 }}>
                    {walletName}
                  </div>

                  {/* Grand USD total – unified typography */}
                  <h2 className="mb-1 kw-grand-total">{fmtUSD(totalUSD)}</h2>

                  <div className="d-inline-flex align-items-center gap-2" style={{ fontSize: 12 }}>
                    <span style={addrStyle}>{short(address)}</span>
                    <IconButton title="Copy address" onClick={() => copy(address)}>
                      <CopyIcon />
                    </IconButton>
                    <IconButton title="Show QR" onClick={() => setShowQR(true)}>
                      <QrIcon />
                    </IconButton>
                  </div>
                </div>

                {/* Chain selector — consistent across app */}
                <ChainSelector value={activeChain} onChange={onChipChange} />
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
          {/* Use span to avoid button defaults, match View All pill */}
          <span
            role="button"
            tabIndex={0}
            className="k-chip k-chip-ghost"
            onClick={onRefresh}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onRefresh()}
            title="Refresh"
          >
            Refresh
          </span>
        </Col>
      </Row>

      {/* TABLE */}
      <Row className="mb-2">
        <Col>
          <small className="text-muted">
            {activeChain === 'all'
              ? 'All chains — ERC-20 & PRC-20 tokens'
              : activeChain === 'pulse'
                ? 'PulseChain — PRC-20 tokens'
                : `${activeChain === 'base' ? 'Base' : 'Ethereum'} — ERC-20 tokens`}
          </small>
        </Col>
      </Row>

      <Row>
        <Col>
          <Card className="shadow-sm">
            <Card.Body className="p-0">
              <div className="table-responsive">
                <table className="table table-hover mb-0 align-middle">
                  <thead className="sticky-top" style={{ position: 'sticky', top: 0 }}>
                    <tr>
                      <th style={{ width: '38%' }}>
                        <button
                          className="btn btn-link p-0 text-decoration-none text-reset"
                          onClick={() => onSort('name')}
                        >
                          Token {sortKey === 'name' && (sortDir === 'asc' ? '▲' : '▼')}
                        </button>
                      </th>
                      <th className="text-end" style={{ width: '18%' }}>
                        <button
                          className="btn btn-link p-0 text-decoration-none text-reset"
                          onClick={() => onSort('price')}
                        >
                          Price {sortKey === 'price' && (sortDir === 'asc' ? '▲' : '▼')}
                        </button>
                      </th>
                      <th className="text-end" style={{ width: '18%' }}>
                        <button
                          className="btn btn-link p-0 text-decoration-none text-reset"
                          onClick={() => onSort('amount')}
                        >
                          Amount {sortKey === 'amount' && (sortDir === 'asc' ? '▲' : '▼')}
                        </button>
                      </th>
                      <th className="text-end" style={{ width: '18%' }}>
                        <button
                          className="btn btn-link p-0 text-decoration-none text-reset"
                          onClick={() => onSort('value')}
                        >
                          Value {sortKey === 'value' && (sortDir === 'asc' ? '▲' : '▼')}
                        </button>
                      </th>
                      <th style={{ width: '8%' }}>CONTRACT</th>
                    </tr>
                  </thead>

                  <tbody>
                    {loading && <LoadingRow label={`Loading ${activeChain === 'pulse' ? 'PRC-20' : activeChain === 'all' ? 'ERC-20 & PRC-20' : 'ERC-20'}…`} colSpan={5} />}
                    {!loading && err && <tr><td colSpan={5} className="text-danger py-4 text-center">{err}</td></tr>}
                    {!loading && !err && items.length === 0 && (
                      <tr><td colSpan={5} className="py-4 text-center">No tokens found.</td></tr>
                    )}

                    {!loading && !err && items.map((t, i) => {
                      const price = (t.price ?? t.priceUsd ?? 0);
                      const amount = (t.amount ?? 0);
                      const value = (t.value ?? t.valueUsd ?? (amount * price));
                      const c = (t.chain || activeChain);

                      // For TokenLogo, pass null for natives so it uses the chain proxy (WETH/WPLS)
                      const addrForLogo = (t.contract && t.contract !== 'native') ? t.contract : null;

                      return (
                        <tr key={`${t.contract || t.symbol || 'row'}-${i}`}>
                          <td>
                            <div className="kw-cell">
                              <TokenLogo
                                chainId={chainIdOf(c)}
                                address={addrForLogo}
                                symbol={t.symbol}
                                logoURI={t.logo}
                                size={28}                 // set to 36 if you want it larger
                                className="kw-logo"
                              />
                              <div className="kw-name">
                                <div className="kw-symbol">
                                  <strong>{t.symbol || '—'}</strong>
                                  <span className="kw-name-inline">
                                    {' - '}{t.name || short(t.contract)}
                                  </span>
                                </div>
                                <div className="kw-sub">
                                  {activeChain === 'all' && <ChainChip chain={c} style={{ marginLeft: 0 }} />}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="text-end">{fmtPriceUSD(price)}</td>
                          <td className="text-end">{fmtNum(amount)}</td>
                          <td className="text-end"><strong>{fmtUSD(value)}</strong></td>
                          <td>
                            <span
                              className="badge bg-secondary"
                              style={{ cursor: t.contract ? 'pointer' : 'default' }}
                              title={t.contract ? 'Copy contract' : undefined}
                              onClick={() => t.contract && navigator.clipboard?.writeText(t.contract)}
                            >
                              {t.contract ? short(t.contract) : 'native'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* QR MODAL */}
      <Modal show={showQR} onHide={() => setShowQR(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Wallet QR</Modal.Title>
        </Modal.Header>
        <Modal.Body className="text-center">
          <img
            alt="QR"
            width={240}
            height={240}
            style={{ imageRendering: 'pixelated' }}
            src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(address)}`}
          />
          <div className="mt-3" style={{ wordBreak: 'break-all', fontFamily: 'monospace' }}>{address}</div>
          <Button className="mt-3" onClick={() => { navigator.clipboard?.writeText(address); setShowQR(false); }}>
            Copy Address
          </Button>
        </Modal.Body>
      </Modal>
    </>
  );
}
