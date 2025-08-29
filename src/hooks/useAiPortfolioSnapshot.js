// src/hooks/useAiPortfolioSnapshot.js
/* Build a compact { totalUsd, assets[], chains[] } portfolio snapshot
   from the same wallet caches used by Portfolio + Dashboard.
   - Pure read-only; no network.
   - Keeps logic out of UI files.
*/
import { useMemo } from 'react';
import { getWalletCache } from '../utils/walletCache';
import wallets from '../data/wallets.js';

export default function useAiPortfolioSnapshot() {
    // 1) Flatten wallet caches into simple rows
    const rows = useMemo(() => {
        const out = [];
        for (const w of (wallets || [])) {
            const addr = (w?.address || w)?.toLowerCase?.() || '';
            if (!addr) continue;
            const wc = getWalletCache(addr, { maxAge: Number.MAX_SAFE_INTEGER }) || {};
            const tokens = wc?.tokens || wc?.portfolioTokens || wc?.assets || [];
            for (const r of tokens) {
                const chain = (r?.chain || r?.network || '').toLowerCase();
                const address = (r?.address || r?.contract || (String(r?.symbol).toUpperCase() === 'PLS' ? 'native' : '')).toLowerCase();
                const symbol = (r?.symbol || r?.ticker || '').toUpperCase();
                const amount = Number(r?.amount ?? r?.balance ?? 0) || 0;
                const valueUsd = Number(r?.valueUsd ?? r?.usd ?? r?.totalUsd ?? 0) || 0;
                const priceUsd = Number(r?.priceUsd ?? r?.price ?? (amount > 0 ? valueUsd / amount : 0)) || 0;
                out.push({ chain, address, symbol, amount, valueUsd, priceUsd });
            }
        }
        return out;
    }, []);

    // 2) Summarise into Analyzer-friendly shape
    const portfolio = useMemo(() => {
        const byKey = new Map();
        let total = 0;
        const chains = new Set();

        for (const r of rows) {
            const key = `${r.chain}:${r.address || 'native'}:${r.symbol}`;
            const prev = byKey.get(key) || {
                symbol: r.symbol,
                name: r.symbol,
                chain: r.chain,
                address: r.address || null,
                amount: 0,
                valueUsd: 0,
                priceUsd: 0
            };
            prev.amount += Number(r.amount) || 0;
            prev.valueUsd += Number(r.valueUsd) || 0;
            prev.priceUsd = prev.amount > 0 ? prev.valueUsd / prev.amount : (prev.priceUsd || r.priceUsd || 0);
            byKey.set(key, prev);

            if (r.chain) chains.add(r.chain);
            total += Number(r.valueUsd) || 0;
        }

        return {
            totalUsd: Number(total) || 0,
            assets: Array.from(byKey.values()),
            chains: Array.from(chains)
        };
    }, [rows]);

    return { portfolio, rows };
}
