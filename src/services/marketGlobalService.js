// src/services/marketGlobalService.js
/* eslint-disable no-console */

/**
 * Global market snapshot + 1Y history (with weekly 52-point downsample).
 * Primary 1Y provider: LiveCoinWatch (if VITE_LCW_API_KEY is set, CORS-friendly).
 * Fallback 1Y provider: CoinCap (no key).
 * Snapshot: CoinCap → CoinGecko fallback.
 *
 * Shapes:
 *   getGlobalSnapshot() -> {
 *     marketCapUsd:number, volume24hUsd:number, btcDominancePct:number,
 *     updatedAt:number(ms), changePct24h:number
 *   }
 *   getGlobalHistory1y() -> [{ t:number(ms), cap:number, vol:number }, ...] (daily)
 *   getGlobalHistory1yWeekly(strategy='last'|'avg') -> same shape, weekly bins (≈52 points)
 */

const LS_SNAPSHOT = 'kw:global:snapshot:v3';
const LS_HISTORY_DAILY = 'kw:global:history1y:daily:v3';
const LS_HISTORY_WEEKLY_LAST = 'kw:global:history1y:weekly:last:v3';
const LS_HISTORY_WEEKLY_AVG = 'kw:global:history1y:weekly:avg:v3';

const SNAPSHOT_TTL_MS = 10 * 60 * 1000; // 10m
const HISTORY_TTL_MS = 6 * 60 * 60 * 1000; // 6h

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

const nowMs = () => Date.now();

function toNum(n) {
    const v = Number(n);
    return Number.isFinite(v) ? v : 0;
}

function readCache(key, maxAgeMs) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const { savedAt, value } = JSON.parse(raw);
        if (maxAgeMs && nowMs() - (savedAt || 0) > maxAgeMs) return null;
        return value ?? null;
    } catch {
        return null;
    }
}

function writeCache(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify({ savedAt: nowMs(), value }));
    } catch { }
}

async function fetchJson(url, { timeoutMs = 12000, init = {} } = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: ctrl.signal, ...init });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } finally {
        clearTimeout(t);
    }
}

/* -------------------------------- Snapshot -------------------------------- */

export async function getGlobalSnapshot() {
    const cached = readCache(LS_SNAPSHOT, SNAPSHOT_TTL_MS);
    if (cached) return cached;

    // Primary: CoinCap
    try {
        const j = await fetchJson('https://api.coincap.io/v2/global');
        const d = j?.data || {};
        const marketCapUsd = toNum(d.marketCapUsd);
        const volume24hUsd = toNum(d.volumeUsd24Hr);
        const btcDominancePct = toNum(d.bitcoinDominance);
        const updatedAt = toNum(d.timestamp) || nowMs();

        const snap = {
            marketCapUsd,
            volume24hUsd,
            btcDominancePct,
            updatedAt,
            changePct24h: 0
        };

        // Compute 24h cap change from daily history (cached call)
        try {
            const hist = await getGlobalHistory1y();
            if (hist?.length >= 2) {
                const last = hist[hist.length - 1]?.cap || 0;
                const target = hist[hist.length - 1]?.t - DAY_MS;
                let prev = hist[0]?.cap || 0;
                for (let i = hist.length - 1; i >= 0; i--) {
                    if (hist[i].t <= target) { prev = hist[i].cap; break; }
                }
                snap.changePct24h = prev ? ((last - prev) / prev) * 100 : 0;
            }
        } catch { }

        writeCache(LS_SNAPSHOT, snap);
        return snap;
    } catch (e) {
        console.warn('[marketGlobalService] CoinCap snapshot failed:', e);
    }

    // Fallback: CoinGecko /global
    try {
        const j = await fetchJson('https://api.coingecko.com/api/v3/global');
        const d = j?.data || {};
        const snap = {
            marketCapUsd: toNum(d.total_market_cap?.usd),
            volume24hUsd: toNum(d.total_volume?.usd),
            btcDominancePct: toNum(d.market_cap_percentage?.btc),
            updatedAt: (toNum(d.updated_at) || 0) * 1000 || nowMs(),
            changePct24h: 0
        };
        writeCache(LS_SNAPSHOT, snap);
        return snap;
    } catch (e) {
        console.warn('[marketGlobalService] CoinGecko snapshot failed:', e);
    }

    return {
        marketCapUsd: 0,
        volume24hUsd: 0,
        btcDominancePct: 0,
        updatedAt: nowMs(),
        changePct24h: 0
    };
}

/* ------------------------------ 1Y History (Daily) ------------------------------ */

