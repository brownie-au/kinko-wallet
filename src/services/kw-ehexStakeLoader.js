// src/services/kw-ehexStakeLoader.js
// Clean, checksum-safe loader for HEX stakes on Ethereum (eHEX), with caching & RPC failover.
// Self-contained. Wire from your views/contexts when ready.

import { ethers } from 'ethers';

/* ------------------------------- Registry ------------------------------- */
const REGISTRY = {
    ethereum: {
        label: 'Ethereum',
        rpcUrls: [
            import.meta.env.VITE_ETH_RPC_URL || 'https://eth.llamarpc.com'
        ],
        // Canonical eHEX (EIP-55 exact)
        hexAddress: '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39'
    }
};

/* ------------------------------- ABI ------------------------------------ */
const HEX_ABI = [
    'function stakeCount(address) view returns (uint256)',
    'function stakeLists(address staker, uint256 index) view returns (uint40 stakeId, uint72 stakedHearts, uint72 stakeShares, uint16 lockedDay, uint16 stakedDays, uint40 unlockedDay, bool isAutoStake)',
    'function currentDay() view returns (uint256)'
];

const HEARTS_PER_HEX = 1e8;
const SHARES_PER_TSHARE = 1e12;

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min
const LS_KEY = 'kw:ehex:stakes:v1';

/* ------------------------------ Utilities ------------------------------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normaliseAddress(input) {
    const raw = String(input || '').trim();

    // Strip zero-width & whitespace noise that sometimes sneaks in from copy/paste.
    const cleaned = raw.replace(/[\u200B-\u200D\uFEFF\s]/g, '');

    // Lowercase so ethers will accept both lowercase and proper EIP-55.
    const lower = cleaned.toLowerCase();

    if (!ethers.utils.isAddress(lower)) {
        throw new Error(`Invalid address: ${input}`);
    }
    return ethers.utils.getAddress(lower); // returns checksummed form
}

function getConfig() {
    const cfg = REGISTRY.ethereum;
    if (!cfg?.hexAddress) throw new Error('eHEX contract address missing');
    // Double-check contract address is valid & checksummed
    cfg.hexAddress = normaliseAddress(cfg.hexAddress);
    return cfg;
}

async function makeProvider(rpcUrls) {
    let lastErr;
    for (const url of rpcUrls) {
        try {
            const p = new ethers.providers.StaticJsonRpcProvider(url);
            await p.getNetwork(); // warmup/ping
            return p;
        } catch (e) {
            lastErr = e;
            await sleep(100);
        }
    }
    throw lastErr || new Error('All ETH RPCs failed');
}

async function getContract() {
    const { rpcUrls, hexAddress } = getConfig();
    const provider = await makeProvider(rpcUrls);
    return { contract: new ethers.Contract(hexAddress, HEX_ABI, provider), provider };
}

/* ------------------------------- Cache ---------------------------------- */
const keyFor = (addr) => `${LS_KEY}:${addr}`;

function readCache(addr) {
    try {
        const s = localStorage.getItem(keyFor(addr));
        if (!s) return null;
        const j = JSON.parse(s);
        if (!j || !j.ts || Date.now() - j.ts > CACHE_TTL_MS) return null;
        return j.payload || null;
    } catch {
        return null;
    }
}
function writeCache(addr, payload) {
    try {
        localStorage.setItem(keyFor(addr), JSON.stringify({ ts: Date.now(), payload }));
    } catch {
        /* ignore quota */
    }
}

/* -------------------------- Concurrency helper -------------------------- */
async function mapWithLimit(items, limit, task) {
    const out = new Array(items.length);
    let i = 0;
    const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
        while (i < items.length) {
            const idx = i++;
            out[idx] = await task(items[idx], idx);
        }
    });
    await Promise.all(workers);
    return out;
}

/* ------------------------------- Fetchers -------------------------------- */
async function fetchStakeCount(c, user) {
    const n = await c.stakeCount(user);
    return Number(n || 0);
}
async function fetchStake(c, user, index) {
    const t = await c.stakeLists(user, index);
    return {
        stakeId: Number(t.stakeId),
        stakedHearts: Number(t.stakedHearts),
        stakeShares: Number(t.stakeShares),
        lockedDay: Number(t.lockedDay),
        stakedDays: Number(t.stakedDays),
        unlockedDay: Number(t.unlockedDay),
        isAutoStake: !!t.isAutoStake
    };
}

/* --------------------------------- API ---------------------------------- */
/**
 * Load eHEX stakes for one or more addresses on Ethereum.
 * @param {Object} opts
 * @param {string[]} opts.addresses
 * @param {boolean} [opts.forceRefresh=false]
 * @returns {Promise<{ byAddress: Record<string, any[]>, meta: { chain: 'ethereum', currentDay: number } }>}
 */
export async function loadEhexStakes({ addresses = [], forceRefresh = false } = {}) {
    if (!Array.isArray(addresses) || addresses.length === 0) {
        return { byAddress: {}, meta: { chain: 'ethereum', currentDay: 0 } };
    }

    // Clean & checksum all user addresses up front
    const users = addresses.map(normaliseAddress);

    const { contract } = await getContract();
    const currentDayBN = await contract.currentDay().catch(() => ethers.BigNumber.from(0));
    const currentDay = Number(currentDayBN || 0);

    const byAddress = {};

    // Handle addresses with moderate parallelism (2 at a time)
    await mapWithLimit(users, 2, async (addr) => {
        // Cache
        const cached = !forceRefresh ? readCache(addr) : null;
        if (cached && Array.isArray(cached)) {
            byAddress[addr] = cached;
            return;
        }

        const count = await fetchStakeCount(contract, addr);
        if (!count) {
            byAddress[addr] = [];
            writeCache(addr, []);
            return;
        }

        const idxs = Array.from({ length: count }, (_, i) => i);
        // Pull stakes with a small concurrency cap to keep UI responsive
        const raw = await mapWithLimit(idxs, 4, (i) => fetchStake(contract, addr, i));

        const enriched = raw.map((s) => ({
            ...s,
            stakedHEX: s.stakedHearts / HEARTS_PER_HEX,
            stakeTShares: s.stakeShares / SHARES_PER_TSHARE,
            endDay: s.lockedDay + s.stakedDays,
            daysRemaining: Math.max(0, (s.lockedDay + s.stakedDays) - currentDay)
        }));

        byAddress[addr] = enriched;
        writeCache(addr, enriched);
    });

    return { byAddress, meta: { chain: 'ethereum', currentDay } };
}

/**
 * Convenience single-address helper.
 */
export async function loadEhexStakesFor(address, forceRefresh = false) {
    const norm = normaliseAddress(address);
    const { byAddress, meta } = await loadEhexStakes({ addresses: [norm], forceRefresh });
    return { stakes: byAddress[norm] || [], meta };
}
