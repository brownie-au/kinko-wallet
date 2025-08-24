/* src/views/kw-staking/kw-eHexStaking.jsx */
import { useEffect, useMemo, useState } from 'react';
import { Row, Col, Card, Badge, Table, Alert, Placeholder } from 'react-bootstrap';
import { useWallets } from '../../contexts/WalletContext';
import { loadWallets } from '../../utils/walletStorage';

/* === eHEX (Ethereum) staking data === */
import {
    readEhexStakesCache,
    refreshEhexStakesAndCache
} from '../../services/kw-ehexStakingService';

import { usePortfolioValue, HEX_STAKING_SOURCE } from '../../contexts/PortfolioValueContext.jsx';

/* match the HEX page import style */
import KwHexStakingHeaderContainer from '../../components/kw-HexStakingHeaderContainer.jsx';
import '../../styles/kw-hex-staking-header.css';

/* ---------- Formatters ---------- */
const nf0 = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = (x) => nf0.format(Number(x) || 0);
const fmt2 = (x) => nf2.format(Number(x) || 0);

/* -------------------------------------------------------------------------- */
/* HDS (ETH) – current day + payout-per-Tshare (drives Yield/APY)             */
/* -------------------------------------------------------------------------- */
const HDS_ETH_URL = 'https://hexdailystats.com/fulldata';
const HDS_LS_KEY = 'kw:hds:eth:full:v1';
const HDS_TTL_MS = 6 * 60 * 60 * 1000;
const SHARES_PER_TSHARE = 1e12;
const HEARTS_PER_HEX = 1e8;

/* hard‑lock this page to ETH */
const PAGE_CHAIN = 'ethereum';
const PAGE_KEY = 'ehex'; // used to keep this page's "All" structurally distinct

/* --- Service-call wrappers (tolerate multiple signatures) --- */
async function readCacheEthSafe(wallets) {
    try { return await readEhexStakesCache({ chain: PAGE_CHAIN, wallets }); } catch { }
    try { return await readEhexStakesCache(wallets, { chain: PAGE_CHAIN }); } catch { }
    try { return await readEhexStakesCache(wallets); } catch { }
    try { return await readEhexStakesCache(); } catch { }
    return null;
}
async function refreshEthSafe(wallets, onProgress) {
    try { return await refreshEhexStakesAndCache({ chain: PAGE_CHAIN, wallets, onProgress }); } catch { }
    try { return await refreshEhexStakesAndCache(wallets, { chain: PAGE_CHAIN, onProgress }); } catch { }
    try { return await refreshEhexStakesAndCache(wallets, onProgress); } catch { }
    return await refreshEhexStakesAndCache(wallets);
}

