/* src/views/kw-staking/kw-HexStaking.jsx */
import { useEffect, useMemo, useState } from 'react';
import { Row, Col, Card, Badge, Table, Alert, Placeholder } from 'react-bootstrap';
import { useWallets } from '../../contexts/WalletContext';
import { loadWallets } from '../../utils/walletStorage';
import { readHexStakesCache, refreshHexStakesAndCache } from '../../services/kw-hexPulseService';
import { usePortfolioValue, HEX_STAKING_SOURCE } from '../../contexts/PortfolioValueContext.jsx';

import KwHexStakingHeaderContainer from '../../components/kw-HexStakingHeaderContainer.jsx';
import '../../styles/kw-hex-staking-header.css';

/* ---------- Formatters ---------- */
const nf0 = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = (x) => nf0.format(Number(x) || 0);
const fmt2 = (x) => nf2.format(Number(x) || 0);

/* -------------------------------------------------------------------------- */
/* HEXDailyStats (PulseChain) fetch + cache (for Yield/APY & fallback Price)  */
/* -------------------------------------------------------------------------- */

const HDS_PLS_URL = 'https://hexdailystats.com/fulldatapulsechain';
const HDS_LS_KEY = 'kw:hds:pls:full:v1';
const HDS_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const SHARES_PER_TSHARE = 1e12;
const HEARTS_PER_HEX = 1e8;

const hdsMem = { data: null, ts: 0 };

function readHdsLS() {
    try { return JSON.parse(localStorage.getItem(HDS_LS_KEY) || 'null'); } catch { return null; }
}
function writeHdsLS(obj) {
    try { localStorage.setItem(HDS_LS_KEY, JSON.stringify(obj)); } catch { }
}