/** LiveCoinWatch daily 1Y (requires VITE_LCW_API_KEY). */
async function fetchLCWDaily1y() {
    const key = import.meta?.env?.VITE_LCW_API_KEY;
    if (!key) throw new Error('LCW key missing');

    const end = nowMs();
    const start = end - 365 * DAY_MS;

    const body = {
        currency: 'USD',
        start,
        end,
        meta: false
        // LCW returns dense daily-like samples for this window.
    };

    const j = await fetchJson('https://api.livecoinwatch.com/overview/history', {
        init: {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': key
            },
            body: JSON.stringify(body)
        }
    });

    // Expected array of objects: { date|time, cap, volume }
    const arr = Array.isArray(j) ? j : [];
    return arr
        .map(r => ({
            t: toNum(r.date ?? r.time),
            cap: toNum(r.cap),
            vol: toNum(r.volume ?? r.vol)
        }))
        .filter(p => Number.isFinite(p.t))
        .sort((a, b) => a.t - b.t);
}

/** CoinCap daily 1Y (no key). */
async function fetchCoinCapDaily1y() {
    const end = nowMs();
    const start = end - 365 * DAY_MS;
    const url = `https://api.coincap.io/v2/global/history?interval=d1&start=${start}&end=${end}`;
    const j = await fetchJson(url);
    const arr = Array.isArray(j?.data) ? j.data : [];
    return arr
        .map(r => ({
            t: Date.parse(r.date),
            cap: toNum(r.marketCapUsd),
            vol: toNum(r.volumeUsd24Hr)
        }))
        .filter(p => Number.isFinite(p.t))
        .sort((a, b) => a.t - b.t);
}

export async function getGlobalHistory1y() {
    const cached = readCache(LS_HISTORY_DAILY, HISTORY_TTL_MS);
    if (cached) return cached;

    // Try LCW → CoinCap
    try {
        const lcw = await fetchLCWDaily1y();
        if (lcw.length) { writeCache(LS_HISTORY_DAILY, lcw); return lcw; }
    } catch (e) {
        console.warn('[marketGlobalService] LCW history failed (using fallback):', e?.message || e);
    }

    try {
        const cc = await fetchCoinCapDaily1y();
        writeCache(LS_HISTORY_DAILY, cc);
        return cc;
    } catch (e) {
        console.warn('[marketGlobalService] CoinCap history failed:', e);
    }

    writeCache(LS_HISTORY_DAILY, []);
    return [];
}

/* ------------------------------ Weekly Downsample ------------------------------ */

/**
 * Downsample a daily series into weekly bins.
 * Strategy:
 *  - 'last': take the last daily point in each 7-day bin (keeps market structure).
 *  - 'avg' : average cap/vol across the bin (smoother line).
 * Ensures chronological order; typically ~52 points.
 */
function downsampleWeekly(daily, strategy = 'last') {
    if (!Array.isArray(daily) || !daily.length) return [];

    // Align bins across the last 365 days to avoid off-by-one weekly count.
    const end = daily[daily.length - 1].t;
    const start = end - 365 * DAY_MS;

    const out = [];
    for (let wStart = start; wStart < end; wStart += WEEK_MS) {
        const wEnd = Math.min(wStart + WEEK_MS, end + 1);
        let lastPoint = null;
        let sumCap = 0, sumVol = 0, n = 0;

        for (let i = 0; i < daily.length; i++) {
            const p = daily[i];
            if (p.t >= wStart && p.t < wEnd) {
                lastPoint = p;
                sumCap += p.cap;
                sumVol += p.vol;
                n++;
            }
        }

        if (n === 0) {
            // Pick nearest overall
            let nearest = daily[0];
            let best = Math.abs(nearest.t - (wStart + WEEK_MS / 2));
            for (let i = 1; i < daily.length; i++) {
                const d = Math.abs(daily[i].t - (wStart + WEEK_MS / 2));
                if (d < best) { best = d; nearest = daily[i]; }
            }
            out.push({ t: wStart + WEEK_MS / 2, cap: nearest.cap, vol: nearest.vol });
        } else if (strategy === 'avg') {
            out.push({ t: lastPoint.t, cap: sumCap / n, vol: sumVol / n });
        } else {
            out.push({ t: lastPoint.t, cap: lastPoint.cap, vol: lastPoint.vol });
        }
    }

    return out.sort((a, b) => a.t - b.t);
}

/** Public: weekly series with cache per strategy. */
export async function getGlobalHistory1yWeekly(strategy = 'last') {
    const cacheKey = strategy === 'avg' ? LS_HISTORY_WEEKLY_AVG : LS_HISTORY_WEEKLY_LAST;
    const cached = readCache(cacheKey, HISTORY_TTL_MS);
    if (cached) return cached;

    const daily = await getGlobalHistory1y();
    const weekly = downsampleWeekly(daily, strategy);

    writeCache(cacheKey, weekly);
    return weekly;
}

/* -------------------------------- Formatting -------------------------------- */

export function formatUsdCompact(n) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        notation: 'compact',
        maximumFractionDigits: 2
    }).format(toNum(n));
}
