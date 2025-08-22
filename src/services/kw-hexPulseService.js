// src/services/kw-hexPulseService.js
import { ethers } from 'ethers';

// ---- Configuration ----
const PULSE_RPC =
    import.meta.env.VITE_PLS_RPC_URL ||
    'https://rpc.pulsechain.com';

const HEX_PLS_ADDRESS =
    import.meta.env.VITE_PLS_HEX_ADDRESS ||
    ''; // REQUIRED: set in .env

// Minimal ABI (+ currentDay + dailyData)
const HEX_ABI = [
    'function stakeCount(address) view returns (uint256)',
    'function stakeLists(address staker, uint256 index) view returns (uint40 stakeId, uint72 stakedHearts, uint72 stakeShares, uint16 lockedDay, uint16 stakedDays, uint40 unlockedDay, bool isAutoStake)',
    'function currentDay() view returns (uint256)',
    // Returns at least (payoutTotal, stakeSharesTotal, unclaimedSatoshisTotal) for that day index
    'function dailyData(uint256) view returns (uint256 payoutTotal, uint256 stakeSharesTotal, uint256 unclaimedSatoshisTotal)'
];

const HEARTS_DECIMALS = 1e8;
const TSHARE_DIVISOR = 1e12;

// ---------------- Cache helpers (localStorage) ----------------
// Cache payload now supports both active + ended stakes:
// { updatedAt, currentDay, rows, rowsEnded, payoutPerTShareDailyHex? }
const LS_NS = 'kw:hexstakes:pls:v1';

// Separate chain-level DPO cache (for quick reads before stake cache refresh)
const LS_DPO_KEY = 'kw:hexDpo:pulse:v1';
const LS_DPO_AT = 'kw:hexDpo:pulse:at:v1';

function keyFor(addresses = []) {
    const addrs = (addresses || [])
        .map(a => (a || '').toLowerCase())
        .filter(Boolean)
        .sort()
        .join(',');
    return `${LS_NS}:${HEX_PLS_ADDRESS}:${addrs}`;
}

export function readHexStakesCache(addresses = []) {
    try {
        const raw = localStorage.getItem(keyFor(addresses));
        return raw ? JSON.parse(raw) : null; // { updatedAt, currentDay, rows, rowsEnded?, payoutPerTShareDailyHex? }
    } catch {
        return null;
    }
}

export function writeHexStakesCache(addresses = [], payload) {
    try {
        localStorage.setItem(
            keyFor(addresses),
            JSON.stringify({
                updatedAt: Date.now(),
                ...(payload || {})
            })
        );
    } catch { }
}

// Keep storage tidy (optional)
function pruneOldCaches(max = 8) {
    try {
        const keys = Object.keys(localStorage).filter(k => k.startsWith(LS_NS));
        if (keys.length <= max) return;
        // naive prune: just remove oldest by updatedAt field
        const items = keys.map(k => {
            try { return { k, t: JSON.parse(localStorage.getItem(k)).updatedAt || 0 }; }
            catch { return { k, t: 0 }; }
        });
        items.sort((a, b) => a.t - b.t).slice(0, Math.max(0, items.length - max))
            .forEach(({ k }) => localStorage.removeItem(k));
    } catch { }
}
// ----------------------------------------------------------------

function getContract() {
    if (!HEX_PLS_ADDRESS) {
        throw new Error('HEX PulseChain contract address is not set. Define VITE_PLS_HEX_ADDRESS in .env');
    }
    const provider = new ethers.providers.JsonRpcProvider(PULSE_RPC);
    return new ethers.Contract(HEX_PLS_ADDRESS, HEX_ABI, provider);
}

function toNumber(bn) {
    try { return Number(bn.toString()); } catch { return Number(bn); }
}

/** Live: fetch all stakes for a single address (active + ended mixed) */
export async function fetchHexStakesForAddress(address) {
    const hex = getContract();

    const countBN = await hex.stakeCount(address);
    const count = Number(countBN || 0);
    const rows = [];
    for (let i = 0; i < count; i++) {
        const s = await hex.stakeLists(address, i);
        const stakeId = Number(s.stakeId);
        const stakedHearts = toNumber(s.stakedHearts);
        const stakeShares = toNumber(s.stakeShares);
        const lockedDay = Number(s.lockedDay);
        const stakedDays = Number(s.stakedDays);
        const unlockedDay = Number(s.unlockedDay);
        const isAutoStake = Boolean(s.isAutoStake);

        rows.push({
            id: `${address}-${stakeId}-${i}`,
            wallet: address,
            stakeIndex: i,
            stakeId,
            principalHex: stakedHearts / HEARTS_DECIMALS,
            tShares: stakeShares / TSHARE_DIVISOR,
            lockedDay,
            stakedDays,
            unlockedDay,
            isAutoStake
        });
    }
    return rows;
}

