/* src/views/kw-staking/kw-eHexStaking.jsx */
import { useEffect, useMemo, useState, useCallback } from 'react';
import { Row, Col, Card, Badge, Table, Alert, Placeholder } from 'react-bootstrap';
import { useWallets } from '../../contexts/WalletContext';
import { loadWallets } from '../../utils/walletStorage';

import {
    readEhexStakesCache,
    refreshEhexStakesAndCache
} from '../../services/kw-ehexStakingService';

import { usePortfolioValue, EHEX_STAKING_SOURCE } from '../../contexts/PortfolioValueContext.jsx';
import { useRefresh } from '@/contexts/RefreshContext.jsx';
import KwEHexStakingHeaderContainer from '../../components/kw-EHexStakingHeaderContainer.jsx';
import WalletFilterChips from '../../components/WalletFilterChips.jsx';
import { computeStakeProgress, getStakeProgressColor } from '../../utils/kwStakingProgress.js';
import '../../styles/kw-staking-progress.css';
import '../../styles/kw-hex-staking-header.css';

/* ---------- Formatters ---------- */
const nf0 = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = (x) => nf0.format(Number(x) || 0);
const fmt2 = (x) => nf2.format(Number(x) || 0);

function formatProgressDisplay(percent) {
    if (!Number.isFinite(percent)) return '0%';
    const clamped = Math.max(0, Math.min(percent, 100));
    if (clamped >= 100) return '100%';
    if (clamped >= 99) {
        const capped = Math.min(clamped, 99.9);
        return `${capped.toFixed(1)}%`;
    }
    return `${Math.round(clamped)}%`;
}

/* -------------------------------------------------------------------------- */
/* HDS (ETH) – current day + payout-per-Tshare (drives Yield/APY)             */
/* -------------------------------------------------------------------------- */
const HDS_ETH_URL = 'https://hexdailystats.com/fulldata';
const HDS_LS_KEY = 'kw:hds:eth:full:v1';
const HDS_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

const SHARES_PER_TSHARE = 1e12;
const HEARTS_PER_HEX = 1e8;

const PAGE_CHAIN = 'ethereum';

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
function getFreshHdsFromLS() {
    const now = Date.now();
    const obj = readHdsLS();
    if (obj?.data && now - (obj.ts || 0) < HDS_TTL_MS) return obj.data;
    return null;
}
// NEW: allow stale for instant snapshot
function getAnyHdsFromLS() {
    const obj = readHdsLS();
    return obj?.data || null;
}

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

/* ---------------- Tooltip helpers ---------------- */
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
    const base = buildAestTenAmUTC(y, m - 1, d); // keep consistent with other pages
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

/* ---------------- Synchronous cache hydrate (no flicker) ---------------- */
function tryParse(obj) { try { return JSON.parse(obj); } catch { return null; } }
function looksLikeStakeCache(x) {
    if (!x || typeof x !== 'object') return false;
    if (Array.isArray(x.rows) || Array.isArray(x.rowsEnded)) return true;
    if (x.byAddr && typeof x.byAddr === 'object') return true;
    return false;
}
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

/** Heuristic scan for any likely eHEX cache payload (supports legacy keys) */
function readAnyEhexCacheSync() {
    try {
        const maybe = readEhexStakesCache({ chain: PAGE_CHAIN, wallets: [] });
        if (maybe && typeof maybe === 'object' && !('then' in maybe)) return maybe;
    } catch { }

    const candidateKeys = [
        'kw:staking:ehex:cache:v1',
        'kw:staking:ehex:cache',
        'kw:ehex:stakes:cache',
        'kw:stakes:ehex',
        'kw:staking:eth:ehex',
        'kw:staking:ehex:eth'
    ];

    for (const k of candidateKeys) {
        const v = localStorage.getItem(k);
        if (!v) continue;
        const obj = tryParse(v);
        if (looksLikeStakeCache(obj)) return obj;
    }

    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key) continue;
            if (!/ehex|eth|staking/i.test(key)) continue;
            const obj = tryParse(localStorage.getItem(key));
            if (looksLikeStakeCache(obj)) return obj;
        }
    } catch { }
    return null;
}

