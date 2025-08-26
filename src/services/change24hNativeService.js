// src/services/change24hNativeService.js
/* eslint-disable import/no-relative-parent-imports */

export const tokenKey = (t) =>
    `${String(t?.chain || '').toLowerCase()}:${(t?.address || t?.contract || 'native').toLowerCase()}:${(t?.symbol || '').toUpperCase()}`;

// Map your native rows (chain → DefiLlama ID). Adjust if needed.
const NATIVE_LLAMA_IDS = {
    eth: 'coingecko:ethereum',
    ethereum: 'coingecko:ethereum',
    pulse: 'coingecko:pulsechain',
    pls: 'coingecko:pulsechain',
    base: 'coingecko:base',
};

function idsFor(tokens = []) {
    const set = new Set();
    for (const t of tokens) {
        const id = NATIVE_LLAMA_IDS[String(t?.chain || '').toLowerCase()];
        if (id) set.add(id);
    }
    return Array.from(set);
}

async function getPricesNow(ids) {
    if (!ids.length) return {};
    const url = `https://coins.llama.fi/prices/current/${ids.join(',')}`;
    const r = await fetch(url);
    if (!r.ok) return {};
    const j = await r.json();
    return j?.coins || {};
}

async function getPricesAt(ts, ids) {
    if (!ids.length) return {};
    const url = `https://coins.llama.fi/prices/historical/${ts}/${ids.join(',')}`;
    const r = await fetch(url);
    if (!r.ok) return {};
    const j = await r.json();
    return j?.coins || {};
}

/**
 * Returns Map<tokenKey, pct> for native tokens (no contract).
 */
export async function fetchNativeChange24h(tokens) {
    const natives = (tokens || []).filter(t => !(t?.address || t?.contract));
    const out = new Map();
    if (!natives.length) return out;

    const ids = idsFor(natives);
    if (!ids.length) return out;

    const nowTs = Math.floor(Date.now() / 1000);
    const dayAgo = nowTs - 86400;

    try {
        const [nowCoins, oldCoins] = await Promise.all([getPricesNow(ids), getPricesAt(dayAgo, ids)]);
        // Build reverse lookup: llamaId → pct
        const pctById = {};
        for (const id of ids) {
            const now = Number(nowCoins[id]?.price);
            const old = Number(oldCoins[id]?.price);
            if (now > 0 && old > 0) {
                pctById[id] = ((now - old) / old) * 100;
            }
        }

        // Map back to each token
        for (const t of natives) {
            const llamaId = NATIVE_LLAMA_IDS[String(t?.chain || '').toLowerCase()];
            const pct = pctById[llamaId];
            if (Number.isFinite(pct)) out.set(tokenKey(t), pct);
        }
    } catch {
        // ignore failures; leave map empty
    }
    return out;
}