/** Live: fetch all stakes for many addresses (returns flat array of all stakes) */
export async function fetchHexStakesPulse(addresses = []) {
    const all = [];
    for (const a of addresses) {
        try {
            const rows = await fetchHexStakesForAddress(a);
            all.push(...rows);
        } catch (err) {
            console.error('HEX stake fetch failed for', a, err);
            all.push({
                id: `${a}-error`,
                wallet: a,
                error: (err && err.message) || String(err)
            });
        }
    }
    return all;
}

/** Live: current HEX day from contract */
export async function fetchHexCurrentDay() {
    const hex = getContract();
    const d = await hex.currentDay();
    return Number(d);
}

// ----------------------- Pulse DPO (HEX/T-Share/day) -----------------------
// payoutPerTShareHex = (payoutTotalHearts * 1e12 / stakeSharesTotal) / 1e8
//                     = payoutTotalHearts * 1e4 / stakeSharesTotal
// We keep 6 decimal precision via integer math, then return Number.
export async function fetchPulseDpoHex() {
    const hex = getContract();
    const day = await hex.currentDay();
    const dayNum = Number(day);
    if (!Number.isFinite(dayNum) || dayNum <= 0) return 0;

    // Yesterday's daily data
    const dd = await hex.dailyData(dayNum - 1);
    // The ABI names might not always be present; grab the first two outputs regardless.
    const payoutTotal = dd?.payoutTotal ?? dd?.[0] ?? 0;
    const stakeSharesTotal = dd?.stakeSharesTotal ?? dd?.[1] ?? 0;

    const payoutBN = ethers.BigNumber.from(payoutTotal);
    const sharesBN = ethers.BigNumber.from(stakeSharesTotal);

    if (sharesBN.isZero()) return 0;

    // Multiply by 1e4 to convert hearts/share to HEX/T-Share; keep 6 extra decimals for precision.
    const scaled = payoutBN.mul(10000).mul(1_000_000); // *1e10 overall
    const perTshareMicro = scaled.div(sharesBN);       // micro-HEX per T-Share
    const dpo = Number(perTshareMicro.toString()) / 1_000_000; // back to HEX
    // cache (chain-level)
    try {
        localStorage.setItem(LS_DPO_KEY, JSON.stringify({ dpo }));
        localStorage.setItem(LS_DPO_AT, String(Date.now()));
    } catch { }
    return dpo;
}

export function readPulseDpoHexCache(maxAgeMs = 10 * 60 * 1000) {
    try {
        const raw = localStorage.getItem(LS_DPO_KEY);
        const at = Number(localStorage.getItem(LS_DPO_AT) || '0');
        if (!raw || !at) return null;
        if (Date.now() - at > maxAgeMs) return null;
        const { dpo } = JSON.parse(raw);
        return (typeof dpo === 'number' && isFinite(dpo)) ? dpo : null;
    } catch {
        return null;
    }
}

export async function getPulseDpoHex({ preferCache = true } = {}) {
    if (preferCache) {
        const cached = readPulseDpoHexCache();
        if (cached != null) {
            // silent refresh
            fetchPulseDpoHex().catch(() => { });
            return cached;
        }
    }
    try {
        return await fetchPulseDpoHex();
    } catch {
        const cached = readPulseDpoHexCache(Number.MAX_SAFE_INTEGER);
        return cached != null ? cached : 0;
    }
}
// ---------------------------------------------------------------------------

/** Convenience: fetch and write cache in one go
 *  Now returns both active and ended stakes, plus the chain-level DPO:
 *  { currentDay, rows, rowsEnded, payoutPerTShareDailyHex }
 */
export async function refreshHexStakesAndCache(addresses = [], onProgress) {
    const cd = await fetchHexCurrentDay();

    const batchSize = 3;
    const all = [];
    for (let i = 0; i < addresses.length; i += batchSize) {
        const part = await fetchHexStakesPulse(addresses.slice(i, i + batchSize));
        all.push(...part);
        if (onProgress) onProgress(Math.min(i + batchSize, addresses.length), addresses.length);
    }

    const rows = all.filter(r => !r.error && (Number(r.unlockedDay) || 0) === 0);   // Active
    const rowsEnded = all.filter(r => !r.error && (Number(r.unlockedDay) || 0) > 0); // Ended

    // Try to fetch DPO; fall back to any cached value.
    let dpoHex = 0;
    try {
        dpoHex = await fetchPulseDpoHex();
    } catch {
        const cached = readPulseDpoHexCache(Number.MAX_SAFE_INTEGER);
        if (cached != null) dpoHex = cached;
    }

    const payload = { currentDay: cd, rows, rowsEnded, payoutPerTShareDailyHex: dpoHex };
    writeHexStakesCache(addresses, payload);
    pruneOldCaches();
    return payload;
}