/** Fetch HDS full dataset (PulseChain) with LS + memory caching */
async function fetchHdsPls({ force = false } = {}) {
    const now = Date.now();
    if (!force && hdsMem.data && now - (hdsMem.ts || 0) < HDS_TTL_MS) return hdsMem.data;

    const fromLS = readHdsLS();
    if (!force && fromLS?.data && now - (fromLS.ts || 0) < HDS_TTL_MS) {
        hdsMem.data = fromLS.data;
        hdsMem.ts = fromLS.ts;
        return hdsMem.data;
    }

    const res = await fetch(HDS_PLS_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HEXDailyStats fetch failed: ${res.status}`);
    const data = await res.json();
    hdsMem.data = data;
    hdsMem.ts = now;
    writeHdsLS({ data, ts: now });
    return data;
}

/** Build payout-per-Tshare array (HEX) indexed by HEX day + detect currentDay */
function extractPpsAndDay(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return { pps: [], currentDay: 0 };

    const pps = [];
    let lastDay = 0;
    for (const r of rows) {
        const d = Number(r.day ?? r.dayNumber ?? r.currentDay ?? NaN);
        const raw = r.payoutPerTshareHEX ?? r.payoutPerTshare ?? r.payout_per_tshare_hex;
        const v = typeof raw === 'number' ? raw : Number(raw ?? 0) || 0;
        if (Number.isFinite(d) && d >= 0) {
            pps[d] = v;
            if (d > lastDay) lastDay = d;
        }
    }
    for (let i = 0; i <= lastDay; i++) if (typeof pps[i] !== 'number') pps[i] = 0;
    const currentDay = lastDay || rows.length;
    return { pps, currentDay };
}

/** Try to read HEX price (USD) from latest HDS row */
function extractHexPriceUsd(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const last = rows[rows.length - 1] || {};
    const raw =
        last.priceUSD ?? last.priceUsd ?? last.price_usd ??
        last.price ?? last['Price (USD)'] ?? null;
    if (raw == null) return null;
    if (typeof raw === 'number') return raw;
    const num = parseFloat(String(raw).replace(/[^0-9.]/g, ''));
    return Number.isFinite(num) ? num : null;
}

/** Sum payouts for a stake over served days to get interest in HEX (for active stakes) */
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
    const interestHEX = tShares * sumPps; // tShares (T) * payoutPerTshare (HEX/T) => HEX
    return Number.isFinite(interestHEX) ? interestHEX : 0;
}

/** For ENDED stakes: sum payouts until unlockedDay (capped by maturity) */
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

/** Compute APY based on observed yield-to-date over servedDays */
function computeApyPct(stake, yieldHex, uiDayCounter) {
    const principalHEX = Number(stake.principalHex || 0);
    const locked = Number(stake.lockedDay || 0);
    const stakedDays = Number(stake.stakedDays || 0);
    const maturity = locked + stakedDays;
    const today = Number(uiDayCounter) || 0;
    const until = Math.min(maturity, today);
    const served = Math.max(0, until - locked);

    if (!principalHEX || !served) return 0;

    const y = yieldHex / principalHEX; // fraction accrued so far
    const apy = Math.pow(1 + y, 365 / served) - 1;
    const pct = apy * 100;
    return Number.isFinite(pct) ? pct : 0;
}

/* ---------------- HEX day math ---------------- */
function calcUnlockDay(lockedDay, stakedDays) {
    const ld = Number(lockedDay) || 0;
    const sd = Number(stakedDays) || 0;
    if (!ld || !sd) return 0;
    return ld + sd;
}

/* ---------------- Status rules (Active / Ready / Overdue / Ended) ---------------- */
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

/* ---------------- Read unified HEX price caches (same as Portfolio) ---------------- */
/** Mirrors the header container’s cache lookup so both read the SAME price. */
function readUnifiedHexPriceUsd() {
    try {
        // Strong single-value cache first
        const k1 = localStorage.getItem('kw:lastHexPriceUsd');
        if (k1) { const v = Number(k1); if (v > 0) return v; }

        // Common maps used across the app/portfolio
        for (const key of [
            'kw:dexscreener:prices:v1', // { HEX: 1.23 }
            'kw:dex:prices:v1',
            'kw:tokenPrices:v1',
            'kw:prices:bySymbol',
            'kw:prices:spot:v1'
        ]) {
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            const obj = JSON.parse(raw);
            const val =
                Number(obj?.HEX ?? obj?.hex ?? obj?.['hex:pls'] ??
                    (Array.isArray(obj?.tokens)
                        ? Number(obj.tokens.find(t => (t?.symbol || '').toUpperCase() === 'HEX')?.priceUsd)
                        : undefined));
            if (val > 0) return val;
        }

        // Old/local fallback
        const old = localStorage.getItem('kw:price:hex:pls:v1');
        if (old) {
            const obj = JSON.parse(old);
            const v = Number(obj?.priceUsd);
            if (v > 0) return v;
        }

        if (typeof window !== 'undefined') {
            const v = Number(window.__KW_HEX_PRICE_USD);
            if (v > 0) return v;
        }
    } catch { }
    return 0;
}

/** When we fetch fresh price, write it back to the unified caches so everything stays consistent. */
function writeUnifiedHexPriceUsd(priceUsd) {
    if (!Number.isFinite(priceUsd) || priceUsd <= 0) return;
    try {
        localStorage.setItem('kw:lastHexPriceUsd', String(priceUsd));
        // Merge into dexscreener price map
        const k = 'kw:dexscreener:prices:v1';
        const map = (() => {
            try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch { return {}; }
        })();
        map.HEX = priceUsd;
        localStorage.setItem(k, JSON.stringify(map));
    } catch { }
}

/* ---------------- DexScreener PulseChain HEX price (fallback fetch) ---------------- */
const PLS_HEX_ADDRESS =
    import.meta.env.VITE_PLS_HEX_ADDRESS ||
    '0x2b591e99aFe9F32eaa6214f7B7629768c40eeb39'; // canonical HEX

// Keep these here (used only as a fallback; do not rely on this cache for display)
const priceLSKey = 'kw:price:hex:pls:v1';
const PRICE_TTL_MS = 60 * 1000;

function readPriceCache() {
    try { return JSON.parse(localStorage.getItem(priceLSKey) || 'null'); } catch { return null; }
}
function writePriceCache(obj) {
    try { localStorage.setItem(priceLSKey, JSON.stringify(obj)); } catch { }
}
async function fetchDexscreenerHexPlsUsd() {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${PLS_HEX_ADDRESS}`;
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) throw new Error(`DexScreener error ${res.status}`);
    const data = await res.json();
    const pairs = Array.isArray(data?.pairs) ? data.pairs : [];
    const pulsePairs = pairs.filter((p) => p?.chainId === 'pulsechain' && p?.priceUsd);
    if (!pulsePairs.length) throw new Error('No PulseChain pairs for HEX');
    pulsePairs.sort((a, b) => (b?.liquidity?.usd || 0) - (a?.liquidity?.usd || 0));
    const best = pulsePairs[0];
    const priceUsd = Number(best.priceUsd);
    if (!Number.isFinite(priceUsd)) throw new Error('Invalid priceUsd');
    return { priceUsd, updatedAt: Date.now(), source: 'dexscreener', pairAddress: best?.pairAddress || null };
}
async function getHexUsdFast(ttl = PRICE_TTL_MS) {
    const now = Date.now();
    const cached = readPriceCache();
    if (cached && now - (cached.updatedAt || 0) < ttl && Number.isFinite(cached.priceUsd)) {
        return { ...cached, fromCache: true };
    }
    const fresh = await fetchDexscreenerHexPlsUsd();
    writePriceCache(fresh);
    return { ...fresh, fromCache: false };
}

