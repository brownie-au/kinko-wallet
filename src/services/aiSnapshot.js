/**
 * Shim for legacy imports from `../../services/aiSnapshot`.
 * This returns an empty live snapshot so the app can build & deploy.
 * Replace with a real implementation later (e.g., from wallet caches).
 */

function emptySnapshot() {
    return {
        totalUsd: 0,
        chains: [],       // e.g., ['eth','pulse','base']
        assets: []        // e.g., [{chain, address, symbol, amount, valueUsd, priceUsd}]
    };
}

/** Legacy default-style usage: `const snap = await aiSnapshot(...);` */
export default async function aiSnapshot(/* ...args */) {
    return emptySnapshot();
}

/** Named helpers (cover common call patterns in existing code) */
export async function getLiveSnapshot(/* options */) {
    return emptySnapshot();
}
export async function getAiSnapshot(/* options */) {
    return emptySnapshot();
}
export async function buildSnapshot(/* wallets */) {
    return emptySnapshot();
}

/** Also export a constant object in case code expects a service bag */
export const aiSnapshotService = {
    getLiveSnapshot,
    getAiSnapshot,
    buildSnapshot
};