/* ---------------- HDS fetch/cache (ETH) ---------------- */
const hdsMem = { data: null, ts: 0 };
function readHdsLS() { try { return JSON.parse(localStorage.getItem(HDS_LS_KEY) || 'null'); } catch { return null; } }
function writeHdsLS(obj) { try { localStorage.setItem(HDS_LS_KEY, JSON.stringify(obj)); } catch { } }
async function fetchHdsEth({ force = false } = {}) {
    const now = Date.now();
    if (!force && hdsMem.data && now - (hdsMem.ts || 0) < HDS_TTL_MS) return hdsMem.data;
    const fromLS = readHdsLS();
    if (!force && fromLS?.data && now - (fromLS.ts || 0) < HDS_TTL_MS) { hdsMem.data = fromLS.data; hdsMem.ts = fromLS.ts; return hdsMem.data; }
    const res = await fetch(HDS_ETH_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HEXDailyStats (ETH) fetch failed: ${res.status}`);
    const data = await res.json(); hdsMem.data = data; hdsMem.ts = now; writeHdsLS({ data, ts: now }); return data;
}
function extractPpsAndDay(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return { pps: [], currentDay: 0 };
    const pps = []; let lastDay = 0;
    for (const r of rows) {
        const d = Number(r.day ?? r.dayNumber ?? r.currentDay ?? NaN);
        const raw = r.payoutPerTshareHEX ?? r.payoutPerTshare ?? r.payout_per_tshare_hex;
        const v = typeof raw === 'number' ? raw : Number(raw ?? 0) || 0;
        if (Number.isFinite(d) && d >= 0) { pps[d] = v; if (d > lastDay) lastDay = d; }
    }
    for (let i = 0; i <= lastDay; i++) if (typeof pps[i] !== 'number') pps[i] = 0;
    const currentDay = lastDay || rows.length;
    return { pps, currentDay };
}
function extractHexPriceUsd(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const last = rows[rows.length - 1] || {};
    const raw = last.priceUSD ?? last.priceUsd ?? last.price_usd ?? last.price ?? last['Price (USD)'] ?? null;
    if (raw == null) return null;
    if (typeof raw === 'number') return raw;
    const num = parseFloat(String(raw).replace(/[^0-9.]/g, ''));
    return Number.isFinite(num) ? num : null;
}

/* ---------------- Yield/APY helpers ---------------- */
function calcUnlockDay(lockedDay, stakedDays) { const ld = Number(lockedDay) || 0; const sd = Number(stakedDays) || 0; if (!ld || !sd) return 0; return ld + sd; }
function computeStakeYieldHex(stake, uiDayCounter, pps) {
    if (!stake || !Array.isArray(pps) || pps.length === 0) return 0;
    const locked = Number(stake.lockedDay || 0);
    const stakedDays = Number(stake.stakedDays || 0);
    const maturity = locked + stakedDays;
    const today = Number(uiDayCounter) || 0;
    const until = Math.min(maturity, today);
    if (until <= locked) return 0;
    let sumPps = 0;
    for (let d = locked; d < until && d < pps.length; d++) sumPps += pps[d] || 0;
    const tShares = Number(stake.tShares || 0);
    const interestHEX = tShares * sumPps;
    return Number.isFinite(interestHEX) ? interestHEX : 0;
}
function computeYieldHexWithUntil(stake, pps, untilDay) {
    if (!stake || !Array.isArray(pps) || pps.length === 0) return 0;
    const locked = Number(stake.lockedDay || 0);
    const stakedDays = Number(stake.stakedDays || 0);
    const cap = locked + stakedDays;
    const until = Math.max(locked, Math.min(Number(untilDay) || 0, cap));
    if (until <= locked) return 0;
    let sumPps = 0;
    for (let d = locked; d < until && d < pps.length; d++) sumPps += pps[d] || 0;
    return (Number(stake.tShares) || 0) * sumPps;
}
function computeApyPct(stake, yieldHex, uiDayCounter) {
    const principalHEX = Number(stake.principalHex || 0);
    const locked = Number(stake.lockedDay || 0);
    const stakedDays = Number(stake.stakedDays || 0);
    const maturity = locked + stakedDays;
    const today = Number(uiDayCounter) || 0;
    const until = Math.min(maturity, today);
    const served = Math.max(0, until - locked);
    if (!principalHEX || !served) return 0;
    const y = yieldHex / principalHEX;
    const apy = Math.pow(1 + y, 365 / served) - 1;
    const pct = apy * 100;
    return Number.isFinite(pct) ? pct : 0;
}
function getStakeStatus({ lockedDay, stakedDays, unlockedDay, currentDay }) {
    if ((Number(unlockedDay) || 0) > 0) return 'Ended';
    const unlockDay = calcUnlockDay(lockedDay, stakedDays);
    const today = Number(currentDay) || 0;
    if (!today || !unlockDay) return 'Active';
    if (today < unlockDay) return 'Active';
    if (today <= unlockDay + 14) return 'Ready';
    return 'Overdue';
}
const statusSortWeight = { Active: 3, Ready: 2, Overdue: 1, Ended: 0 };

/* ---------------- Price caches (EHEX on Ethereum) ---------------- */
const CHAIN_ID_MAP = { pulse: 'pulsechain', pulsechain: 'pulsechain', pls: 'pulsechain', ethereum: 'ethereum', eth: 'ethereum' };
const up = (s) => String(s || '').toUpperCase();
const low = (s) => String(s || '').toLowerCase();
function readUnifiedTokenPriceUsd(symbol = 'EHEX') {
    const symU = up(symbol), symL = low(symbol);
    try {
        const lastKey = `kw:last${symU}PriceUsd`;
        const k1 = localStorage.getItem(lastKey);
        if (k1) { const v = Number(k1); if (v > 0) return v; }
        for (const key of ['kw:dexscreener:prices:v1', 'kw:dex:prices:v1', 'kw:tokenPrices:v1', 'kw:prices:bySymbol', 'kw:prices:spot:v1']) {
            const raw = localStorage.getItem(key); if (!raw) continue;
            const obj = JSON.parse(raw);
            const direct =
                obj?.[symU] ?? obj?.[symL] ??
                (Array.isArray(obj?.tokens) ? Number(obj.tokens.find(t => up(t?.symbol) === symU)?.priceUsd) : undefined);
            const val = Number(direct); if (val > 0) return val;
        }
    } catch { }
    return 0;
}
function writeUnifiedTokenPriceUsd(priceUsd, symbol = 'EHEX') {
    if (!Number.isFinite(priceUsd) || priceUsd <= 0) return;
    const symU = up(symbol);
    try {
        localStorage.setItem(`kw:last${symU}PriceUsd`, String(priceUsd));
        const k = 'kw:dexscreener:prices:v1';
        const map = (() => { try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch { return {}; } })();
        map[symU] = priceUsd; localStorage.setItem(k, JSON.stringify(map));
    } catch { }
}
function makePriceLSKey(symbol = 'EHEX', chain = 'ethereum') { return `kw:price:${low(symbol)}:${low(chain)}:v1`; }
function readPriceCacheDyn(symbol = 'EHEX', chain = 'ethereum') {
    try { const obj = JSON.parse(localStorage.getItem(makePriceLSKey(symbol, chain)) || 'null'); if (obj) return obj; } catch { }
    return null;
}
function writePriceCacheDyn(symbol, chain, obj) { try { localStorage.setItem(makePriceLSKey(symbol, chain), JSON.stringify(obj)); } catch { } }
async function fetchDexscreenerUsdByToken(tokenAddress, chainKey) {
    const addr = String(tokenAddress || '').trim();
    if (!addr) throw new Error('Missing token address');
    const url = `https://api.dexscreener.com/latest/dex/tokens/${addr}`;
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) throw new Error(`DexScreener error ${res.status}`);
    const data = await res.json();
    const pairs = Array.isArray(data?.pairs) ? data.pairs : [];
    const chainIdStr = CHAIN_ID_MAP[low(chainKey)] || 'ethereum';
    const filtered = pairs.filter((p) => p?.chainId === chainIdStr && p?.priceUsd);
    if (!filtered.length) throw new Error(`No ${chainIdStr} pairs for token`);
    filtered.sort((a, b) => (b?.liquidity?.usd || 0) - (a?.liquidity?.usd || 0));
    const best = filtered[0];
    const priceUsd = Number(best.priceUsd);
    if (!Number.isFinite(priceUsd)) throw new Error('Invalid priceUsd');
    return { priceUsd, updatedAt: Date.now(), source: 'dexscreener', pairAddress: best?.pairAddress || null };
}
async function getTokenUsdFast(symbol, tokenAddress, chainKey, ttlMs = 60_000) {
    const now = Date.now();
    const cached = readPriceCacheDyn(symbol, chainKey);
    if (cached && now - (cached.updatedAt || 0) < ttlMs && Number.isFinite(cached.priceUsd)) return { ...cached, fromCache: true };
    const fresh = await fetchDexscreenerUsdByToken(tokenAddress, chainKey);
    writePriceCacheDyn(symbol, chainKey, fresh);
    return { ...fresh, fromCache: false };
}

