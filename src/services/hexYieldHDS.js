// src/services/hex/hexYieldHDS.js
// Compute per-stake YIELD % using HEXDailyStats (PulseChain).
// Caches the full dataset in-memory + localStorage for snappy UX.

const HEARTS_PER_HEX = 1e8;
const SHARES_PER_TSHARE = 1e12;

// HDS endpoints
const HDS_URLS = {
    pls: 'https://hexdailystats.com/fulldatapulsechain',
    // If/when you add eHEX:
    eth: 'https://hexdailystats.com/fulldata'
};

// Cache (6h TTL)
const LS_KEY = 'kw:hds:full:v1';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const mem = { pls: null, eth: null, ts: 0 };

function readLS() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch { return null; }
}
function writeLS(obj) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(obj)); } catch { }
}

async function fetchHDS(chain = 'pls', { force = false } = {}) {
    const now = Date.now();
    if (!force && mem[chain] && now - (mem.ts || 0) < CACHE_TTL_MS) return mem[chain];

    const fromLS = readLS();
    const lsHit = fromLS?.[chain];
    if (!force && lsHit?.data && now - (lsHit.ts || 0) < CACHE_TTL_MS) {
        mem[chain] = lsHit.data;
        mem.ts = lsHit.ts;
        return mem[chain];
    }

    const url = HDS_URLS[chain] || HDS_URLS.pls;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HEXDailyStats ${chain} fetch failed: ${res.status}`);
    const data = await res.json();

    mem[chain] = data;
    mem.ts = now;
    writeLS({ ...(fromLS || {}), [chain]: { data, ts: now } });
    return data;
}

// Pull payout-per-Tshare & current day (defensive against slight API field variations)
function extractPpsAndDay(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return { pps: [], currentDay: 0 };

    // Build by day index for O(1) lookups
    // Accept fields: day / dayNumber / currentDay; payoutPerTshareHEX / payoutPerTshare / payout_per_tshare_hex
    const pps = [];
    let lastKnownDay = 0;

    for (const r of rows) {
        const d =
            Number(r.day ?? r.dayNumber ?? r.currentDay ?? NaN);
        const vRaw =
            r.payoutPerTshareHEX ?? r.payoutPerTshare ?? r.payout_per_tshare_hex;
        const v = typeof vRaw === 'number' ? vRaw : Number(vRaw ?? 0) || 0;

        if (Number.isFinite(d) && d >= 0) {
            pps[d] = v;
            if (d > lastKnownDay) lastKnownDay = d;
        }
    }

    // Fill any holes with 0 (unlikely)
    for (let i = 0; i <= lastKnownDay; i++) if (typeof pps[i] !== 'number') pps[i] = 0;

    // HDS "current day" is the last row day; if absent, fallback to array length
    const currentDay = lastKnownDay || rows.length;
    return { pps, currentDay };
}

/**
 * Compute Yield % for a single stake using HEXDailyStats (PulseChain by default)
 * @param {'pls'|'eth'} chain
 * @param {object} stake - expects: stakeShares, stakedHearts, lockedDay, stakedDays, unlockedDay?
 * @param {number} [uiDayCounter] - optional UI baseline "Day ####" (10:00 AEST). If omitted, uses HDS current day.
 * @returns {Promise<number>} yield percentage (0..100+)
 */
export async function calcStakeYieldPctHDS(chain = 'pls', stake, uiDayCounter) {
    if (!stake) return 0;

    const rows = await fetchHDS(chain);
    const { pps, currentDay: hdsDay } = extractPpsAndDay(rows);

    const locked = Number(stake.lockedDay || 0);
    const stakedDays = Number(stake.stakedDays || 0);
    const maturity = locked + stakedDays;

    // Decide end of served period
    const today = Number.isFinite(uiDayCounter) ? uiDayCounter : hdsDay;
    const until = Math.min(maturity, today);

    if (!pps.length || until <= locked) return 0;

    // Sum payouts for [locked, until)
    let sumPps = 0;
    for (let d = locked; d < until && d < pps.length; d++) sumPps += pps[d] || 0;

    const tShares = Number(stake.stakeShares || 0) / SHARES_PER_TSHARE;
    const principalHEX = Number(stake.stakedHearts || 0) / HEARTS_PER_HEX;

    const interestHEX = tShares * sumPps;
    const pct = (interestHEX / (principalHEX || 1)) * 100;
    return Number.isFinite(pct) ? pct : 0;
}

/** Optional: expose HDS day to drive your Day chip (for cross-check) */
export async function getHexDayFromHDS(chain = 'pls') {
    const rows = await fetchHDS(chain);
    const { currentDay } = extractPpsAndDay(rows);
    return currentDay;
}

// ---- Small in-memory result cache for per-stake yield (avoid recompute in table) ----
const yMem = new Map(); // key -> number
function keyFor(stake, chain) {
    const id = stake.stakeId ?? `${stake.lockedDay}-${stake.stakedDays}-${stake.stakeShares}`;
    return `${chain}:${id}:${stake.stakedHearts}`;
}
export async function getCachedYieldPct(chain, stake, uiDayCounter) {
    const key = keyFor(stake, chain);
    if (yMem.has(key)) return yMem.get(key);
    const v = await calcStakeYieldPctHDS(chain, stake, uiDayCounter);
    yMem.set(key, v);
    return v;
}
