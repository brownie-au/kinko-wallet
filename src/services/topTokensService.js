// src/services/topTokensService.js
/* eslint-disable import/no-relative-parent-imports */
import { getWalletCache } from '../utils/walletCache';
import wallets from '../data/wallets.js';

const LS_KEY = 'kw:lastTopTokens';
const LS_AT = 'kw:lastTopTokensAt';

// Read/write cached Top‑5
export function readTopTokensCache() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}
export function writeTopTokensCache(list) {
    try {
        const payload = Array.isArray(list) ? list : [];
        localStorage.setItem(LS_KEY, JSON.stringify(payload));
        localStorage.setItem(LS_AT, String(Date.now()));
        // fire a storage-like event so same-tab listeners update
        window.dispatchEvent(new StorageEvent('storage', { key: LS_KEY, newValue: JSON.stringify(payload) }));
    } catch { }
}

// Fallback synthesiser — used by Dashboard if nothing cached yet
export function synthesizeTopFromWalletCache(limit = 5) {
    const bag = new Map();
    for (const w of (wallets || [])) {
        const addr = (w?.address || w)?.toLowerCase?.() || '';
        if (!addr) continue;
        const wc = getWalletCache(addr, { maxAge: Number.MAX_SAFE_INTEGER }) || {};
        const tokens = wc?.tokens || wc?.portfolioTokens || wc?.assets || [];
        for (const t of tokens) {
            const sym = t?.symbol || t?.ticker || '—';
            const key = t?.address ? `${sym}|${(t.address || '').toLowerCase()}` : sym;
            const prev = bag.get(key) || { valueUsd: 0, amount: 0, ...t };
            prev.valueUsd += Number(t?.valueUsd ?? t?.usd ?? t?.totalUsd ?? 0) || 0;
            prev.amount += Number(t?.amount ?? t?.balance ?? 0) || 0;
            prev.symbol = sym;
            prev.name = t?.name || prev.name || sym;
            prev.chain = t?.chain || t?.network || prev.chain;
            prev.logo = t?.logo || t?.icon || prev.logo || '';
            prev.address = t?.address || prev.address || '';
            prev.change24hPct = t?.change24hPct ?? prev.change24hPct ?? null;
            prev.dexUrl = t?.dexUrl || prev.dexUrl || null;
            bag.set(key, prev);
        }
    }
    return Array.from(bag.values())
        .filter(x => (x.valueUsd || 0) > 0)
        .sort((a, b) => b.valueUsd - a.valueUsd)
        .slice(0, limit)
        .map(x => ({
            symbol: x.symbol,
            name: x.name || x.symbol,
            chain: x.chain,
            address: x.address || '',
            logo: x.logo || '',
            valueUsd: Number(x.valueUsd) || 0,
            change24hPct: x.change24hPct ?? null,
            dexUrl: x.dexUrl || null
        }));
}
