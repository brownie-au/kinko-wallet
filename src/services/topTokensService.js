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
    } catch { /* ignore */ }
}

// Fallback synthesiser — used by Dashboard if nothing cached yet
export function synthesizeTopFromWalletCache(limit = 5) {
    const bag = new Map();

    for (const w of (wallets || [])) {
        const owner = (w?.address || w)?.toLowerCase?.() || '';
        if (!owner) continue;

        const wc = getWalletCache(owner, { maxAge: Number.MAX_SAFE_INTEGER }) || {};
        const tokens = wc?.tokens || wc?.portfolioTokens || wc?.assets || [];

        for (const raw of tokens) {
            const sym = (raw?.symbol || raw?.ticker || '—').toUpperCase();
            const address = (raw?.address || raw?.contract || 'native').toLowerCase();
            const chain = (raw?.chain || raw?.network || '').toLowerCase();

            const key = address ? `${chain}|${sym}|${address}` : `${chain}|${sym}`;

            const prev = bag.get(key) || {
                symbol: sym,
                name: raw?.name || sym,
                chain,
                address,
                logo: raw?.logo || raw?.icon || '',
                change24hPct: raw?.change24hPct ?? null,
                dexUrl: raw?.dexUrl || null,
                valueUsd: 0,
                amount: 0,
                price: 0 // running weighted price
            };

            const vUsd = Number(raw?.valueUsd ?? raw?.usd ?? raw?.totalUsd ?? 0) || 0;
            const amt = Number(raw?.amount ?? raw?.balance ?? 0) || 0;

            // accumulate totals
            prev.valueUsd += vUsd;
            prev.amount += amt;

            // compute/merge price (explicit > derived)
            const thisPrice = Number(raw?.priceUsd ?? raw?.price ?? (amt > 0 ? vUsd / amt : 0)) || 0;
            if (thisPrice > 0 && amt > 0) {
                const prevAmt = prev.amount - amt;         // amount before this add
                const prevPrice = prev.price || 0;
                prev.price = (prevPrice * prevAmt + thisPrice * amt) / (prevAmt + amt);
            }

            // keep nicer name/logo if available
            if (!prev.name && raw?.name) prev.name = raw.name;
            if (!prev.logo && (raw?.logo || raw?.icon)) prev.logo = raw.logo || raw.icon;

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
            amount: Number(x.amount) || 0,
            // final price for UI: weighted average if we have it, else derive from value/amount
            priceUsd: Number(x.price) || (Number(x.amount) > 0 ? Number(x.valueUsd) / Number(x.amount) : 0),
            change24hPct: x.change24hPct ?? null,
            dexUrl: x.dexUrl || null
        }));
}
