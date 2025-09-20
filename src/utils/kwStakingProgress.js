export const STAKE_PROGRESS_COLORS = {
    Active: 'rgba(72, 135, 255, 0.28)',
    Ready: 'rgba(64, 201, 140, 0.3)',
    Overdue: 'rgba(255, 142, 98, 0.32)',
    Ended: 'rgba(64, 201, 140, 0.38)',
    Default: 'rgba(120, 130, 160, 0.26)'
};

/**
 * Compute the served progress fraction for a staking row.
 * Returns a value between 0 and 1 (inclusive).
 */
export function computeStakeProgress({ lockedDay, stakedDays, currentDay, unlockedDay }) {
    if (Number(unlockedDay) > 0) return 1;

    const staked = Number(stakedDays);
    const locked = Number(lockedDay);
    const today = Number(currentDay);

    if (!Number.isFinite(staked) || staked <= 0) return 0;
    if (!Number.isFinite(locked)) return 0;
    if (!Number.isFinite(today)) return 0;

    const servedRaw = today - locked;
    const served = Math.min(Math.max(servedRaw, 0), staked);
    if (!Number.isFinite(served) || served <= 0) return 0;

    const fraction = served / staked;
    return Math.max(0, Math.min(fraction, 1));
}

export function getStakeProgressColor(status) {
    return STAKE_PROGRESS_COLORS[status] || STAKE_PROGRESS_COLORS.Default;
}
