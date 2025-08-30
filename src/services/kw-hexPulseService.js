// src/services/kw-hexPulseService.js
import { ethers } from 'ethers';
import { cleanHexAddress, checksumUserAddress, isBenignStakeRevert } from './hexShared';

/* -------------------------------------------------------------------------- */
/* Endpoints                                                                  */
/* -------------------------------------------------------------------------- */
const PLS_RPC_LIST = [
    import.meta.env.VITE_PLS_RPC_URL,
    'https://rpc.pulsechain.com',
    'https://pulsechain.publicnode.com',
    'https://pulsechain-rpc.publicnode.com'
].filter(Boolean);

const ETH_RPC_LIST = [
    import.meta.env.VITE_ETH_RPC_URL,
    'https://cloudflare-eth.com',
    'https://rpc.ankr.com/eth',
    'https://eth.llamarpc.com'
].filter(Boolean);

// Addresses (Pulse required via env; ETH has a safe default for cross‑chain reads)
const HEX_PLS_ADDRESS = (import.meta.env.VITE_PLS_HEX_ADDRESS || '').trim();
const HEX_ETH_ADDRESS = (import.meta.env.VITE_ETH_HEX_ADDRESS || '0x2b591e99aFe9f32eaa6214f7B7629768c40eEb39').trim();

const DEFAULTS = { chain: 'pulse', rpcUrl: null, hexAddress: HEX_PLS_ADDRESS };

/* -------------------------------------------------------------------------- */
/* ABI (unified with eHEX)                                                    */
/* -------------------------------------------------------------------------- */
const HEX_ABI = [
    'function stakeCount(address) view returns (uint256)',
    'function stakeLists(address,uint256) view returns (uint40,uint72,uint72,uint16,uint16,uint16,bool)',
    'function currentDay() view returns (uint256)',
    'function dailyData(uint256) view returns (uint256,uint256,uint256)'
];

const HEARTS_DECIMALS = 1e8;
const TSHARE_DIVISOR = 1e12;

/* -------------------------------------------------------------------------- */
/* Cache helpers                                                              */
/* -------------------------------------------------------------------------- */
const LS_NS_NEW = 'kw:hexstakes:v1';
const LS_NS_LEGACY = 'kw:hexstakes:pls:v1';

function dpoKeys(chain) {
    const c = String(chain || DEFAULTS.chain).toLowerCase();
    return { val: `kw:hexDpo:${c}:v1`, at: `kw:hexDpo:${c}:at:v1` };
}

function keyForNew(addresses = [], cfg = {}) {
    const chain = String(cfg?.chain || DEFAULTS.chain).toLowerCase();
    const hexAddr = String(cfg?.hexAddress || DEFAULTS.hexAddress || '').toLowerCase();
    const addrs = (addresses || []).map(a => (a || '').toLowerCase()).filter(Boolean).sort().join(',');
    return `${LS_NS_NEW}:${chain}:${hexAddr}:${addrs}`;
}
function keyForLegacyPulse(addresses = []) {
    const addrs = (addresses || []).map(a => (a || '').toLowerCase()).filter(Boolean).sort().join(',');
    return `${LS_NS_LEGACY}:${(HEX_PLS_ADDRESS || '').toLowerCase()}:${addrs}`;
}

function readLS(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } }
function writeLS(key, obj) { try { localStorage.setItem(key, JSON.stringify(obj)); } catch { } }

function pruneOldCaches(max = 12) {
    try {
        const keys = Object.keys(localStorage).filter(k => k.startsWith(LS_NS_NEW) || k.startsWith(LS_NS_LEGACY));
        if (keys.length <= max) return;
        const items = keys.map(k => { try { return { k, t: JSON.parse(localStorage.getItem(k)).updatedAt || 0 }; } catch { return { k, t: 0 }; } });
        items.sort((a, b) => a.t - b.t).slice(0, Math.max(0, items.length - max)).forEach(({ k }) => localStorage.removeItem(k));
    } catch { }
}

/* -------------------------------------------------------------------------- */
/* Public cache API                                                           */
/* -------------------------------------------------------------------------- */
export function readHexStakesCache(addresses = [], cfg) {
    const fromNew = readLS(keyForNew(addresses, cfg));
    if (fromNew) return fromNew;
    const chain = String(cfg?.chain || DEFAULTS.chain).toLowerCase();
    if (chain === 'pulse') {
        const fromLegacy = readLS(keyForLegacyPulse(addresses));
        if (fromLegacy) return fromLegacy;
    }
    return null;
}
export function writeHexStakesCache(addresses = [], payload, cfg) {
    const stamped = { updatedAt: Date.now(), ...(payload || {}) };
    writeLS(keyForNew(addresses, cfg), stamped);
    if (String(cfg?.chain || DEFAULTS.chain).toLowerCase() === 'pulse') {
        writeLS(keyForLegacyPulse(addresses), stamped);
    }
}

