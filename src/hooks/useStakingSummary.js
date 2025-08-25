// src/hooks/useStakingSummary.js
import { useMemo } from 'react';
import { usePortfolioValue } from '../contexts/PortfolioValueContext.jsx';

/**
 * Sums all staking-related USD sources published into PortfolioValueContext.
 * Cache-first: PortfolioValueContext is persisted to localStorage, so this
 * returns immediately with the last known values, then re-renders if updated.
 */
export default function useStakingSummary() {
    const { sources } = usePortfolioValue();

    const { usd, count } = useMemo(() => {
        if (!sources || typeof sources !== 'object') return { usd: 0, count: 0 };

        let total = 0;
        let n = 0;

        // Accept any key that starts with "staking:" (e.g., staking:hex, staking:ehex)
        // and also tolerate explicit known constants if you've used them elsewhere.
        for (const [k, v] of Object.entries(sources)) {
            const isStaking =
                k.startsWith('staking:') ||
                k === 'staking:hex' ||
                k === 'staking:ehex';

            if (isStaking) {
                const val = Number(v?.usd ?? v?.total ?? 0);
                if (Number.isFinite(val)) {
                    total += val;
                    n += 1;
                }
            }
        }

        return { usd: total, count: n };
    }, [sources]);

    // Ready if we found any staking source (still fine to show $0 if none yet)
    return { usd, ready: true, sourceCount: count };
}
