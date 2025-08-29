/**
 * AI Snapshot service (shim).
 * - Provides the named export `aiSnapshotUpdatePortfolio` expected by Portfolio.jsx.
 * - Stores a minimal snapshot to localStorage (browser only), so the UI can read it later.
 * - Safe no-ops on server/build.
 *
 * Shape we persist (best-effort):
 * {
 *   totalUsd: number,
 *   chains: string[],                  // e.g., ['eth','pulse','base']
 *   assets: [                          // collapsed per-token
 *     { chain, address|null, symbol, amount, valueUsd, priceUsd }
 *   ],
 *   updatedAt: number
 * }
 */

const LS_KEY = 'kw:ai:snapshot';

function emptySnapshot() {
    return {
        totalUsd: 0,
        chains: [],
        assets: [],
        updatedAt: Date.now()
    };
}

/** Internal: summarise chain list from assets */
function summariseChains(assets) {
    const set = new Set();
    for (const a of assets || []) {
        const c = String(a?.chain || '').toLowerCase();
        if (c) set.add(c);
    }
    return Array.from(set.values());
}

/** Internal: normalise a token row into the compact asset shape we store */
function normAsset(row = {}) {
    const chain = String(row.chain || row.network || '').toLowerCase();
    const address =
        (row.address || row.contract || (String(row.symbol || '').toUpperCase() === 'PLS' ? 'native' : '')) || null;
    const symbol = String(row.symbol || row.ticker || '').toUpperCase();
    const amount = Number(row.amount ?? row.balance ?? 0) || 0;
    const valueUsd = Number(row.valueUsd ?? row.usd ?? row.totalUsd ?? 0) || 0;
    const priceUsd = Number(row.priceUsd ?? row.price ?? (amount > 0 ? valueUsd / amount : 0)) || 0;
    return { chain, address, symbol, amount, valueUsd, priceUsd };
}

/** Internal: build a snapshot from a flexible set of args */
function buildSnapshotFromArgs(arg1, arg2) {
    // Case A: already a snapshot-like object
    if (arg1 && typeof arg1 === 'object' && !Array.isArray(arg1) && (arg1.assets || arg1.tokens)) {
        const assetsRaw = arg1.assets || arg1.tokens || [];
        const assets = assetsRaw.map(normAsset);
        const totalUsd =
            Number(arg1.totalUsd) ||
            assets.reduce((a, r) => a + (Number(r.valueUsd) || 0), 0);
        return {
            totalUsd,
            assets,
            chains: summariseChains(assets),
            updatedAt: Date.now()
        };
    }

    // Case B: first arg is an array of tokens, second optional arg totalUsd
    if (Array.isArray(arg1)) {
        const assets = arg1.map(normAsset);
        const totalUsd =
            Number(arg2) ||
            assets.reduce((a, r) => a + (Number(r.valueUsd) || 0), 0);
        return {
            totalUsd,
            assets,
            chains: summariseChains(assets),
            updatedAt: Date.now()
        };
    }

    // Fallback
    return emptySnapshot();
}

/**
 * MAIN: update the snapshot (persist to localStorage in the browser).
 * Accepts either:
 *   - aiSnapshotUpdatePortfolio({ totalUsd, assets|tokens: [...] })
 *   - aiSnapshotUpdatePortfolio(tokensArray, totalUsd?)
 * Returns the snapshot object we stored.
 */
export function aiSnapshotUpdatePortfolio(arg1, arg2) {
    const snap = buildSnapshotFromArgs(arg1, arg2);
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(LS_KEY, JSON.stringify(snap));
        }
    } catch {
        /* ignore storage errors */
    }
    return snap;
}

/** Read the last stored snapshot (browser only). */
export function aiSnapshotReadPortfolio() {
    try {
        if (typeof window === 'undefined' || !window.localStorage) return emptySnapshot();
        const raw = window.localStorage.getItem(LS_KEY);
        if (!raw) return emptySnapshot();
        const obj = JSON.parse(raw);
        return {
            totalUsd: Number(obj?.totalUsd) || 0,
            chains: Array.isArray(obj?.chains) ? obj.chains : summariseChains(obj?.assets || []),
            assets: Array.isArray(obj?.assets) ? obj.assets.map(normAsset) : [],
            updatedAt: Number(obj?.updatedAt) || Date.now()
        };
    } catch {
        return emptySnapshot();
    }
}

/** Legacy default export (kept for compatibility) — returns an empty snapshot. */
export default async function aiSnapshot(/* ...args */) {
    return emptySnapshot();
}

/** Optional helpers some codepaths might import */
export async function getLiveSnapshot(/* options */) {
    return aiSnapshotReadPortfolio();
}
export async function getAiSnapshot(/* options */) {
    return aiSnapshotReadPortfolio();
}
export async function buildSnapshot(/* wallets */) {
    return emptySnapshot();
}

/** Bag export (compat) */
export const aiSnapshotService = {
    aiSnapshotUpdatePortfolio,
    aiSnapshotReadPortfolio,
    getLiveSnapshot,
    getAiSnapshot,
    buildSnapshot
};