/* -------------------------------------------------------------------------- */
/* Providers / Contracts (shared pattern with eHEX)                           */
/* -------------------------------------------------------------------------- */
function makeFallbackProvider(rpcs, chainId, name) {
    const statics = rpcs.map((url, i) =>
        new ethers.providers.StaticJsonRpcProvider({ url, timeout: 8000 }, { chainId, name })
    );
    const configs = statics.map((p, i) => ({ provider: p, priority: i + 1, weight: (statics.length - i) * 2 }));
    return new ethers.providers.FallbackProvider(configs, 1);
}

function isNetworkish(err) {
    const m = `${err?.code || ''} ${err?.message || ''}`.toLowerCase();
    return err?.code === 'NETWORK_ERROR' || /network|timeout|fetch|503|502|bad gateway|temporarily unavailable/i.test(m);
}

function resolvedConfig(cfg) {
    const chain = String(cfg?.chain || DEFAULTS.chain).toLowerCase();
    if (chain === 'ethereum') {
        return {
            chain,
            provider: makeFallbackProvider(ETH_RPC_LIST, 1, 'homestead'),
            hexAddress: cleanHexAddress(cfg?.hexAddress || HEX_ETH_ADDRESS, 'HEX (ETH) contract')
        };
    }
    return {
        chain: 'pulse',
        provider: makeFallbackProvider(PLS_RPC_LIST, 369, 'pulsechain'),
        hexAddress: cleanHexAddress(cfg?.hexAddress || HEX_PLS_ADDRESS, 'HEX (Pulse) contract')
    };
}

function getContract(cfg) {
    const rc = resolvedConfig(cfg);
    const hex = new ethers.Contract(rc.hexAddress, HEX_ABI, rc.provider);
    return { hex, rc };
}

function toNumber(bn) { try { return Number(bn?.toString?.() ?? bn); } catch { return Number(bn); } }

/* -------------------------------------------------------------------------- */
/* Chain‑agnostic stake fetchers                                              */
/* -------------------------------------------------------------------------- */
export async function fetchHexStakesForAddress(address, cfg) {
    const { hex, rc } = getContract(cfg);
    const wallet = checksumUserAddress(address);

    // Read stakeCount safely; downgrade benign reverts to 0
    let count = 0;
    try {
        const c = await hex.stakeCount(wallet);
        count = Number(c || 0);
    } catch (e) {
        if (!isBenignStakeRevert(e)) {
            throw new Error(`Failed to read stake count for ${wallet} on ${rc.chain === 'pulse' ? 'PulseChain' : 'Ethereum'}: ${prettyNetHint(e, rc.chain)}`);
        }
        count = 0;
    }

    if (count === 0) return [];

    // Fetch each index; skip per‑index reverts quietly
    const calls = Array.from({ length: count }, (_, i) =>
        hex.stakeLists(wallet, i).then(
            (s) => ({ ok: true, s, i }),
            (e) => ({ ok: false, e, i })
        )
    );
    const results = await Promise.all(calls);

    const ok = results.filter(r => r.ok);
    return ok.map(({ s, i }) => {
        const stakeId = toNumber(s?.[0]);
        const stakedHearts = toNumber(s?.[1]);
        const stakeShares = toNumber(s?.[2]);
        const lockedDay = toNumber(s?.[3]);
        const stakedDays = toNumber(s?.[4]);
        const unlockedDay = toNumber(s?.[5]);
        const isAutoStake = Boolean(s?.[6]);

        return {
            id: `${wallet}-${stakeId}-${i}`,
            wallet,
            stakeIndex: i,
            stakeId,
            principalHex: stakedHearts / HEARTS_DECIMALS,
            tShares: stakeShares / TSHARE_DIVISOR,
            lockedDay,
            stakedDays,
            unlockedDay,
            isAutoStake
        };
    });
}

export async function fetchHexStakesPulse(addresses = [], cfg) {
    const all = [];
    for (const a of (addresses || [])) {
        try {
            const rows = await fetchHexStakesForAddress(a, cfg);
            all.push(...rows);
        } catch (err) {
            // Network/config errors only; benign reverts are handled upstream
            console.error('HEX stake fetch failed for', a, err);
            all.push({ id: `${a}-error`, wallet: a, error: err?.message || String(err) });
        }
    }
    return all;
}

export async function fetchHexCurrentDay(cfg) {
    const { hex, rc } = getContract(cfg);
    try {
        const d = await hex.currentDay();
        return Number(d);
    } catch (err) {
        throw new Error(`Failed to read current HEX day on ${rc.chain === 'pulse' ? 'PulseChain' : 'Ethereum'}: ${prettyNetHint(err, rc.chain)}`);
    }
}