/* ---------------- Tooltip helpers (HEX Day → date, 10:00 AEST) ---------------- */
const AEST_TZ = 'Australia/Brisbane';
const TOOLTIP_LOCALE = 'en-US';
function getBrisbaneYMD(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-AU', { timeZone: AEST_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const get = (t) => Number(parts.find(p => p.type === t)?.value);
    return { y: get('year'), m: get('month'), d: get('day') };
}
function buildAestTenAmUTC(y, m, d) { return new Date(Date.UTC(y, m - 1, d, 0, 0, 0)); }
function dateForHexDay(dayNumber, currentHexDay, now = new Date()) {
    if (!Number(dayNumber) || !Number(currentHexDay)) return null;
    const { y, m, d } = getBrisbaneYMD(now);
    const base = buildAestTenAmUTC(y, m, d);
    const deltaDays = Number(dayNumber) - Number(currentHexDay);
    return new Date(base.getTime() + deltaDays * 86400000);
}
function formatAestDate(dt) {
    if (!dt) return '';
    return new Intl.DateTimeFormat(TOOLTIP_LOCALE, {
        timeZone: AEST_TZ, weekday: 'long', year: 'numeric', month: 'long', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    }).format(dt);
}

/* ------------------------------------------------------------------ */
/* Wallet filter chips (inlined, page‑namespaced)                      */
/* ------------------------------------------------------------------ */
function WalletFilterChips({ wallets, onChange, pageKey }) {
    const CHIP_LS_KEY = `kw:staking:walletChipSel:${pageKey || 'default'}`;

    const options = useMemo(() => (wallets || []).map(w => ({
        address: (w.address || '').toLowerCase(),
        label: w.label || `0x…${(w.address || '').slice(-4)}`
    })), [wallets]);

    // load selection (empty [] = "All")
    const [selected, setSelected] = useState(() => {
        try {
            const raw = localStorage.getItem(CHIP_LS_KEY);
            const arr = raw ? JSON.parse(raw) : null;
            if (Array.isArray(arr) && arr.length) return arr.map(a => String(a).toLowerCase());
        } catch { }
        return [];
    });

    const isAll = selected.length === 0;

    // publish
    useEffect(() => {
        try { localStorage.setItem(CHIP_LS_KEY, JSON.stringify(selected)); } catch { }
        if (typeof onChange === 'function') {
            onChange(isAll ? options.map(o => o.address) : selected, isAll);
        }
    }, [selected, isAll, options, onChange, CHIP_LS_KEY]);

    const toggle = (addr) => {
        setSelected(prev => {
            const a = String(addr).toLowerCase();
            if (prev.includes(a)) {
                const next = prev.filter(x => x !== a);
                return next.length === options.length ? [] : next; // if everything selected, treat as All
            }
            const next = [...prev, a];
            return next.length === options.length ? [] : next;
        });
    };

    const setAll = () => setSelected([]);

    return (
        <div className="d-flex flex-wrap gap-2" key={`chips-${pageKey || 'default'}`}>
            {/* Invisible marker ensures the “All” subtree is distinct per page */}
            {isAll && <span data-page={pageKey || 'default'} style={{ display: 'none' }} />}
            <button
                type="button"
                className={`btn btn-sm ${isAll ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={setAll}
            >
                All
            </button>
            {options.map(o => (
                <button
                    key={o.address}
                    type="button"
                    className={`btn btn-sm ${(!isAll && selected.includes(o.address)) ? 'btn-primary' : 'btn-outline-secondary'}`}
                    onClick={() => toggle(o.address)}
                    title={o.address}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

/* skeleton */
function ShimmerTable() {
    return (
        <Card>
            <Card.Body>
                <Table responsive size="sm" className="align-middle mb-0">
                    <thead>
                        <tr>
                            <th className="text-start">Wallet</th>
                            <th className="text-end">Principal</th>
                            <th className="text-end">T-Shares</th>
                            <th className="text-end">Locked Day</th>
                            <th className="text-end">Staked Days</th>
                            <th className="text-end">Unlock Day</th>
                            <th className="text-end">Days Remaining</th>
                            <th className="text-end">Yield</th>
                            <th className="text-end">% APY</th>
                            <th className="text-end">Total</th>
                            <th className="text-end">USD</th>
                            <th className="text-start">Status</th>
                        </tr>
                    </thead>
                    <tbody>{Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i}>{Array.from({ length: 12 }).map((__, j) => (
                            <td key={j} className={j === 0 || j === 11 ? 'text-start' : 'text-end'} style={{ minWidth: j === 0 ? 120 : 80 }}>
                                <Placeholder as="div" animation="wave"><Placeholder xs={j === 0 ? 6 : 4} /></Placeholder>
                            </td>
                        ))}</tr>
                    ))}</tbody>
                </Table>
            </Card.Body>
        </Card>
    );
}

/* ---------------- Component (eHEX on Ethereum) ---------------- */
export default function KwEhexStaking({ config }) {
    const defaultCfg = useMemo(() => ({
        id: 'ehex-eth',
        title: 'eHEX Staking',
        badge: 'ETHEREUM',
        unit: 'eHEX',
        chain: PAGE_CHAIN,
        chainId: 'ethereum',
        hexAddress: import.meta.env.VITE_ETH_HEX_ADDRESS || '0x2b591e99aFe9F32eaa6214f7B7629768c40eEb39',
        priceKey: 'EHEX'
    }), []);
    const cfg = useMemo(() => ({ ...defaultCfg, ...(config || {}) }), [defaultCfg, config]);

    /* Wallets */
    const ctx = (typeof useWallets === 'function') ? useWallets() : null;
    const ctxWallets = ctx?.wallets || [];
    const lsWallets = useMemo(() => loadWallets() || [], []);
    const sourceWallets = ctxWallets.length ? ctxWallets : lsWallets;

    const ethAddresses = useMemo(
        () => (sourceWallets || []).map(w => (typeof w === 'string' ? w : w?.address)).filter(Boolean),
        [sourceWallets]
    );

    const walletNameMap = useMemo(() => {
        const map = {};
        for (const w of (sourceWallets || [])) {
            const addr = (typeof w === 'string' ? w : w?.address);
            if (!addr) continue;
            const name = (typeof w === 'string' ? '' : (w.name || w.label || w.title || w.nickname || ''));
            if (name) map[addr.toLowerCase()] = name;
        }
        return map;
    }, [sourceWallets]);

    const walletOptions = useMemo(() => (ethAddresses || []).map(a => {
        const addrLc = a.toLowerCase();
        const friendly = walletNameMap[addrLc];
        return { address: addrLc, label: friendly ? `${friendly}` : `0x…${a.slice(-4)}` };
    }), [ethAddresses, walletNameMap]);

    /* Data state */
    const [rows, setRows] = useState([]);          // Active
    const [rowsEnded, setRowsEnded] = useState([]); // Ended
    const [currentDay, setCurrentDay] = useState(null);
    const [payoutPerTShareDailyHex, setPayoutPerTShareDailyHex] = useState(null);
    const [updatedAt, setUpdatedAt] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [setupError, setSetupError] = useState('');
    const [progress, setProgress] = useState({ done: 0, total: 0 });

    /* Price (EHEX/ETH) */
    const initialPrice = (() => {
        const v = readUnifiedTokenPriceUsd(cfg.priceKey);
        if (Number.isFinite(v) && v > 0) return v;
        const c = readPriceCacheDyn(cfg.priceKey, cfg.chain);
        if (c && Number.isFinite(c.priceUsd)) return c.priceUsd;
        return null;
    })();
    const [hexPriceUsd, setHexPriceUsd] = useState(initialPrice);
    const [hexPriceUpdatedAt, setHexPriceUpdatedAt] = useState(() =>
        (readPriceCacheDyn(cfg.priceKey, cfg.chain)?.updatedAt || 0)
    );

    useEffect(() => {
        const importantKeys = new Set([
            `kw:last${up(cfg.priceKey)}PriceUsd`,
            'kw:dexscreener:prices:v1',
            'kw:dex:prices:v1',
            'kw:tokenPrices:v1',
            'kw:prices:bySymbol',
            'kw:prices:spot:v1'
        ]);
        const onStorage = (e) => {
            if (!e?.key || !importantKeys.has(e.key)) return;
            const v = readUnifiedTokenPriceUsd(cfg.priceKey);
            if (v > 0) { setHexPriceUsd(v); setHexPriceUpdatedAt(Date.now()); }
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, [cfg.priceKey]);

    useEffect(() => {
        let alive = true;
        if (Number.isFinite(hexPriceUsd) && hexPriceUsd > 0) return;
        (async () => {
            try {
                const r = await getTokenUsdFast(cfg.priceKey, cfg.hexAddress, cfg.chain, 60_000);
                if (!alive) return;
                setHexPriceUsd(r.priceUsd); setHexPriceUpdatedAt(r.updatedAt); writeUnifiedTokenPriceUsd(r.priceUsd, cfg.priceKey);
                if (r.fromCache) {
                    fetchDexscreenerUsdByToken(cfg.hexAddress, cfg.chain)
                        .then((fresh) => {
                            writePriceCacheDyn(cfg.priceKey, cfg.chain, fresh);
                            writeUnifiedTokenPriceUsd(fresh.priceUsd, cfg.priceKey);
                            if (alive) { setHexPriceUsd(fresh.priceUsd); setHexPriceUpdatedAt(fresh.updatedAt); }
                        })
                        .catch(() => { });
                }
            } catch { /* HDS fallback below may fill it */ }
        })();
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cfg.priceKey, cfg.hexAddress, cfg.chain]);

    /* Yield state */
    const [yieldMap, setYieldMap] = useState({});
    const [yieldMapEnded, setYieldMapEnded] = useState({});

    /* Sorting */
    const [sort, setSort] = useState({ key: 'daysRemaining', dir: 'asc' });
    const toggleSort = (key) => setSort(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });

    const estimateDailyYieldHex = (tShares, payout) => (Number(tShares) || 0) * (Number(payout) || 0);

    const sortValue = (r, key) => {
        switch (key) {
            case 'wallet': {
                const friendly = walletNameMap[(r.wallet || '').toLowerCase()];
                const shortAddr = `0x…${(r.wallet || '').slice(-4)}`;
                return (friendly ? `${shortAddr} — ${friendly}` : shortAddr).toLowerCase();
            }
            case 'principalHex': return Number(r.principalHex) || 0;
            case 'tShares': return Number(r.tShares) || 0;
            case 'lockedDay': return Number(r.lockedDay) || 0;
            case 'stakedDays': return Number(r.stakedDays) || 0;
            case 'unlockDay': return calcUnlockDay(r.lockedDay, r.stakedDays) || 0;
            case 'daysRemaining': {
                const cd = Number(currentDay) || 0;
                const ud = calcUnlockDay(r.lockedDay, r.stakedDays) || 0;
                if (!cd || !ud) return 0;
                return ud - cd;
            }
            case 'yieldHexTotal': return Number(yieldMap[r.id]?.yieldHex || 0);
            case '%apy': return Number(yieldMap[r.id]?.apyPct || 0);
            case 'totalHex': {
                const y = Number(yieldMap[r.id]?.yieldHex || 0);
                return (Number(r.principalHex) || 0) + y;
            }
            case 'usdTotal': {
                const y = Number(yieldMap[r.id]?.yieldHex || 0);
                const totalHex = (Number(r.principalHex) || 0) + y;
                return totalHex * (Number(hexPriceUsd) || 0);
            }
            case 'yieldDaily': return Number(estimateDailyYieldHex(r.tShares, payoutPerTShareDailyHex) || 0);
            case 'status': {
                const status = getStakeStatus({ lockedDay: r.lockedDay, stakedDays: r.stakedDays, unlockedDay: r.unlockedDay, currentDay });
                return statusSortWeight[status] ?? 0;
            }
            default: return 0;
        }
    };

    const sortedRows = useMemo(() => {
        const arr = [...rows];
        arr.sort((a, b) => {
            const av = sortValue(a, sort.key);
            const bv = sortValue(b, sort.key);
            const cmp = (typeof av === 'string' || typeof bv === 'string')
                ? String(av).localeCompare(String(bv))
                : (av ?? 0) - (bv ?? 0);
            return sort.dir === 'asc' ? cmp : -cmp;
        });
        return arr;
    }, [rows, sort, currentDay, walletNameMap, hexPriceUsd, payoutPerTShareDailyHex, yieldMap]);

    const sortedRowsEnded = useMemo(() => {
        const arr = [...rowsEnded];
        arr.sort((a, b) => (b.unlockedDay || 0) - (a.unlockedDay || 0));
        return arr;
    }, [rowsEnded]);

    /* cache → background refresh (ETH only) */
    useEffect(() => {
        let alive = true;

        (async () => {
            const cached = await readCacheEthSafe(ethAddresses);
            if (cached?.rows || cached?.rowsEnded || cached?.byAddr) {
                if (cached.byAddr) {
                    const { active, ended } = buildRowsFromByAddr(cached.byAddr);
                    setRows(active); setRowsEnded(ended);
                } else {
                    setRows(cached.rows || []); setRowsEnded(cached.rowsEnded || []);
                    setCurrentDay(cached.currentDay ?? null);
                    setPayoutPerTShareDailyHex(cached.payoutPerTShareDailyHex ?? null);
                }
                setUpdatedAt(cached.updatedAt || null);
                setLoading(false);
            } else {
                setLoading(true);
            }
        })();

        setIsRefreshing(true);
        setSetupError('');
        setProgress({ done: 0, total: ethAddresses.length });

        const onProgress = (a, b) => {
            let done = 0, total = ethAddresses.length || 0;
            if (typeof a === 'number' && typeof b === 'number') { done = a; total = b; }
            else if (typeof a === 'object' && a) { done = Number(a.done ?? a.index ?? 0); total = Number(a.total ?? total); }
            else if (typeof a === 'number') { done = a; }
            setProgress({ done, total });
        };

        (async () => {
            try {
                const payload = await refreshEthSafe(ethAddresses, onProgress);
                if (!alive) return;

                if (payload?.rows || payload?.rowsEnded) {
                    setRows(payload.rows || []);
                    setRowsEnded(payload.rowsEnded || []);
                    setCurrentDay(payload.currentDay ?? null);
                    setPayoutPerTShareDailyHex(payload.payoutPerTShareDailyHex ?? null);
                } else if (payload?.byAddr) {
                    const { active, ended } = buildRowsFromByAddr(payload.byAddr);
                    setRows(active); setRowsEnded(ended);
                }
                setUpdatedAt(new Date());

                const hdsRows = await fetchHdsEth();
                const { pps, currentDay } = extractPpsAndDay(hdsRows);
                if (!alive) return;
                setPayoutPerTShareDailyHex(pps?.[currentDay] || 0);
                setCurrentDay(currentDay);

                if (!(Number(hexPriceUsd) > 0)) {
                    const px = extractHexPriceUsd(hdsRows);
                    if (px && alive) { setHexPriceUsd(px); setHexPriceUpdatedAt(Date.now()); writeUnifiedTokenPriceUsd(px, cfg.priceKey); }
                }

                setProgress((p) => (p.done === 0 && ((rows?.length || 0) + (rowsEnded?.length || 0)) > 0)
                    ? { done: p.total || ethAddresses.length, total: p.total || ethAddresses.length }
                    : p
                );
            } catch (e) {
                if (alive) setSetupError(e?.message || String(e));
            } finally {
                if (alive) { setIsRefreshing(false); setLoading(false); }
            }
        })();

        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ethAddresses.map(a => a.toLowerCase()).join('|'), cfg.priceKey, cfg.hexAddress]);

    /* Recompute Yield/APY whenever stakes or currentDay change */
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                if ((!rows.length && !rowsEnded.length) || !Number(currentDay)) {
                    if (alive) { setYieldMap({}); setYieldMapEnded({}); }
                    return;
                }
                const hdsRows = await fetchHdsEth();
                const { pps } = extractPpsAndDay(hdsRows);
                if (!alive) return;

                const nextActive = {};
                for (const r of rows) {
                    const yHex = computeStakeYieldHex(r, currentDay, pps);
                    const apy = computeApyPct(r, yHex, currentDay);
                    nextActive[r.id] = { yieldHex: yHex, apyPct: apy };
                }
                const nextEnded = {};
                for (const r of rowsEnded) {
                    const until = Number(r.unlockedDay || 0) || currentDay;
                    const yHex = computeYieldHexWithUntil(r, pps, until);
                    const apy = computeApyPct(r, yHex, until);
                    nextEnded[r.id] = { yieldHex: yHex, apyPct: apy };
                }
                if (alive) { setYieldMap(nextActive); setYieldMapEnded(nextEnded); }
            } catch { if (alive) { setYieldMap({}); setYieldMapEnded({}); } }
        })();
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, rowsEnded, currentDay, cfg.priceKey]);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        setProgress({ done: 0, total: ethAddresses.length });

        const onProgress = (a, b) => {
            let done = 0, total = ethAddresses.length || 0;
            if (typeof a === 'number' && typeof b === 'number') { done = a; total = b; }
            else if (typeof a === 'object' && a) { done = Number(a.done ?? a.index ?? 0); total = Number(a.total ?? total); }
            else if (typeof a === 'number') { done = a; }
            setProgress({ done, total });
        };

        try {
            const payload = await refreshEthSafe(ethAddresses, onProgress);

            if (payload?.rows || payload?.rowsEnded) {
                setRows(payload.rows || []);
                setRowsEnded(payload.rowsEnded || []);
                setCurrentDay(payload.currentDay ?? null);
                setPayoutPerTShareDailyHex(payload.payoutPerTShareDailyHex ?? null);
            } else if (payload?.byAddr) {
                const { active, ended } = buildRowsFromByAddr(payload.byAddr);
                setRows(active); setRowsEnded(ended);
            }
            setUpdatedAt(new Date());

            try {
                const fresh = await fetchDexscreenerUsdByToken(cfg.hexAddress, cfg.chain);
                writePriceCacheDyn(cfg.priceKey, cfg.chain, fresh);
                writeUnifiedTokenPriceUsd(fresh.priceUsd, cfg.priceKey);
                setHexPriceUsd(fresh.priceUsd); setHexPriceUpdatedAt(fresh.updatedAt);
            } catch {
                if (!Number.isFinite(hexPriceUsd)) {
                    const hdsRows = await fetchHdsEth({ force: false }).catch(() => null);
                    const px = hdsRows ? extractHexPriceUsd(hdsRows) : null;
                    if (px) { setHexPriceUsd(px); setHexPriceUpdatedAt(Date.now()); writeUnifiedTokenPriceUsd(px, cfg.priceKey); }
                }
            }

            try {
                const hdsRows = await fetchHdsEth({ force: false });
                const { pps } = extractPpsAndDay(hdsRows);

                const act = {};
                for (const r of (payload.rows || buildRowsFromByAddr(payload.byAddr || {}).active)) {
                    const yHex = computeStakeYieldHex(r, payload.currentDay ?? currentDay, pps);
                    const apy = computeApyPct(r, yHex, payload.currentDay ?? currentDay);
                    act[r.id] = { yieldHex: yHex, apyPct: apy };
                }
                setYieldMap(act);

                const endMap = {};
                for (const r of (payload.rowsEnded || buildRowsFromByAddr(payload.byAddr || {}).ended)) {
                    const until = Number(r.unlockedDay || 0) || (payload.currentDay ?? currentDay);
                    const yHex = computeYieldHexWithUntil(r, pps, until);
                    const apy = computeApyPct(r, yHex, until);
                    endMap[r.id] = { yieldHex: yHex, apyPct: apy };
                }
                setYieldMapEnded(endMap);
            } catch { }
        } catch (e) {
            setSetupError(e?.message || String(e));
        } finally {
            setIsRefreshing(false);
        }
    };

    const ariaSort = (key) => sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';

    /* Wallet chip selection → filtered tables */
    const [selectedAddrs, setSelectedAddrs] = useState(ethAddresses.map(a => a.toLowerCase()));
    const [isAllWallets, setIsAllWallets] = useState(true);

    const filteredRows = useMemo(() => {
        if (isAllWallets || !selectedAddrs?.length) return sortedRows;
        const set = new Set(selectedAddrs.map(a => a.toLowerCase()));
        return (sortedRows || []).filter(r => set.has((r.wallet || '').toLowerCase()));
    }, [sortedRows, selectedAddrs, isAllWallets]);

    const filteredRowsEnded = useMemo(() => {
        if (isAllWallets || !selectedAddrs?.length) return sortedRowsEnded;
        const set = new Set(selectedAddrs.map(a => a.toLowerCase()));
        return (sortedRowsEnded || []).filter(r => set.has((r.wallet || '').toLowerCase()));
    }, [sortedRowsEnded, selectedAddrs, isAllWallets]);

    /* Publish page total (only eHEX stakes here) */
    const { setSource } = usePortfolioValue();
    const hexStakingUsdTotal = useMemo(() => {
        const price = Number(hexPriceUsd) || 0; if (!price) return 0;
        return (rows || []).reduce((acc, r) => {
            const y = Number(yieldMap[r.id]?.yieldHex || 0);
            const totalHex = (Number(r.principalHex) || 0) + y;
            return acc + totalHex * price;
        }, 0);
    }, [rows, yieldMap, hexPriceUsd]);
    useEffect(() => { setSource(HEX_STAKING_SOURCE, Number(hexStakingUsdTotal) || 0); }, [hexStakingUsdTotal, setSource]);

    const unit = cfg.unit || 'eHEX';

    return (
        <Row className="gy-3" key={`page-${PAGE_KEY}`}>
            {/* Unified header */}
            {!loading && (
                <Col xs={12} className="pt-0 mt-0">
                    <KwHexStakingHeaderContainer
                        stakes={rows}
                        currentHexDay={currentDay ?? 0}
                        payoutPerTShareDailyHex={payoutPerTShareDailyHex ?? 0}
                        updatedAt={updatedAt}
                        onRefresh={handleRefresh}
                        sticky
                        hexPriceUsdOverride={Number.isFinite(hexPriceUsd) ? hexPriceUsd : undefined}
                        /* explicit overrides to avoid header equality with HEX page */
                        titleOverride="eHEX Staking"
                        badgeOverride="ETHEREUM"
                        unitOverride="eHEX"
                    />
                </Col>
            )}

            <Col xs={12} className="mt-2">
                {setupError && <Alert variant="warning" className="mb-3">{setupError}</Alert>}

                {!ethAddresses.length && !loading && (
                    <Card><Card.Body className="text-muted">No wallets detected. Add one in <strong>Manage Wallets</strong> to begin.</Card.Body></Card>
                )}

                {loading && (
                    <>
                        <Card className="mb-3">
                            <Card.Body>
                                <div className="d-flex align-items-center gap-2">
                                    <span className="text-muted">Loading eHEX stakes…</span>
                                    {progress.total > 0 && (<small className="text-muted">({progress.done}/{progress.total} wallets)</small>)}
                                </div>
                            </Card.Body>
                        </Card>
                        <ShimmerTable />
                    </>
                )}

                {/* Wallet filter buttons (page-keyed) */}
                {!loading && ethAddresses.length > 0 && (
                    <Card className="mb-3" key={`chips-card-${PAGE_KEY}`}>
                        <Card.Body>
                            <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                                <div className="text-muted mb-1">Filter by wallet:</div>
                                {isRefreshing && <small className="text-muted">Refreshing… ({progress.done}/{progress.total})</small>}
                            </div>
                            <WalletFilterChips
                                wallets={walletOptions}
                                pageKey={PAGE_KEY}
                                onChange={(addrs, isAll) => { setSelectedAddrs(addrs); setIsAllWallets(isAll); }}
                            />
                        </Card.Body>
                    </Card>
                )}

                {/* Active stakes table */}
                {!loading && filteredRows.length > 0 && (
                    <Card key={`active-${PAGE_KEY}`}>
                        <Card.Body>
                            {/* hidden page marker also here to keep subtree distinct */}
                            <span data-page-table={PAGE_KEY} style={{ display: 'none' }} />
                            <Table responsive size="sm" className="align-middle mb-0">
                                <thead>
                                    <tr>
                                        <th aria-sort={ariaSort('wallet')} className="text-start">
                                            <button type="button" className="kw-sort-plain" onClick={() => toggleSort('wallet')}>
                                                Wallet {sort.key === 'wallet' && <span className={`kw-sort-arrow ${sort.dir}`} aria-hidden />}
                                            </button>
                                        </th>
                                        <th aria-sort={ariaSort('principalHex')} className="text-end">
                                            <button type="button" className="kw-sort-plain" onClick={() => toggleSort('principalHex')}>
                                                {`Principal (${unit})`} {sort.key === 'principalHex' && <span className={`kw-sort-arrow ${sort.dir}`} aria-hidden />}
                                            </button>
                                        </th>
                                        <th aria-sort={ariaSort('tShares')} className="text-end">
                                            <button type="button" className="kw-sort-plain" onClick={() => toggleSort('tShares')}>
                                                T-Shares {sort.key === 'tShares' && <span className={`kw-sort-arrow ${sort.dir}`} aria-hidden />}
                                            </button>
                                        </th>
                                        <th aria-sort={ariaSort('lockedDay')} className="text-end">
                                            <button type="button" className="kw-sort-plain" onClick={() => toggleSort('lockedDay')}>
                                                Locked Day {sort.key === 'lockedDay' && <span className={`kw-sort-arrow ${sort.dir}`} aria-hidden />}
                                            </button>
                                        </th>
                                        <th aria-sort={ariaSort('stakedDays')} className="text-end">
                                            <button type="button" className="kw-sort-plain" onClick={() => toggleSort('stakedDays')}>
                                                Staked Days {sort.key === 'stakedDays' && <span className={`kw-sort-arrow ${sort.dir}`} aria-hidden />}
                                            </button>
                                        </th>
                                        <th aria-sort={ariaSort('unlockDay')} className="text-end">
                                            <button type="button" className="kw-sort-plain" onClick={() => toggleSort('unlockDay')}>
                                                Unlock Day {sort.key === 'unlockDay' && <span className={`kw-sort-arrow ${sort.dir}`} aria-hidden />}
                                            </button>
                                        </th>
                                        <th aria-sort={ariaSort('daysRemaining')} className="text-end">
                                            <button type="button" className="kw-sort-plain" onClick={() => toggleSort('daysRemaining')}>
                                                Days Remaining {sort.key === 'daysRemaining' && <span className={`kw-sort-arrow ${sort.dir}`} aria-hidden />}
                                            </button>
                                        </th>
                                        <th aria-sort={ariaSort('yieldHexTotal')} className="text-end">
                                            <button type="button" className="kw-sort-plain" onClick={() => toggleSort('yieldHexTotal')}>
                                                {`Yield (${unit})`} {sort.key === 'yieldHexTotal' && <span className={`kw-sort-arrow ${sort.dir}`} aria-hidden />}
                                            </button>
                                        </th>
                                        <th aria-sort={ariaSort('%apy')} className="text-end">
                                            <button type="button" className="kw-sort-plain" onClick={() => toggleSort('%apy')}>
                                                % APY {sort.key === '%apy' && <span className={`kw-sort-arrow ${sort.dir}`} aria-hidden />}
                                            </button>
                                        </th>
                                        <th aria-sort={ariaSort('totalHex')} className="text-end">
                                            <button type="button" className="kw-sort-plain" onClick={() => toggleSort('totalHex')}>
                                                {`Total (${unit})`} {sort.key === 'totalHex' && <span className={`kw-sort-arrow ${sort.dir}`} aria-hidden />}
                                            </button>
                                        </th>
                                        <th aria-sort={ariaSort('usdTotal')} className="text-end">
                                            <button type="button" className="kw-sort-plain" onClick={() => toggleSort('usdTotal')}>
                                                USD {sort.key === 'usdTotal' && <span className={`kw-sort-arrow ${sort.dir}`} aria-hidden />}
                                            </button>
                                        </th>
                                        <th aria-sort={ariaSort('status')} className="text-start">
                                            <button type="button" className="kw-sort-plain" onClick={() => toggleSort('status')}>
                                                Status {sort.key === 'status' && <span className={`kw-sort-arrow ${sort.dir}`} aria-hidden />}
                                            </button>
                                        </th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {filteredRows.map(r => {
                                        const addr = (r.wallet || '');
                                        const shortAddr = `0x…${addr.slice(-4)}`;
                                        const friendlyName = walletNameMap[addr.toLowerCase()];
                                        const walletDisplay = friendlyName ? `${shortAddr} — ${friendlyName}` : shortAddr;

                                        const status = getStakeStatus({ lockedDay: r.lockedDay, stakedDays: r.stakedDays, unlockedDay: r.unlockedDay, currentDay });

                                        const yInfo = yieldMap[r.id];
                                        const yieldHex = yInfo?.yieldHex ?? null;
                                        const apyPct = yInfo?.apyPct ?? null;

                                        const totalHex = (Number(r.principalHex) || 0) + Number(yieldHex || 0);
                                        const price = Number(hexPriceUsd);
                                        const totalUsd = Number.isFinite(price) && price > 0 ? totalHex * price : null;

                                        const unlockDayComputed = calcUnlockDay(r.lockedDay, r.stakedDays);
                                        const lockedTooltip = formatAestDate(dateForHexDay(r.lockedDay, currentDay));
                                        const unlockTooltip = formatAestDate(dateForHexDay(unlockDayComputed, currentDay));
                                        const daysRemaining = (Number(currentDay) && unlockDayComputed) ? (unlockDayComputed - Number(currentDay)) : null;

                                        return (
                                            <tr key={r.id}>
                                                <td className="text-start"><span className="kw-wallet-chip">{walletDisplay}</span></td>
                                                <td className="text-end">{r.principalHex != null ? fmt0(r.principalHex) : '—'}</td>
                                                <td className="text-end">{r.tShares != null ? fmt2(r.tShares) : '—'}</td>
                                                <td className="text-end" title={lockedTooltip} aria-label={lockedTooltip}>{r.lockedDay ?? '—'}</td>
                                                <td className="text-end">{r.stakedDays ?? '—'}</td>
                                                <td className="text-end" title={unlockTooltip} aria-label={unlockTooltip}>{unlockDayComputed ? unlockDayComputed : '—'}</td>
                                                <td className="text-end">{daysRemaining != null ? daysRemaining : '—'}</td>
                                                <td className="text-end">{yieldHex != null ? fmt0(yieldHex) : '—'}</td>
                                                <td className="text-end">{apyPct != null ? `${fmt2(apyPct)}%` : '—'}</td>
                                                <td className="text-end">{fmt0(totalHex)}</td>
                                                <td className="text-end">{totalUsd != null ? `$${fmt2(totalUsd)}` : '—'}</td>
                                                <td className="text-start">
                                                    {status === 'Active' && <Badge bg="primary">Active</Badge>}
                                                    {status === 'Ready' && <Badge bg="success">Ready</Badge>}
                                                    {status === 'Overdue' && <Badge bg="danger">Overdue</Badge>}
                                                    {status === 'Ended' && <Badge bg="danger">Ended</Badge>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </Table>
                        </Card.Body>
                    </Card>
                )}

                {/* Ended stakes table */}
                {!loading && filteredRowsEnded.length > 0 && (
                    <Card className="mt-3" key={`ended-${PAGE_KEY}`}>
                        <Card.Header className="pb-0"><strong>Ended Stakes</strong> <small className="text-muted">(history)</small></Card.Header>
                        <Card.Body>
                            <Table responsive size="sm" className="align-middle mb-0">
                                <thead>
                                    <tr>
                                        <th className="text-start">Wallet</th>
                                        <th className="text-end">{`Principal (${unit})`}</th>
                                        <th className="text-end">T-Shares</th>
                                        <th className="text-end">Locked Day</th>
                                        <th className="text-end">Staked Days</th>
                                        <th className="text-end">Unlock Day</th>
                                        <th className="text-end">{`Yield (${unit})`}</th>
                                        <th className="text-end">% APY</th>
                                        <th className="text-end">{`Total (${unit})`}</th>
                                        <th className="text-end">USD</th>
                                        <th className="text-start">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredRowsEnded.map(r => {
                                        const addr = (r.wallet || '');
                                        const shortAddr = `0x…${addr.slice(-4)}`;
                                        const friendlyName = walletNameMap[addr.toLowerCase()];
                                        const walletDisplay = friendlyName ? `${shortAddr} — ${friendlyName}` : shortAddr;

                                        const yInfo = yieldMapEnded[r.id];
                                        const yieldHex = yInfo?.yieldHex ?? null;
                                        const apyPct = yInfo?.apyPct ?? null;

                                        const totalHex = (Number(r.principalHex) || 0) + Number(yieldHex || 0);
                                        const price = Number(hexPriceUsd);
                                        const totalUsd = Number.isFinite(price) && price > 0 ? totalHex * price : null;

                                        const unlockTooltip = formatAestDate(dateForHexDay(r.unlockedDay, currentDay));

                                        return (
                                            <tr key={`ended-${r.id}`}>
                                                <td className="text-start"><span className="kw-wallet-chip">{walletDisplay}</span></td>
                                                <td className="text-end">{r.principalHex != null ? fmt0(r.principalHex) : '—'}</td>
                                                <td className="text-end">{r.tShares != null ? fmt2(r.tShares) : '—'}</td>
                                                <td className="text-end">{r.lockedDay ?? '—'}</td>
                                                <td className="text-end">{r.stakedDays ?? '—'}</td>
                                                <td className="text-end" title={unlockTooltip} aria-label={unlockTooltip}>{r.unlockedDay || '—'}</td>
                                                <td className="text-end">{yieldHex != null ? fmt0(yieldHex) : '—'}</td>
                                                <td className="text-end">{apyPct != null ? `${fmt2(apyPct)}%` : '—'}</td>
                                                <td className="text-end">{fmt0(totalHex)}</td>
                                                <td className="text-end">{totalUsd != null ? `$${fmt2(totalUsd)}` : '—'}</td>
                                                <td className="text-start"><Badge bg="secondary">Ended</Badge></td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </Table>
                        </Card.Body>
                    </Card>
                )}

                {!loading && !filteredRows.length && !filteredRowsEnded.length && !!ethAddresses.length && !setupError && (
                    <Card><Card.Body>No stakes match the current wallet filter.</Card.Body></Card>
                )}
            </Col>
        </Row>
    );
}

/* helpers */
function buildRowsFromByAddr(byAddr) {
    const active = [], ended = [];
    Object.entries(byAddr || {}).forEach(([addr, stakes]) => {
        (stakes || []).forEach((s) => {
            const row = {
                id: `${addr}-${String(s.stakeId ?? s.index ?? '')}`,
                wallet: String(addr),
                principalHex: Number(s.stakedHearts ?? s.stakedHex ? (s.stakedHearts ?? 0) / HEARTS_PER_HEX : (s.stakedHex ?? 0)),
                tShares: Number(s.stakeShares != null ? s.stakeShares / SHARES_PER_TSHARE : (s.tShares ?? 0)),
                lockedDay: Number(s.lockedDay ?? 0),
                stakedDays: Number(s.stakedDays ?? 0),
                unlockedDay: Number(s.unlockedDay ?? 0) || null
            };
            if (row.unlockedDay) ended.push(row); else active.push(row);
        });
    });
    return { active, ended };
}
