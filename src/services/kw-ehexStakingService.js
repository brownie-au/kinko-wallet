// src/services/kw-ehexStakingService.js
import { ethers } from 'ethers';

/* -------------------------------------------------------------------------- */
/* ENV / ADDRS                                                                */
/* -------------------------------------------------------------------------- */

export const HEX_ETH_ADDRESS =
    (import.meta.env.VITE_ETH_HEX_ADDRESS ||
        '0x2b591e99aFe9F32eaa6214f7B7629768c40eEb39').trim();

function getEthRpcUrls() {
    const urls = [];

    // Preferred keyed provider first (optional)
    if (import.meta.env.VITE_QUICKNODE_HTTP) urls.push(import.meta.env.VITE_QUICKNODE_HTTP);

    // CSV list (preferred)
    const csv =
        import.meta.env.VITE_ETH_RPC_URLS ||
        import.meta.env.VITE_ETHEREUM_RPC_URLS ||
        '';
    if (csv) {
        csv
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .forEach((u) => urls.push(u));
    }

    // Single legacy var
    if (import.meta.env.VITE_ETH_RPC_URL) urls.push(import.meta.env.VITE_ETH_RPC_URL);

    // Public fallbacks (last)
    urls.push(
        'https://eth.llamarpc.com',
        'https://1rpc.io/eth',
        'https://cloudflare-eth.com',
        'https://rpc.ankr.com/eth'
    );

    // De-dupe preserving order
    return Array.from(new Set(urls.filter(Boolean)));
}

/* -------------------------------------------------------------------------- */
/* CACHE                                                                      */
/* -------------------------------------------------------------------------- */

const HEARTS_PER_HEX = 1e8;
const LS_KEY_EHEX_STAKES = 'kw:ehex:stakes:v1';       // { [addr]: Stake[] }
const LS_KEY_EHEX_UPDATED = 'kw:ehex:updatedAt:v1';   // ISO string

const safeJSON = {
    read(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch {
            return fallback;
        }
    },
    write(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch { }
    }
};

/* -------------------------------------------------------------------------- */
/* ETHERS HELPERS                                                             */
/* -------------------------------------------------------------------------- */

const HEX_ABI_MIN = [
    'function stakeCount(address) view returns (uint256)',
    // (stakeId, stakedHearts, stakeShares, lockedDay, stakedDays, unlockedDay, isAutoStake)
    'function stakeLists(address,uint256) view returns (uint40,uint72,uint72,uint16,uint16,uint16,bool)'
];

function cleanHexAddress(addr, label = 'address') {
    const cleaned = String(addr || '')
        .trim()
        .replace(/^["']|["']$/g, '')
        .replace(/[\u200B-\u200D\uFEFF\s]/g, '');
    const lower = cleaned.toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(lower)) {
        throw new Error(`Invalid ${label}. Expected 20-byte hex. Got "${cleaned}".`);
    }
    return lower;
}

function checksumUserAddress(addr) {
    try {
        return ethers.utils.getAddress(addr);
    } catch {
        throw new Error(`Invalid wallet address "${addr}". Please check and try again.`);
    }
}

function isBenignStakeRevert(err) {
    const m = `${err?.reason || ''} ${err?.message || ''}`.toLowerCase();
    return (
        /call_exception/i.test(m) ||
        /missing revert data/i.test(m) ||
        /execution reverted/i.test(m) ||
        /revert/i.test(m)
    );
}
function isNetworkish(err) {
    const m = `${err?.code || ''} ${err?.message || ''}`.toLowerCase();
    return (
        err?.code === 'NETWORK_ERROR' ||
        /network|timeout|fetch|503|502|bad gateway|temporarily unavailable/i.test(m)
    );
}
const toNum = (v) => {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
    }
    const s = v?.toString?.();
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
};

/* Build a pool of Static providers (no auto-detection). */
function buildProviderPool() {
    const urls = getEthRpcUrls();
    return urls.map(
        (url) =>
            new ethers.providers.StaticJsonRpcProvider(
                { url, timeout: 12000 },
                { chainId: 1, name: 'homestead' }
            )
    );
}
function contractFor(provider) {
    const addr = cleanHexAddress(HEX_ETH_ADDRESS, 'eHEX');
    return new ethers.Contract(addr, HEX_ABI_MIN, provider);
}

/* Retry helpers – rotate providers and backoff. */
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function withProvidersRetry(fn, providers, { retries = 6, baseDelay = 120 } = {}) {
    let lastErr = null;
    for (let attempt = 0; attempt < retries; attempt++) {
        const p = providers[attempt % providers.length];
        try {
            return await fn(p);
        } catch (e) {
            lastErr = e;
            if (isBenignStakeRevert(e)) throw e; // propagate as benign
            // network-ish → rotate + backoff
            await sleep(baseDelay * (1 + attempt));
        }
    }
    throw lastErr;
}