/* ------ NEW: lightweight yield snapshot persistence ------ */
const EHEX_YIELD_SNAP_KEY = 'kw:ehex:yieldSnap:v1';
function readYieldSnap() {
    try { return JSON.parse(localStorage.getItem(EHEX_YIELD_SNAP_KEY) || 'null'); } catch { return null; }
}
function writeYieldSnap(snap) {
    try { localStorage.setItem(EHEX_YIELD_SNAP_KEY, JSON.stringify(snap)); } catch { }
}

/* ------ build a header/table snapshot from cached (fresh OR stale) HDS ------ */
function snapshotYieldFromCachedHds(rowsAct = [], rowsEnd = []) {
    const hdsData = getFreshHdsFromLS() || getAnyHdsFromLS(); // <- fresh OR stale
    if (!hdsData) return null;
    const { pps, currentDay } = extractPpsAndDay(hdsData);
    const todayPayout = Number(pps?.[currentDay] || 0);

    const yAct = {};
    for (const r of rowsAct) {
        const yHex = computeStakeYieldHex(r, currentDay, pps);
        const apy = computeApyPct(r, yHex, currentDay);
        yAct[r.id] = { yieldHex: yHex, apyPct: apy };
    }
    const yEnd = {};
    for (const r of rowsEnd) {
        const until = Number(r.unlockedDay || 0) || currentDay;
        const yHex = computeYieldHexWithUntil(r, pps, until);
        const apy = computeApyPct(r, yHex, until);
        yEnd[r.id] = { yieldHex: yHex, apyPct: apy };
    }
    return { currentDay, todayPayout, yAct, yEnd, updatedAt: Date.now() };
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
                    <tbody>
                        {Array.from({ length: 5 }).map((_, i) => (
                            <tr key={i}>
                                {Array.from({ length: 12 }).map((__, j) => (
                                    <td
                                        key={j}
                                        className={j === 0 || j === 11 ? 'text-start' : 'text-end'}
                                        style={{ minWidth: j === 0 ? 120 : 80 }}
                                    >
                                        <Placeholder as="div" animation="wave">
                                            <Placeholder xs={j === 0 ? 6 : 4} />
                                        </Placeholder>
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
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
        chain: 'ethereum',
        chainId: 'ethereum',
        hexAddress: import.meta.env.VITE_ETH_HEX_ADDRESS || '0x2b591e99aFe9F32eaa6214f7B7629768c40eEb39',
        priceKey: 'EHEX'
    }), []);
    const cfg = useMemo(() => ({ ...defaultCfg, ...(config || {}) }), [defaultCfg, config]);
    const { registerTask } = useRefresh();

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

    /* ---------------- Cache-first: hydrate initial state synchronously ---------------- */
    const initialCached = useMemo(() => {
        const raw = readAnyEhexCacheSync();
        let rows = [], rowsEnded = [], currentDay = null, payoutPerTShareDailyHex = null, updatedAt = null;

        if (raw) {
            if (raw.byAddr) {
                const built = buildRowsFromByAddr(raw.byAddr);
                rows = built.active; rowsEnded = built.ended;
                currentDay = Number(raw.currentDay ?? 0) || null;
                payoutPerTShareDailyHex = Number(raw.payoutPerTShareDailyHex ?? 0) || null;
                updatedAt = raw.updatedAt ? new Date(raw.updatedAt) : null;
            } else {
                rows = raw.rows || [];
                rowsEnded = raw.rowsEnded || [];
                currentDay = Number(raw.currentDay ?? 0) || null;
                payoutPerTShareDailyHex = Number(raw.payoutPerTShareDailyHex ?? 0) || null;
                updatedAt = raw.updatedAt ? new Date(raw.updatedAt) : null;
            }
        }

        // Try HDS snapshot (fresh or stale)
        let yieldMapInit = {}, yieldMapEndedInit = {};
        const snap = snapshotYieldFromCachedHds(rows, rowsEnded);
        if (snap) {
            if (!currentDay) currentDay = snap.currentDay;
            if (!payoutPerTShareDailyHex) payoutPerTShareDailyHex = snap.todayPayout;
            yieldMapInit = snap.yAct; yieldMapEndedInit = snap.yEnd;
        } else {
            // fallback to last saved yield snapshot
            const ys = readYieldSnap();
            if (ys) {
                if (!currentDay && ys.currentDay) currentDay = ys.currentDay;
                if (!payoutPerTShareDailyHex && ys.payoutPerTShareDailyHex) payoutPerTShareDailyHex = ys.payoutPerTShareDailyHex;
                yieldMapInit = ys.yieldMap || {};
                yieldMapEndedInit = ys.yieldMapEnded || {};
            }
        }

        return {
            rows,
            rowsEnded,
            currentDay,
            payoutPerTShareDailyHex,
            updatedAt,
            yieldMapInit,
            yieldMapEndedInit
        };
    }, []);

    /* Data state */
    const [rows, setRows] = useState(() => initialCached?.rows || []);
    const [rowsEnded, setRowsEnded] = useState(() => initialCached?.rowsEnded || []);
    const [currentDay, setCurrentDay] = useState(() => initialCached?.currentDay ?? null);
    const [payoutPerTShareDailyHex, setPayoutPerTShareDailyHex] = useState(() => initialCached?.payoutPerTShareDailyHex ?? null);
    const [updatedAt, setUpdatedAt] = useState(() => initialCached?.updatedAt || null);
    const [loading, setLoading] = useState(() => !initialCached);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [setupError, setSetupError] = useState('');
    const [progress, setProgress] = useState({ done: 0, total: ethAddresses.length });

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
            } catch { }
        })();
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cfg.priceKey, cfg.hexAddress, cfg.chain]);

    /* Yield state (seed with snapshot so header/table are instant) */
    const [yieldMap, setYieldMap] = useState(() => initialCached?.yieldMapInit || {});
    const [yieldMapEnded, setYieldMapEnded] = useState(() => initialCached?.yieldMapEndedInit || {});

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
            case 'progress': {
                const fraction = computeStakeProgress({
                    lockedDay: r.lockedDay,
                    stakedDays: r.stakedDays,
                    unlockedDay: r.unlockedDay,
                    currentDay
                });
                return Number.isFinite(fraction) ? Math.max(0, Math.min(fraction * 100, 100)) : 0;
            }
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

    /* ---------------- Background revalidation (no blanking) ---------------- */
    const refreshNow = useCallback(async (options = {}) => {
        if (!ethAddresses.length) {
            // No wallets → hard reset UI and totals, do not paint stale cache
            setRows([]);
            setRowsEnded([]);
            setCurrentDay(null);
            setPayoutPerTShareDailyHex(null);
            setYieldMap({});
            setYieldMapEnded({});
            setUpdatedAt(null);
            setLoading(false);
            setProgress({ done: 0, total: 0 });
            return;
        }
        setIsRefreshing(true);
        setSetupError('');
        const total = ethAddresses.length;
        const prefetched = options?.prefetched ?? null;
        if (prefetched) {
            setProgress({ done: total, total });
        } else {
            setProgress({ done: 0, total });
        }

        const onProgress = (a, b) => {
            let done = 0, total = ethAddresses.length || 0;
            if (typeof a === 'number' && typeof b === 'number') { done = a; total = b; }
            else if (typeof a === 'object' && a) { done = Number(a.done ?? a.index ?? 0); total = Number(a.total ?? total); }
            else if (typeof a === 'number') { done = a; }
            setProgress({ done, total });
        };

        try {
            let payload = prefetched;
            if (!payload) {
                payload = await refreshEthSafe(ethAddresses, onProgress);
            }

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

            // HDS assist + yield maps + price fallback
            try {
                const hdsRows = await fetchHdsEth({ force: false });
                const { pps, currentDay: hdsDay } = extractPpsAndDay(hdsRows);

                if (!(Number(payload?.currentDay) > 0) && Number(hdsDay) > 0) setCurrentDay(hdsDay);
                if (!(Number(payload?.payoutPerTShareDailyHex) > 0) && Number(hdsDay) > 0) {
                    const todayPayout = Number(pps?.[hdsDay] || 0);
                    if (todayPayout > 0) setPayoutPerTShareDailyHex(todayPayout);
                }

                const act = {};
                for (const r of (payload?.rows || (payload?.byAddr ? buildRowsFromByAddr(payload.byAddr).active : []))) {
                    const yHex = computeStakeYieldHex(r, payload?.currentDay ?? hdsDay, pps);
                    const apy = computeApyPct(r, yHex, payload?.currentDay ?? hdsDay);
                    act[r.id] = { yieldHex: yHex, apyPct: apy };
                }
                setYieldMap(act);

                const endMap = {};
                for (const r of (payload?.rowsEnded || (payload?.byAddr ? buildRowsFromByAddr(payload.byAddr).ended : []))) {
                    const until = Number(r.unlockedDay || 0) || (payload?.currentDay ?? hdsDay);
                    const yHex = computeYieldHexWithUntil(r, pps, until);
                    const apy = computeApyPct(r, yHex, until);
                    endMap[r.id] = { yieldHex: yHex, apyPct: apy };
                }
                setYieldMapEnded(endMap);

                // Persist a yield snapshot for next visit (instant paint)
                writeYieldSnap({
                    currentDay: Number(payload?.currentDay ?? hdsDay) || 0,
                    payoutPerTShareDailyHex: Number(payload?.payoutPerTShareDailyHex ?? pps?.[hdsDay] ?? 0) || 0,
                    yieldMap: act,
                    yieldMapEnded: endMap,
                    updatedAt: Date.now()
                });

                try {
                    const fresh = await fetchDexscreenerUsdByToken(cfg.hexAddress, cfg.chain);
                    writePriceCacheDyn(cfg.priceKey, cfg.chain, fresh);
                    writeUnifiedTokenPriceUsd(fresh.priceUsd, cfg.priceKey);
                    setHexPriceUsd(fresh.priceUsd); setHexPriceUpdatedAt(fresh.updatedAt);
                } catch {
                    if (!(Number(hexPriceUsd) > 0)) {
                        const px = extractHexPriceUsd(hdsRows);
                        if (px) { setHexPriceUsd(px); setHexPriceUpdatedAt(Date.now()); writeUnifiedTokenPriceUsd(px, cfg.priceKey); }
                    }
                }
            } catch {
                // ignore HDS/price assist errors
            }
        } catch (e) {
            if (!prefetched) {
                setSetupError(e?.message || String(e));
            }
        } finally {
            setIsRefreshing(false);
            setLoading(false);
        }
    }, [ethAddresses, cfg.hexAddress, cfg.chain, cfg.priceKey, hexPriceUsd]);

    // Guard: only refresh if last update >= 30 minutes ago.
    const shouldRefresh = useCallback(() => {
        if (!updatedAt) return true; // first paint or no prior update
        const last = updatedAt instanceof Date ? updatedAt.getTime() : Number(updatedAt) || 0;
        if (!last) return true;
        const diffMinutes = (Date.now() - last) / (1000 * 60);
        return diffMinutes >= 30;
    }, [updatedAt]);

    // Initial background revalidation (after cache-first paint)
    useEffect(() => {
        setLoading(false); // ensure header/table render immediately with snapshot/snap
        // First load in this tab OR an explicit reload -> force refresh once
        const sessionKey = 'kw:staking:firstPaintDone:ehex';
        const nav = (performance && performance.getEntriesByType) ? performance.getEntriesByType('navigation')[0] : null;
        const isReload = (nav?.type === 'reload') || (performance?.navigation?.type === 1);
        const firstPaint = !sessionStorage.getItem(sessionKey);

        if (isReload || firstPaint) {
            try { sessionStorage.setItem(sessionKey, '1'); } catch { }
            refreshNow();
            return;
        }
        if (shouldRefresh()) refreshNow();
    }, [refreshNow]);

    useEffect(() => {
        const unregister = registerTask('staking:ehex', async (ctx) => {
            if (ctx?.reason === 'global-refresh') {
                await refreshNow({ prefetched: ctx?.payload });
            } else {
                await refreshNow();
            }
        });
        return unregister;
    }, [refreshNow, registerTask]);
    /* ---------------- Periodic auto-refresh (every 10 minutes) ---------------- */
    useEffect(() => {
        if (!ethAddresses.length) return;
        const TEN_MIN = 10 * 60 * 1000;
        const id = setInterval(() => {
            if (!isRefreshing && shouldRefresh()) refreshNow();
        }, TEN_MIN);
        return () => clearInterval(id);
    }, [ethAddresses, isRefreshing, refreshNow, shouldRefresh]);

    /* ---------------- Recompute Yield/APY whenever stakes or currentDay change ---------------- */
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                if ((!rows.length && !rowsEnded.length)) {
                    if (alive) { setYieldMap({}); setYieldMapEnded({}); }
                    return;
                }

                // Prefer cached HDS (fresh OR stale) to avoid blank totals
                const cachedHds = getFreshHdsFromLS() || getAnyHdsFromLS();
                if (cachedHds) {
                    const { pps, currentDay: hdsDay } = extractPpsAndDay(cachedHds);
                    if (!alive) return;

                    if (!(Number(currentDay) > 0) && Number(hdsDay) > 0) {
                        setPayoutPerTShareDailyHex(pps?.[hdsDay] || 0);
                        setCurrentDay(hdsDay);
                    }

                    const dayForCalc = Number(currentDay) > 0 ? currentDay : hdsDay;

                    const act = {};
                    for (const r of rows) {
                        const yHex = computeStakeYieldHex(r, dayForCalc, pps);
                        const apy = computeApyPct(r, yHex, dayForCalc);
                        act[r.id] = { yieldHex: yHex, apyPct: apy };
                    }
                    const endMap = {};
                    for (const r of rowsEnded) {
                        const until = Number(r.unlockedDay || 0) || dayForCalc;
                        const yHex = computeYieldHexWithUntil(r, pps, until);
                        const apy = computeApyPct(r, yHex, until);
                        endMap[r.id] = { yieldHex: yHex, apyPct: apy };
                    }
                    if (alive) {
                        setYieldMap(act);
                        setYieldMapEnded(endMap);
                        writeYieldSnap({
                            currentDay: Number(dayForCalc) || 0,
                            payoutPerTShareDailyHex: Number(pps?.[dayForCalc] ?? 0) || 0,
                            yieldMap: act,
                            yieldMapEnded: endMap,
                            updatedAt: Date.now()
                        });
                    }
                    return;
                }

                // …fallback: fetch if nothing cached at all
                const hdsRows = await fetchHdsEth();
                const { pps, currentDay: hdsDay } = extractPpsAndDay(hdsRows);
                if (!alive) return;

                if (!(Number(currentDay) > 0) && Number(hdsDay) > 0) {
                    setPayoutPerTShareDailyHex(pps?.[hdsDay] || 0);
                    setCurrentDay(hdsDay);
                }

                const dayForCalc = Number(currentDay) > 0 ? currentDay : hdsDay;

                const act = {};
                for (const r of rows) {
                    const yHex = computeStakeYieldHex(r, dayForCalc, pps);
                    const apy = computeApyPct(r, yHex, dayForCalc);
                    act[r.id] = { yieldHex: yHex, apyPct: apy };
                }
                const endMap = {};
                for (const r of rowsEnded) {
                    const until = Number(r.unlockedDay || 0) || dayForCalc;
                    const yHex = computeYieldHexWithUntil(r, pps, until);
                    const apy = computeApyPct(r, yHex, until);
                    endMap[r.id] = { yieldHex: yHex, apyPct: apy };
                }
                if (alive) {
                    setYieldMap(act);
                    setYieldMapEnded(endMap);
                    writeYieldSnap({
                        currentDay: Number(dayForCalc) || 0,
                        payoutPerTShareDailyHex: Number(pps?.[dayForCalc] ?? 0) || 0,
                        yieldMap: act,
                        yieldMapEnded: endMap,
                        updatedAt: Date.now()
                    });
                }
            } catch {
                if (alive) { setYieldMap({}); setYieldMapEnded({}); }
            }
        })();
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, rowsEnded, currentDay]);

    /* ---------------- Manual Refresh ---------------- */
    const handleRefresh = useCallback(() => {
        refreshNow();
    }, [refreshNow]);

    const ariaSort = (key) => sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';

    /* ---------------- Wallet chip selection → filtered tables ---------------- */
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
    const ehexStakingUsdTotal = useMemo(() => {
        const price = Number(hexPriceUsd) || 0; if (!price) return 0;
        return (rows || []).reduce((acc, r) => {
            const y = Number(yieldMap[r.id]?.yieldHex || 0);
            const totalHex = (Number(r.principalHex) || 0) + y;
            return acc + totalHex * price;
        }, 0);
    }, [rows, yieldMap, hexPriceUsd]);

    // ✅ publish to the correct global key so HEX + eHEX can coexist
    useEffect(() => {
        setSource(EHEX_STAKING_SOURCE, Number(ehexStakingUsdTotal) || 0);
    }, [ehexStakingUsdTotal, setSource]);

    const unit = cfg.unit || 'eHEX';

    return (
        /* ✅ Scoped wrapper so staking CSS can't leak into View All */
        <div className="kw-staking">
            <Row className="gy-3 kw-ehex-page">
                {!loading && (
                    <Col xs={12} className="pt-0 mt-0">
                        <KwEHexStakingHeaderContainer
                            stakes={rows}
                            currentHexDay={currentDay ?? 0}
                            payoutPerTShareDailyHex={payoutPerTShareDailyHex ?? 0}
                            updatedAt={updatedAt}
                            onRefresh={handleRefresh}
                            sticky
                            hexPriceUsdOverride={Number.isFinite(hexPriceUsd) ? hexPriceUsd : undefined}
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

                    {/* Wallet filter buttons */}
                    {!loading && ethAddresses.length > 0 && (
                        <Card className="mb-3">
                            <Card.Body>
                                <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                                    <div className="text-muted mb-1">Filter by wallet:</div>
                                    {isRefreshing && <small className="text-muted">Refreshing… ({progress.done}/{progress.total})</small>}
                                </div>
                                <WalletFilterChips
                                    wallets={walletOptions}
                                    onChange={(addrs, isAll) => {
                                        setSelectedAddrs(addrs);
                                        setIsAllWallets(isAll);
                                    }}
                                />
                            </Card.Body>
                        </Card>
                    )}

                    {/* Active stakes table */}
                    {!loading && filteredRows.length > 0 && (
                        <Card>
                            <Card.Body>
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
                                            <th aria-sort={ariaSort('progress')} className="text-end">
                                                <button type="button" className="kw-sort-plain" onClick={() => toggleSort('progress')}>
                                                    Progress {sort.key === 'progress' && <span className={`kw-sort-arrow ${sort.dir}`} aria-hidden />}
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

                                            const progress = computeStakeProgress({
                                                lockedDay: r.lockedDay,
                                                stakedDays: r.stakedDays,
                                                unlockedDay: r.unlockedDay,
                                                currentDay
                                            });
                                            const progressPercent = Number.isFinite(progress)
                                                ? Math.max(0, Math.min(progress * 100, 100))
                                                : 0;
                                            const progressStyleValue = progressPercent.toFixed(2);
                                            const progressDisplay = formatProgressDisplay(progressPercent);
                                            const rowStyle = {
                                                '--kw-stake-progress': progressStyleValue,
                                                '--kw-stake-progress-color': getStakeProgressColor(status)
                                            };

                                            return (
                                                <tr key={r.id} className="kw-staking-row" style={rowStyle}>
                                                    <td className="text-start"><span className="kw-wallet-chip kw-wallet-chip--ehex">{walletDisplay}</span></td>
                                                    <td className="text-end">{r.principalHex != null ? fmt0(r.principalHex) : '—'}</td>
                                                    <td className="text-end">{r.tShares != null ? fmt2(r.tShares) : '—'}</td>
                                                    <td className="text-end" title={lockedTooltip} aria-label={lockedTooltip}>{r.lockedDay ?? '—'}</td>
                                                    <td className="text-end">{r.stakedDays ?? '—'}</td>
                                                    <td className="text-end" title={unlockTooltip} aria-label={unlockTooltip}>{unlockDayComputed ? unlockDayComputed : '—'}</td>
                                                    <td className="text-end">{progressDisplay}</td>
                                                    <td className="text-end">{daysRemaining != null ? daysRemaining : '—'}</td>
                                                    <td className="text-end">{yieldHex != null ? fmt0(yieldHex) : '—'}</td>
                                                    <td className="text-end">{apyPct != null ? `${fmt2(apyPct)}%` : '—'}</td>
                                                    <td className="text-end">{fmt0(totalHex)}</td>
                                                    <td className="text-end">{totalUsd != null ? `$${fmt2(totalUsd)}` : '—'}</td>
                                                    <td className="text-start">
                                                        {status === 'Active' && <Badge bg="primary" className="kw-status-pill">Active</Badge>}
                                                        {status === 'Ready' && <Badge bg="success" className="kw-status-pill">Ready</Badge>}
                                                        {status === 'Overdue' && <Badge bg="danger" className="kw-status-pill">Overdue</Badge>}
                                                        {status === 'Ended' && <Badge bg="danger" className="kw-status-pill">Ended</Badge>}
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
                        <Card className="mt-3">
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
                                            <th className="text-end">Progress</th>
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
                                            const statusEnded = getStakeStatus({
                                                lockedDay: r.lockedDay,
                                                stakedDays: r.stakedDays,
                                                unlockedDay: r.unlockedDay,
                                                currentDay
                                            });
                                            const progressEnded = computeStakeProgress({
                                                lockedDay: r.lockedDay,
                                                stakedDays: r.stakedDays,
                                                unlockedDay: r.unlockedDay,
                                                currentDay
                                            });
                                            const progressPercentEnded = Number.isFinite(progressEnded)
                                                ? Math.max(0, Math.min(progressEnded * 100, 100))
                                                : 0;
                                            const progressStyleValueEnded = progressPercentEnded.toFixed(2);
                                            const progressDisplayEnded = formatProgressDisplay(progressPercentEnded);
                                            const rowStyleEnded = {
                                                '--kw-stake-progress': progressStyleValueEnded,
                                                '--kw-stake-progress-color': getStakeProgressColor(statusEnded)
                                            };

                                            return (
                                                <tr key={`ended-${r.id}`} className="kw-staking-row" style={rowStyleEnded}>
                                                    <td className="text-start"><span className="kw-wallet-chip kw-wallet-chip--ehex">{walletDisplay}</span></td>
                                                    <td className="text-end">{r.principalHex != null ? fmt0(r.principalHex) : '—'}</td>
                                                    <td className="text-end">{r.tShares != null ? fmt2(r.tShares) : '—'}</td>
                                                    <td className="text-end">{r.lockedDay ?? '—'}</td>
                                                    <td className="text-end">{r.stakedDays ?? '—'}</td>
                                                    <td className="text-end" title={unlockTooltip} aria-label={unlockTooltip}>{r.unlockedDay || '—'}</td>
                                                    <td className="text-end">{progressDisplayEnded}</td>
                                                    <td className="text-end">{yieldHex != null ? fmt0(yieldHex) : '—'}</td>
                                                    <td className="text-end">{apyPct != null ? `${fmt2(apyPct)}%` : '—'}</td>
                                                    <td className="text-end">{fmt0(totalHex)}</td>
                                                    <td className="text-end">{totalUsd != null ? `$${fmt2(totalUsd)}` : '—'}</td>
                                                    <td className="text-start"><Badge bg="secondary" className="kw-status-pill">Ended</Badge></td>
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
        </div>
    );
}