/* ---------------- Tooltip helpers (HEX Day → date, 10:00 AEST) ---------------- */
const AEST_TZ = 'Australia/Brisbane';
const TOOLTIP_LOCALE = 'en-US';

function getBrisbaneYMD(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-AU', {
        timeZone: AEST_TZ, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(now);
    const get = (t) => Number(parts.find(p => p.type === t)?.value);
    return { y: get('year'), m: get('month'), d: get('day') };
}
function buildAestTenAmUTC(y, m, d) {
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
}
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
        timeZone: AEST_TZ,
        weekday: 'long', year: 'numeric', month: 'long', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    }).format(dt);
}

/* ---------------- Skeleton while loading ---------------- */
function ShimmerTable() {
    return (
        <Card>
            <Card.Body>
                <Table responsive size="sm" className="align-middle mb-0">
                    <thead>
                        <tr>
                            <th className="text-start">Wallet</th>
                            <th className="text-end">Principal (HEX)</th>
                            <th className="text-end">T-Shares</th>
                            <th className="text-end">Locked Day</th>
                            <th className="text-end">Staked Days</th>
                            <th className="text-end">Unlock Day</th>
                            <th className="text-end">Days Remaining</th>
                            <th className="text-end">Yield (HEX)</th>
                            <th className="text-end">% APY</th>
                            <th className="text-end">Total (HEX)</th>
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

/* ---------------- Wallet filter chips (component only; styles live in chain-ui.css) ---------------- */
const CHIP_LS_KEY = 'kw:staking:walletChipSel';

function WalletFilterChips({ wallets, onChange }) {
    const items = useMemo(() => {
        const m = new Map();
        (wallets || []).forEach(w => {
            const addr = (w?.address || '').toLowerCase();
            if (!addr) return;
            if (!m.has(addr)) {
                const short = '0x…' + addr.slice(-4);
                m.set(addr, { address: addr, label: w?.label || short });
            }
        });
        return Array.from(m.values());
    }, [wallets]);

    const [sel, setSel] = useState(() => {
        try {
            const raw = localStorage.getItem(CHIP_LS_KEY);
            if (!raw) return new Set(); // empty = All
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? new Set(arr.map((a) => a.toLowerCase())) : new Set();
        } catch { return new Set(); }
    });

    useEffect(() => {
        const set = new Set(items.map(i => i.address));
        const next = new Set();
        sel.forEach(s => { if (set.has(s)) next.add(s); });
        if (next.size !== sel.size) setSel(next);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items.map(i => i.address).join('|')]);

    const isAll = sel.size === 0 || sel.size === items.length;

    useEffect(() => {
        if (isAll) onChange(items.map(i => i.address), true);
        else onChange(Array.from(sel), false);
        try { localStorage.setItem(CHIP_LS_KEY, JSON.stringify(Array.from(sel))); } catch { }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sel, items.map(i => i.address).join('|')]);

    const toggleAll = () => setSel(new Set()); // collapse to All
    const toggleOne = (addr) => {
        const next = new Set(sel);
        if (next.has(addr)) next.delete(addr); else next.add(addr);
        if (next.size === 0 || next.size === items.length) setSel(new Set());
        else setSel(next);
    };

    return (
        <div className="kw-wallet-chips" role="group" aria-label="Filter by wallet">
            <button
                type="button"
                className={`kw-chip kw-chip--all ${isAll ? 'is-active' : ''}`}
                onClick={toggleAll}
                aria-pressed={isAll}
                title="Show all wallets"
            >
                All
            </button>

            {items.map(w => {
                const active = !isAll && sel.has(w.address);
                return (
                    <button
                        key={w.address}
                        type="button"
                        className={`kw-chip ${active ? 'is-active' : ''}`}
                        onClick={() => toggleOne(w.address)}
                        aria-pressed={active}
                        title={w.address}
                    >
                        {w.label}
                    </button>
                );
            })}
        </div>
    );
}

/* ---------------- Component ---------------- */
export default function KwHexStaking() {
    /* Wallets source (context first, LS fallback) */
    const ctx = (typeof useWallets === 'function') ? useWallets() : null;
    const ctxWallets = ctx?.wallets || [];
    const lsWallets = useMemo(() => loadWallets() || [], []);
    const sourceWallets = ctxWallets.length ? ctxWallets : lsWallets;

    /* Accept both [{address, name/label}] and ["0x..."] */
    const pulseAddresses = useMemo(
        () => (sourceWallets || []).map(w => (typeof w === 'string' ? w : w?.address)).filter(Boolean),
        [sourceWallets]
    );

    /* Map: address(lowercase) -> friendly name */
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

    /* Wallet chip options */
    const walletOptions = useMemo(() => {
        return (pulseAddresses || []).map(a => {
            const addrLc = a.toLowerCase();
            const friendly = walletNameMap[addrLc];
            return {
                address: addrLc,
                label: friendly ? `${friendly}` : `0x…${a.slice(-4)}`
            };
        });
    }, [pulseAddresses, walletNameMap]);

    /* Data state */
    const [rows, setRows] = useState([]);          // Active
    const [rowsEnded, setRowsEnded] = useState([]); // Ended (history)
    const [currentDay, setCurrentDay] = useState(null);
    const [payoutPerTShareDailyHex, setPayoutPerTShareDailyHex] = useState(null);
    const [updatedAt, setUpdatedAt] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [setupError, setSetupError] = useState('');
    const [progress, setProgress] = useState({ done: 0, total: 0 });

    /* ---------- Unified HEX price (read-only from portfolio caches) ---------- */
    const initialPrice = (() => {
        const v = readUnifiedHexPriceUsd();
        if (Number.isFinite(v) && v > 0) return v;

        // Fallback to old local cache (kept for safety)
        const c = readPriceCache();
        if (c && Number.isFinite(c.priceUsd)) return c.priceUsd;

        return null;
    })();

    const [hexPriceUsd, setHexPriceUsd] = useState(initialPrice);
    const [hexPriceUpdatedAt, setHexPriceUpdatedAt] = useState(() => (readPriceCache()?.updatedAt || 0));

    // Keep price in sync with portfolio by listening for writes to shared caches
    useEffect(() => {
        const importantKeys = new Set([
            'kw:lastHexPriceUsd',
            'kw:dexscreener:prices:v1',
            'kw:dex:prices:v1',
            'kw:tokenPrices:v1',
            'kw:prices:bySymbol',
            'kw:prices:spot:v1',
            // migration: still respond to the old per-page cache
            'kw:price:hex:pls:v1'
        ]);
        const onStorage = (e) => {
            if (!e?.key || !importantKeys.has(e.key)) return;
            const v = readUnifiedHexPriceUsd();
            if (v > 0) {
                setHexPriceUsd(v);
                setHexPriceUpdatedAt(Date.now());
            }
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    // If we still have no price, do a one-shot DexScreener fetch,
    // then write it back to the unified caches so EVERYTHING sees the same value.
    useEffect(() => {
        let alive = true;
        if (Number.isFinite(hexPriceUsd) && hexPriceUsd > 0) return;

        (async () => {
            try {
                const r = await getHexUsdFast(PRICE_TTL_MS);
                if (!alive) return;
                setHexPriceUsd(r.priceUsd);
                setHexPriceUpdatedAt(r.updatedAt);

                // Write to unified caches so portfolio/header see it too
                writeUnifiedHexPriceUsd(r.priceUsd);

                // Also refresh with an uncached call if fromCache
                if (r.fromCache) {
                    fetchDexscreenerHexPlsUsd()
                        .then((fresh) => {
                            writePriceCache(fresh);
                            writeUnifiedHexPriceUsd(fresh.priceUsd);
                            if (alive) {
                                setHexPriceUsd(fresh.priceUsd);
                                setHexPriceUpdatedAt(fresh.updatedAt);
                            }
                        })
                        .catch(() => { });
                }
            } catch { /* HDS fallback below may kick in */ }
        })();

        return () => { alive = false; };
    }, []); // run once

    /* HDS daily payouts + precomputed yields */
    const [ppsByDay, setPpsByDay] = useState([]);
    const [yieldMap, setYieldMap] = useState({});
    const [yieldMapEnded, setYieldMapEnded] = useState({});

    /* Sorting */
    const [sort, setSort] = useState({ key: 'daysRemaining', dir: 'asc' }); // ✅ default to Days Remaining ASC
    const toggleSort = (key) => {
        setSort(prev =>
            prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
        );
    };

    const estimateDailyYieldHex = (tShares, payout) => {
        const ts = Number(tShares) || 0;
        const ppt = Number(payout) || 0;
        return ts * ppt;
    };

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
                const status = getStakeStatus({
                    lockedDay: r.lockedDay,
                    stakedDays: r.stakedDays,
                    unlockedDay: r.unlockedDay,
                    currentDay
                });
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

    /* cache → background refresh (stakes + header day/payout) */
    useEffect(() => {
        let alive = true;

        const cached = readHexStakesCache(pulseAddresses);
        if (cached) {
            setRows(cached.rows || []);
            setRowsEnded(cached.rowsEnded || []);
            setCurrentDay(cached.currentDay ?? null);
            setPayoutPerTShareDailyHex(cached.payoutPerTShareDailyHex ?? null);
            setUpdatedAt(cached.updatedAt || null);
            setLoading(false);
        } else {
            setLoading(true);
        }

        setIsRefreshing(true);
        setSetupError('');
        setProgress({ done: 0, total: pulseAddresses.length });

        (async () => {
            try {
                if (pulseAddresses.length) {
                    const payload = await refreshHexStakesAndCache(
                        pulseAddresses,
                        (done, total) => alive && setProgress({ done, total })
                    );
                    if (!alive) return;
                    setRows(payload.rows || []);
                    setRowsEnded(payload.rowsEnded || []);
                    setCurrentDay(payload.currentDay ?? null);
                    setPayoutPerTShareDailyHex(payload.payoutPerTShareDailyHex ?? null);
                    setUpdatedAt(new Date());
                } else {
                    if (alive) {
                        setRows([]);
                        setRowsEnded([]);
                        setCurrentDay(null);
                        setPayoutPerTShareDailyHex(null);
                        setUpdatedAt(null);
                    }
                }
            } catch (e) {
                if (alive) setSetupError(e?.message || String(e));
            } finally {
                if (alive) {
                    setIsRefreshing(false);
                    setLoading(false);
                }
            }
        })();

        return () => { alive = false; };
    }, [pulseAddresses]);

    /* Fetch HDS once and compute Yield/APY whenever rows/currentDay change */
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                if ((!rows.length && !rowsEnded.length) || !Number(currentDay)) {
                    if (alive) { setYieldMap({}); setYieldMapEnded({}); }
                    return;
                }
                const hdsRows = await fetchHdsPls();
                const { pps } = extractPpsAndDay(hdsRows);
                if (!alive) return;
                setPpsByDay(pps);

                if (!Number.isFinite(hexPriceUsd)) {
                    const px = extractHexPriceUsd(hdsRows);
                    if (px && alive) {
                        setHexPriceUsd(px);
                        setHexPriceUpdatedAt(Date.now());
                        writeUnifiedHexPriceUsd(px); // keep caches consistent if HDS gave us a solid price
                    }
                }

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
            } catch {
                if (alive) { setYieldMap({}); setYieldMapEnded({}); }
            }
        })();
        return () => { alive = false; };
    }, [rows, rowsEnded, currentDay]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleRefresh = async () => {
        setIsRefreshing(true);
        setProgress({ done: 0, total: pulseAddresses.length });
        try {
            const payload = await refreshHexStakesAndCache(
                pulseAddresses,
                (done, total) => setProgress({ done, total })
            );
            setRows(payload.rows || []);
            setRowsEnded(payload.rowsEnded || []);
            setCurrentDay(payload.currentDay ?? null);
            setPayoutPerTShareDailyHex(payload.payoutPerTShareDailyHex ?? null);
            setUpdatedAt(new Date());
            try {
                const hdsRows = await fetchHdsPls({ force: false });
                const { pps } = extractPpsAndDay(hdsRows);
                const next = {};
                for (const r of payload.rows || []) {
                    const yHex = computeStakeYieldHex(r, payload.currentDay ?? currentDay, pps);
                    const apy = computeApyPct(r, yHex, payload.currentDay ?? currentDay);
                    next[r.id] = { yieldHex: yHex, apyPct: apy };
                }
                setYieldMap(next);

                const nextEnded = {};
                for (const r of payload.rowsEnded || []) {
                    const until = Number(r.unlockedDay || 0) || (payload.currentDay ?? currentDay);
                    const yHex = computeYieldHexWithUntil(r, pps, until);
                    const apy = computeApyPct(r, yHex, until);
                    nextEnded[r.id] = { yieldHex: yHex, apyPct: apy };
                }
                setYieldMapEnded(nextEnded);

                try {
                    const fresh = await fetchDexscreenerHexPlsUsd();
                    writePriceCache(fresh);
                    writeUnifiedHexPriceUsd(fresh.priceUsd); // ← sync unified caches
                    setHexPriceUsd(fresh.priceUsd);
                    setHexPriceUpdatedAt(fresh.updatedAt);
                } catch {
                    if (!Number.isFinite(hexPriceUsd)) {
                        const px = extractHexPriceUsd(hdsRows);
                        if (px) {
                            setHexPriceUsd(px);
                            setHexPriceUpdatedAt(Date.now());
                            writeUnifiedHexPriceUsd(px); // keep caches consistent
                        }
                    }
                }
            } catch { }
        } catch (e) {
            setSetupError(e?.message || String(e));
        } finally {
            setIsRefreshing(false);
        }
    };

    const ariaSort = (key) => sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';

    /* ---------------- Wallet chip selection → filtered tables ---------------- */
    const [selectedAddrs, setSelectedAddrs] = useState(pulseAddresses.map(a => a.toLowerCase())); // All by default
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

    /* ---------------- Publish page total to global PortfolioValueContext ---------------- */
    const { setSource } = usePortfolioValue();

    // Active stakes only (to match header total)
    const hexStakingUsdTotal = useMemo(() => {
        const price = Number(hexPriceUsd) || 0;
        if (!price) return 0;
        return (rows || []).reduce((acc, r) => {
            const y = Number(yieldMap[r.id]?.yieldHex || 0);
            const totalHex = (Number(r.principalHex) || 0) + y;
            return acc + totalHex * price;
        }, 0);
    }, [rows, yieldMap, hexPriceUsd]);

    useEffect(() => {
        setSource(HEX_STAKING_SOURCE, Number(hexStakingUsdTotal) || 0);
    }, [hexStakingUsdTotal, setSource]);

    return (
        <Row className="gy-3">
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
                        /* keep title USD aligned with table USD */
                        hexPriceUsdOverride={Number.isFinite(hexPriceUsd) ? hexPriceUsd : undefined}
                    />
                </Col>
            )}

            <Col xs={12} className="mt-2">
                {setupError && <Alert variant="warning" className="mb-3">{setupError}</Alert>}

                {!pulseAddresses.length && !loading && (
                    <Card><Card.Body className="text-muted">
                        No wallets detected. Add one in <strong>Manage Wallets</strong> to begin.
                    </Card.Body></Card>
                )}

                {loading && (
                    <>
                        <Card className="mb-3">
                            <Card.Body>
                                <div className="d-flex align-items-center gap-2">
                                    <span className="text-muted">Loading HEX stakes…</span>
                                    {progress.total > 0 && (
                                        <small className="text-muted">({progress.done}/{progress.total} wallets)</small>
                                    )}
                                </div>
                            </Card.Body>
                        </Card>
                        <ShimmerTable />
                    </>
                )}

                {/* Wallet filter chips */}
                {!loading && pulseAddresses.length > 0 && (
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
                                                Principal (HEX) {sort.key === 'principalHex' && <span className={`kw-sort-arrow ${sort.dir}`} aria-hidden />}
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
                                                Yield (HEX) {sort.key === 'yieldHexTotal' && <span className={`kw-sort-arrow ${sort.dir}`} aria-hidden />}
                                            </button>
                                        </th>
                                        <th aria-sort={ariaSort('%apy')} className="text-end">
                                            <button type="button" className="kw-sort-plain" onClick={() => toggleSort('%apy')}>
                                                % APY {sort.key === '%apy' && <span className={`kw-sort-arrow ${sort.dir}`} aria-hidden />}
                                            </button>
                                        </th>
                                        <th aria-sort={ariaSort('totalHex')} className="text-end">
                                            <button type="button" className="kw-sort-plain" onClick={() => toggleSort('totalHex')}>
                                                Total (HEX) {sort.key === 'totalHex' && <span className={`kw-sort-arrow ${sort.dir}`} aria-hidden />}
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

                                        const status = getStakeStatus({
                                            lockedDay: r.lockedDay,
                                            stakedDays: r.stakedDays,
                                            unlockedDay: r.unlockedDay,
                                            currentDay
                                        });

                                        const yInfo = yieldMap[r.id];
                                        const yieldHex = yInfo?.yieldHex ?? null;
                                        const apyPct = yInfo?.apyPct ?? null;

                                        const totalHex = (Number(r.principalHex) || 0) + Number(yieldHex || 0);
                                        const price = Number(hexPriceUsd);
                                        const totalUsd = Number.isFinite(price) && price > 0 ? totalHex * price : null;

                                        const unlockDayComputed = calcUnlockDay(r.lockedDay, r.stakedDays);
                                        const lockedTooltip = formatAestDate(dateForHexDay(r.lockedDay, currentDay));
                                        const unlockTooltip = formatAestDate(dateForHexDay(unlockDayComputed, currentDay));
                                        const daysRemaining = (Number(currentDay) && unlockDayComputed)
                                            ? (unlockDayComputed - Number(currentDay))
                                            : null;

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

                {/* Ended stakes table (history) */}
                {!loading && filteredRowsEnded.length > 0 && (
                    <Card className="mt-3">
                        <Card.Header className="pb-0">
                            <strong>Ended Stakes</strong> <small className="text-muted">(history)</small>
                        </Card.Header>
                        <Card.Body>
                            <Table responsive size="sm" className="align-middle mb-0">
                                <thead>
                                    <tr>
                                        <th className="text-start">Wallet</th>
                                        <th className="text-end">Principal (HEX)</th>
                                        <th className="text-end">T-Shares</th>
                                        <th className="text-end">Locked Day</th>
                                        <th className="text-end">Staked Days</th>
                                        <th className="text-end">Unlock Day</th>
                                        <th className="text-end">Yield</th>
                                        <th className="text-end">% APY</th>
                                        <th className="text-end">Total (HEX)</th>
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

                {!loading && !filteredRows.length && !filteredRowsEnded.length && !!pulseAddresses.length && !setupError && (
                    <Card><Card.Body>No stakes match the current wallet filter.</Card.Body></Card>
                )}
            </Col>
        </Row>
    );
}