async function getStakeCount(addr, providers) {
    try {
        const r = await withProvidersRetry(
            (prov) => contractFor(prov).stakeCount(addr),
            providers,
            { retries: Math.max(3, providers.length) }
        );
        return toNum(r);
    } catch (e) {
        if (isBenignStakeRevert(e)) return 0;
        throw e;
    }
}

async function getStakeAtIndex(addr, i, providers) {
    const r = await withProvidersRetry(
        (prov) => contractFor(prov).stakeLists(addr, i),
        providers,
        { retries: Math.max(3, providers.length * 2) }
    );
    const hearts = toNum(r?.[1] ?? r?.stakedHearts);
    return {
        index: i,
        stakeId: toNum(r?.[0] ?? r?.stakeId),
        stakedHearts: hearts,
        stakedHex: hearts / HEARTS_PER_HEX,
        stakeShares: toNum(r?.[2] ?? r?.stakeShares),
        lockedDay: toNum(r?.[3] ?? r?.lockedDay),
        stakedDays: toNum(r?.[4] ?? r?.stakedDays),
        unlockedDay: toNum(r?.[5] ?? r?.unlockedDay),
        isAutoStake: Boolean(r?.[6] ?? r?.isAutoStake)
    };
}

/* -------------------------------------------------------------------------- */
/* PUBLIC API (same signatures your page already uses)                         */
/* -------------------------------------------------------------------------- */

export function readEhexStakesCache() {
    const byAddr = safeJSON.read(LS_KEY_EHEX_STAKES, {});
    const updatedAt = (() => {
        try {
            return localStorage.getItem(LS_KEY_EHEX_UPDATED) || null;
        } catch {
            return null;
        }
    })();
    return { byAddr, updatedAt };
}

/**
 * Refresh eHEX stakes for the given wallets and persist to cache.
 * Accepts flexible args: ({ wallets, onProgress }), (wallets, onProgress), etc.
 * Returns: { byAddr, updatedAt }
 */
export async function refreshEhexStakesAndCache(arg1, arg2) {
    // Normalize args
    let wallets = [];
    let onProgress = null;

    if (Array.isArray(arg1)) wallets = arg1;
    else if (arg1 && typeof arg1 === 'object') {
        wallets = arg1.wallets || [];
        if (typeof arg1.onProgress === 'function') onProgress = arg1.onProgress;
    } else if (typeof arg1 === 'function') {
        onProgress = arg1;
    }
    if (typeof arg2 === 'function') onProgress = arg2;
    else if (arg2 && typeof arg2 === 'object' && typeof arg2.onProgress === 'function') onProgress = arg2.onProgress;

    wallets = Array.from(
        new Set(
            (wallets || [])
                .map((w) => (typeof w === 'string' ? w : w?.address))
                .filter(Boolean)
                .map(checksumUserAddress)
        )
    );

    const byAddr = {};
    const total = wallets.length;

    if (!total) {
        const updatedAt = new Date().toISOString();
        safeJSON.write(LS_KEY_EHEX_STAKES, byAddr);
        try {
            localStorage.setItem(LS_KEY_EHEX_UPDATED, updatedAt);
        } catch { }
        return { byAddr, updatedAt };
    }

    const providers = buildProviderPool();
    let done = 0;
    let successes = 0;
    let fatalNetwork = null;

    for (const addr of wallets) {
        try {
            // 1) stakeCount with retry/rotation
            const count = await getStakeCount(addr, providers);

            // 2) read each index SEQUENTIALLY with retry/rotation (prevents rate-limit flakiness)
            const stakes = [];
            for (let i = 0; i < count; i++) {
                try {
                    const s = await getStakeAtIndex(addr, i, providers);
                    stakes.push(s);
                } catch (e) {
                    if (isBenignStakeRevert(e)) {
                        // skip a single bad index
                    } else if (isNetworkish(e)) {
                        // give up on this index but keep wallet going
                    } else {
                        // unknown per-index issue: skip but continue
                        // eslint-disable-next-line no-console
                        console.warn(`eHEX index read warning @${addr}[${i}]`, e);
                    }
                }
            }

            byAddr[addr] = stakes;
            successes += 1;
        } catch (e) {
            if (isNetworkish(e)) fatalNetwork = e;
            byAddr[addr] = [];
        } finally {
            done += 1;
            if (typeof onProgress === 'function') {
                try {
                    onProgress(done, total);
                } catch { }
            }
        }
    }

    const updatedAt = new Date().toISOString();
    safeJSON.write(LS_KEY_EHEX_STAKES, byAddr);
    try {
        localStorage.setItem(LS_KEY_EHEX_UPDATED, updatedAt);
    } catch { }

    if (!successes && fatalNetwork) {
        throw new Error(
            'Network issue (Ethereum). Tried multiple RPCs but none responded. Please check your connection and try again.'
        );
    }

    return { byAddr, updatedAt };
}
