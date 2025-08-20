// src/components/kw-HexStakingHeaderContainer.jsx
import React, { useMemo } from 'react';
import KwHexStakingHeader from './kw-HexStakingHeader.jsx';
import { computeHexStakingStats } from '../services/hexStakingStats';

export default function KwHexStakingHeaderContainer({
    stakes,                    // <-- your live stakes array
    currentHexDay,             // <-- integer (from your HEX day clock/cache)
    payoutPerTShareDailyHex,   // <-- number (from your network metrics cache)
    updatedAt,
    onRefresh,
    sticky = true
}) {
    const stats = useMemo(
        () =>
            computeHexStakingStats(stakes, {
                currentDay: currentHexDay,
                payoutPerTShareDailyHex
            }),
        [stakes, currentHexDay, payoutPerTShareDailyHex]
    );

    return (
        <KwHexStakingHeader
            activeStakes={stats.activeStakes}
            totalTShares={stats.totalTShares}
            avgApyPct={stats.avgApyPct}
            nextEndInDays={stats.nextEndInDays}
            totalPrincipalHex={stats.totalPrincipalHex}
            totalYieldHex={stats.totalYieldHex}          // pass your true lifetime yield if available
            avgStakeYears={stats.avgStakeYears}
            yieldPerDay={stats.yieldPerDay}
            yieldPerWeek={stats.yieldPerWeek}
            yieldPerMonth={stats.yieldPerMonth}
            yieldPerYear={stats.yieldPerYear}
            updatedAt={updatedAt}
            onRefresh={onRefresh}
            sticky={sticky}
        />
    );
}
