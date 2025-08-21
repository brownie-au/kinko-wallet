// src/components/hex/YieldCell.jsx
import React, { useEffect, useState } from 'react';
import { getCachedYieldPct } from '../../services/hex/hexYieldHDS';

/**
 * Props:
 *  - stake: { stakeShares, stakedHearts, lockedDay, stakedDays, ... }
 *  - chain: 'pls' | 'eth'  (default 'pls')
 *  - dayCounter?: number   (UI Day #### baseline; optional)
 *  - digits?: number       (default 2)
 *  - className?: string
 */
export default function YieldCell({ stake, chain = 'pls', dayCounter, digits = 2, className = '' }) {
    const [val, setVal] = useState(null);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const v = await getCachedYieldPct(chain, stake, dayCounter);
                if (alive) setVal(v);
            } catch {
                if (alive) setVal(0);
            }
        })();
        return () => { alive = false; };
    }, [chain, stake?.stakeId, stake?.lockedDay, stake?.stakedDays, stake?.stakeShares, stake?.stakedHearts, dayCounter]);

    if (val === null) {
        // light skeleton that won't mess with your row height
        return <span className={`text-muted ${className}`} style={{ opacity: 0.6 }}>…</span>;
    }

    const pct = Number(val);
    const formatted = Number.isFinite(pct) ? `${pct.toFixed(digits)}%` : '0%';
    return <span className={className}>{formatted}</span>;
}
