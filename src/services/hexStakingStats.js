// src/services/hexStakingStats.js
//
// Compute live HEX staking summary metrics from a stakes array.
//
// Expected stake shape (lenient):
// {
//   stakeId: number|string,
//   principalHex: number|string,        // aka 'stakedHearts' / 'stakeShares' varies by source
//   tShares: number|string,             // raw T-Shares (NOT 'sharesHex' hearts)
//   lockedDay: number,                  // HEX day staked
//   stakedDays: number,                 // total scheduled days
//   unlockedDay?: number,               // 0 if still active
//   isActive?: boolean,                 // optional; derived if absent
// }
//
// You must provide:
// - currentDay: current HEX day (integer)
// - payoutPerTShareDailyHex: network-wide daily payout per 1 T-Share in HEX
//
// Notes:
// - Yield cadence (day/week/month/year) is computed from total T-Shares * payoutPerTShareDailyHex.
// - Average APY is estimated as (yearly yield / total principal) * 100.
// - Next end stake is min remaining days among active stakes; 0 if none.
//
export function computeHexStakingStats(
    stakes = [],
    {
        currentDay,
        payoutPerTShareDailyHex
    }
) {
    const safeNum = (v) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
    };

    const nowDay = safeNum(currentDay);
    const dailyPerT = safeNum(payoutPerTShareDailyHex);

    let active = 0;
    let totalTShares = 0;
    let totalPrincipal = 0;
    let sumStakeDays = 0;
    let nextEndInDays = Number.POSITIVE_INFINITY;

    for (const s of stakes || []) {
        const principal = safeNum(s.principalHex ?? s.principal ?? s.stakedHearts ?? 0);
        const t = safeNum(s.tShares ?? s.tshares ?? s.t_share ?? 0);
        const locked = safeNum(s.lockedDay ?? s.locked_day ?? 0);
        const lenDays = safeNum(s.stakedDays ?? s.stakeLength ?? s.stake_days ?? 0);
        const unlocked = safeNum(s.unlockedDay ?? s.unlocked_day ?? 0);
        const isActive = s.isActive ?? (unlocked === 0);

        totalPrincipal += principal;
        totalTShares += t;
        sumStakeDays += lenDays;

        if (isActive) {
            active += 1;
            const endDay = locked + lenDays;
            const remaining = Math.max(0, endDay - nowDay);
            if (remaining < nextEndInDays) nextEndInDays = remaining;
        }
    }

    if (!Number.isFinite(nextEndInDays)) nextEndInDays = 0;

    // Cadence yields (HEX)
    const yieldPerDay = totalTShares * dailyPerT;
    const yieldPerWeek = yieldPerDay * 7;
    const yieldPerMonth = yieldPerDay * 30;   // UI cadence, fine as 30-day month
    const yieldPerYear = yieldPerDay * 365;

    // Estimated lifetime/total yield (only if you don’t have actual accruedInterest per stake)
    // If you already compute true lifetime yield elsewhere, pass/replace it in the page.
    const totalYieldEst = 0; // keep 0 by default (don’t misreport)

    // Averages
    const avgStakeYears = stakes.length ? (sumStakeDays / stakes.length) / 365 : 0;
    const avgApyPct = totalPrincipal > 0 ? (yieldPerYear / totalPrincipal) * 100 : 0;

    return {
        activeStakes: active,
        totalTShares,
        totalPrincipalHex: totalPrincipal,
        totalYieldHex: totalYieldEst,   // replace with true figure if you have it
        avgStakeYears,
        nextEndInDays,
        avgApyPct,
        yieldPerDay,
        yieldPerWeek,
        yieldPerMonth,
        yieldPerYear
    };
}
