// src/services/change24hService.js
/* eslint-disable import/no-relative-parent-imports */

// Build a canonical “key” that matches Portfolio/TopTokens usage
export const tokenKey = (t) =>
    `${String(t?.chain || '').toLowerCase()}:${(t?.address || t?.contract || (String(t?.symbol).toUpperCase() === 'PLS' ? 'native' : '') || '').toLowerCase()
    }:${(t?.symbol || '').toUpperCase()
    }`;

/**
 * Fetch 24h % change for a batch of tokens that HAVE an on‑chain contract address
 * via DexScreener. Returns Map<tokenKey, number|null>.
 *
 * We batch addresses (DexScreener supports comma‑separated list, ~30 per call is safe).
 */
export async function fetchChange24hFromDexScreener(tokens) {
    // Centralized client orchestrates refresh; components should not fetch directly.
    // Return empty map to avoid direct network calls from UI components.
    // Background price changes are reflected via token prices instead.
    return new Map();
}
