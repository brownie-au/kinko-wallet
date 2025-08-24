// src/services/kw-priceService.js
import { useEffect, useState, useRef } from 'react';

// ---- Configuration ----
const PULSE_HEX_ADDRESS =
    import.meta.env.VITE_PLS_HEX_ADDRESS ||
    // Keep this overridable via .env; this is the HEX address on PulseChain (same as ETH fork).
    '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39';

const DEXSCREENER_TOKEN_URL = (token) =>
    `https://api.dexscreener.com/latest/dex/tokens/${token}`;

// ---- LocalStorage keys ----
const LS_KEY = 'kw:price:hex:pls:v1';
const DEFAULT_TTL_MS = 60 * 1000; // 60s – snappy UI + frequent background refresh

// ---- Types ----
// Cache shape: { priceUsd: number, updatedAt: number, source: 'dexscreener', pairAddress?: string }

export function readPulseHexUsdCache() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return null;
        const obj = JSON.parse(raw);
        if (!obj || typeof obj.priceUsd !== 'number') return null;
        return obj;
    } catch {
        return null;
    }
}

export function writePulseHexUsdCache(entry) {
    try {
        localStorage.setItem(LS_KEY, JSON.stringify(entry));
    } catch {
        // ignore quota errors
    }
}

/**
 * Fetch latest HEX (PulseChain) price from DexScreener
 * Strategy: pick highest-liquidity PulseChain pair to stabilise price.
 */
export async function fetchPulseHexUsdFromDexscreener() {
    const url = DEXSCREENER_TOKEN_URL(PULSE_HEX_ADDRESS);
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) throw new Error(`DexScreener error ${res.status}`);
    const data = await res.json();

    const pairs = Array.isArray(data?.pairs) ? data.pairs : [];
    const pulsePairs = pairs.filter((p) => p?.chainId === 'pulsechain' && p?.priceUsd);

    if (!pulsePairs.length) throw new Error('No PulseChain pairs found for HEX');

    // Choose the pair with the most USD liquidity
    pulsePairs.sort((a, b) => (b?.liquidity?.usd || 0) - (a?.liquidity?.usd || 0));
    const best = pulsePairs[0];

    const priceUsd = Number(best.priceUsd);
    if (!Number.isFinite(priceUsd)) throw new Error('Invalid priceUsd');

    return {
        priceUsd,
        updatedAt: Date.now(),
        source: 'dexscreener',
        pairAddress: best?.pairAddress || null
    };
}

/**
 * Refresh and cache (always hits network).
 */
export async function refreshPulseHexUsd() {
    const latest = await fetchPulseHexUsdFromDexscreener();
    writePulseHexUsdCache(latest);
    return latest;
}

/**
 * Get "fast" price: return cache immediately (if fresh), otherwise refresh.
 * @param {number} ttlMs
 */
export async function getPulseHexUsdFast(ttlMs = DEFAULT_TTL_MS) {
    const cached = readPulseHexUsdCache();
    const now = Date.now();
    if (cached && now - cached.updatedAt < ttlMs) {
        return { ...cached, fromCache: true };
    }
    const latest = await refreshPulseHexUsd();
    return { ...latest, fromCache: false };
}

/**
 * React hook to read cached price instantly, then refresh in background.
 */
export function usePulseHexUsd(ttlMs = DEFAULT_TTL_MS) {
    const [state, setState] = useState(() => {
        const c = readPulseHexUsdCache();
        return c
            ? { priceUsd: c.priceUsd, updatedAt: c.updatedAt, isRefreshing: false, source: c.source }
            : { priceUsd: 0, updatedAt: 0, isRefreshing: false, source: 'dexscreener' };
    });

    const mounted = useRef(true);

    useEffect(() => {
        mounted.current = true;
        (async () => {
            setState((s) => ({ ...s, isRefreshing: true }));
            try {
                const { priceUsd, updatedAt, source } = await getPulseHexUsdFast(ttlMs);
                if (mounted.current) setState({ priceUsd, updatedAt, isRefreshing: false, source });
                // kick a background refresh if the entry was from cache (stale-ish)
                const c = readPulseHexUsdCache();
                if (c && Date.now() - c.updatedAt >= ttlMs) {
                    refreshPulseHexUsd().then((fresh) => {
                        if (mounted.current) {
                            setState({ priceUsd: fresh.priceUsd, updatedAt: fresh.updatedAt, isRefreshing: false, source: fresh.source });
                        }
                    }).catch(() => { });
                }
            } catch {
                if (mounted.current) setState((s) => ({ ...s, isRefreshing: false }));
            }
        })();
        return () => {
            mounted.current = false;
        };
    }, [ttlMs]);

    return state; // { priceUsd, updatedAt, isRefreshing, source }
}