/* -------------------------------------------------------------------------- */
/* DPO helpers (payoutPerTshare)                                              */
/* -------------------------------------------------------------------------- */
export async function fetchPulseDpoHex(cfg) {
    const { hex, rc } = getContract(cfg);
    try {
        const dayNum = Number(await hex.currentDay());
        if (!Number.isFinite(dayNum) || dayNum <= 0) { cacheDpo(rc.chain, 0); return 0; }

        const dd = await hex.dailyData(dayNum - 1);
        const payoutTotal = toNumber(dd?.[0]);
        const stakeSharesTotal = toNumber(dd?.[1]);
        if (!stakeSharesTotal) { cacheDpo(rc.chain, 0); return 0; }

        const payoutBN = ethers.BigNumber.from(payoutTotal);
        const sharesBN = ethers.BigNumber.from(stakeSharesTotal);
        const perTshare = payoutBN.mul(10_000_000).div(sharesBN); // scale 1e7
        const dpo = Number(perTshare.toString()) / 10_000_000;

        cacheDpo(rc.chain, dpo);
        return dpo;
    } catch (err) {
        throw new Error(`Failed to read daily payout on ${rc.chain === 'pulse' ? 'PulseChain' : 'Ethereum'}: ${prettyNetHint(err, rc.chain)}`);
    }
}

function cacheDpo(chain, dpo) {
    try {
        const { val, at } = dpoKeys(chain);
        localStorage.setItem(val, JSON.stringify({ dpo }));
        localStorage.setItem(at, String(Date.now()));
    } catch { }
}
export function readPulseDpoHexCache(maxAgeMs = 10 * 60 * 1000, cfg) {
    try {
        const chain = String(cfg?.chain || DEFAULTS.chain).toLowerCase();
        const { val, at } = dpoKeys(chain);
        const raw = localStorage.getItem(val);
        const ts = Number(localStorage.getItem(at) || '0');
        if (!raw || !ts) return null;
        if (Date.now() - ts > maxAgeMs) return null;
        const { dpo } = JSON.parse(raw);
        return typeof dpo === 'number' && isFinite(dpo) ? dpo : null;
    } catch { return null; }
}
export async function getPulseDpoHex({ preferCache = true } = {}, cfg) {
    if (preferCache) {
        const cached = readPulseDpoHexCache(undefined, cfg);
        if (cached != null) { fetchPulseDpoHex(cfg).catch(() => { }); return cached; }
    }
    try { return await fetchPulseDpoHex(cfg); }
    catch {
        const cached = readPulseDpoHexCache(Number.MAX_SAFE_INTEGER, cfg);
        return cached != null ? cached : 0;
    }
}

/* -------------------------------------------------------------------------- */
/* Main refresh                                                               */
/* -------------------------------------------------------------------------- */
export async function refreshHexStakesAndCache(addresses = [], onProgress, cfg) {
    const rc = resolvedConfig(cfg);
    const batchSize = 3;
    const progress = (done) => onProgress && onProgress(Math.min(done, addresses.length), addresses.length);

    // 1) Current day (show banner if network borks)
    const cd = await fetchHexCurrentDay(rc);

    // 2) Stakes (benign reverts are already downgraded to empty)
    const all = [];
    for (let i = 0; i < addresses.length; i += batchSize) {
        const part = await fetchHexStakesPulse(addresses.slice(i, i + batchSize), rc);
        all.push(...part);
        progress(i + batchSize);
    }

    const rows = all.filter(r => !r.error && (Number(r.unlockedDay) || 0) === 0);
    const rowsEnded = all.filter(r => !r.error && (Number(r.unlockedDay) || 0) > 0);

    // 3) DPO (Pulse only); ETH path returns 0 (your UI can use HDS for ETH)
    let dpoHex = 0;
    if (rc.chain === 'pulse') {
        try { dpoHex = await fetchPulseDpoHex(rc); }
        catch {
            const cached = readPulseDpoHexCache(Number.MAX_SAFE_INTEGER, rc);
            if (cached != null) dpoHex = cached;
        }
    }

    const payload = { currentDay: cd, rows, rowsEnded, payoutPerTShareDailyHex: dpoHex };
    writeHexStakesCache(addresses, payload, rc);
    pruneOldCaches();
    return payload;
}

/* -------------------------------------------------------------------------- */
function prettyNetHint(err, chain) {
    const m = `${err?.code || ''} ${err?.message || ''}`.toLowerCase();
    if (isNetworkish(err)) {
        const where = chain === 'pulse' ? 'PulseChain' : 'Ethereum';
        return `Network issue (${where}). We tried multiple public RPCs but didn’t get a response in time. Please try again.`;
    }
    if (/invalid address|bad address checksum/i.test(m)) return 'Invalid address format. Please verify the contract and wallet addresses.';
    return err?.message || String(err);
}
