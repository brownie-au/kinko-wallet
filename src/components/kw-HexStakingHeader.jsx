// src/components/kw-HexStakingHeader.jsx
import React, { useMemo, useState, useEffect } from 'react';
import { Card, Button, Badge } from 'react-bootstrap';
import '../styles/kw-hex-staking-header.css';

// ---------- utils ----------
const nf = (v, opts = {}) =>
    new Intl.NumberFormat(undefined, { maximumFractionDigits: 2, ...opts }).format(Number(v || 0));
const plural = (n, s) => `${n} ${s}${Number(n) === 1 ? '' : 's'}`;

/**
 * HEX Day counter (AEST) — ticks over at 10:00 AEST.
 * Day 1 anchor set to 2019-12-03 10:00:00 AEST.
 * Returns an integer day number (>= 1).
 */
export function getCurrentHexDayAEST(nowTs = Date.now()) {
    // AEST (no DST in QLD), use Brisbane
    const tz = 'Australia/Brisbane';

    // Day 1 start (AEST)
    const day1 = new Date('2019-12-03T10:00:00+10:00'); // AEST anchor

    // Convert "now" into Brisbane local time by re-parsing a locale string in that TZ
    const nowLocal = new Date(
        new Date(nowTs).toLocaleString('en-US', { timeZone: tz })
    );

    // Floor difference in full 24h "HEX days", then +1 because anchor is Day 1
    const msPerDay = 24 * 60 * 60 * 1000;
    const diff = nowLocal.getTime() - day1.getTime();
    const dayIndex = Math.floor(diff / msPerDay) + 1;
    return Math.max(1, dayIndex);
}

/** Small hook to re-compute the day automatically, checking every 30s */
function useHexDay() {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 30_000);
        return () => clearInterval(id);
    }, []);
    return useMemo(() => getCurrentHexDayAEST(now), [now]);
}

// ---------- component ----------
export default function KwHexStakingHeader({
    activeStakes = 0,
    totalTShares = 0,
    avgApyPct = 0,
    nextEndInDays = 0,
    totalPrincipalHex = 0,
    totalYieldHex = 0,
    avgStakeYears = 0,
    yieldPerDay = 0,
    yieldPerWeek = 0,
    yieldPerMonth = 0,
    yieldPerYear = 0,
    updatedAt,
    onRefresh,
    sticky = true
}) {
    const [cadence, setCadence] = useState('day'); // 'day' | 'week' | 'month' | 'year'
    const hexDay = useHexDay();

    const cadenceHex = useMemo(() => {
        switch (cadence) {
            case 'day':
                return yieldPerDay;
            case 'week':
                return yieldPerWeek;
            case 'month':
                return yieldPerMonth;
            case 'year':
                return yieldPerYear;
            default:
                return 0;
        }
    }, [cadence, yieldPerDay, yieldPerWeek, yieldPerMonth, yieldPerYear]);

    const updatedLabel = useMemo(() => {
        if (!updatedAt && updatedAt !== 0) return '—';
        const d = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
        if (Number.isNaN(d.getTime())) return '—';
        const hh = d.getHours().toString().padStart(2, '0');
        const mm = d.getMinutes().toString().padStart(2, '0');
        return `${hh}:${mm}`;
    }, [updatedAt]);

    return (
        <div className={`kw-hex-stake-header ${sticky ? 'kw-sticky' : ''}`}>
            <Card className="kw-card">
                <div className="kw-row">
                    <div className="kw-left">
                        <div className="kw-title">
                            <span>HEX Staking</span>
                            <Badge bg="secondary" className="kw-chip">PulseChain</Badge>
                            {/* Replaces the old watch‑only chip */}
                            <Badge bg="secondary" className="kw-chip">Day {hexDay}</Badge>
                        </div>
                        <div className="kw-meta">
                            {/* Slightly stronger contrast for dark mode */}
                            <span className="kw-updated fw-semibold">Updated: {updatedLabel}</span>
                            <Button size="sm" variant="outline-secondary" className="kw-refresh" onClick={onRefresh}>
                                Refresh
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="kw-metrics">
                    <Metric label="Active Stakes" value={nf(activeStakes, { maximumFractionDigits: 0 })} />
                    <Metric label="Total T‑Shares" value={nf(totalTShares, { maximumFractionDigits: 0 })} />
                    <Metric label="Average APY" value={`${nf(avgApyPct, { maximumFractionDigits: 1 })}%`} />
                    <Metric label="Next End Stake" value={`Due in ${plural(nextEndInDays, 'day')}`} />
                    <Metric label="Total Principal" value={`${nf(totalPrincipalHex, { maximumFractionDigits: 0 })} HEX`} />
                    <Metric label="Total Yield" value={`${nf(totalYieldHex, { maximumFractionDigits: 0 })} HEX`} />
                    <Metric label="Average Stake Length" value={`${nf(avgStakeYears, { maximumFractionDigits: 1 })} yrs`} />

                    {/* Yield metric with chips above */}
                    <Metric
                        label={`Yield (${labelForCadence(cadence)})`}
                        value={`${nf(cadenceHex, { maximumFractionDigits: 0 })} HEX`}
                        accent
                    >
                        <div className="kw-cadence-chips" role="tablist" aria-label="Yield cadence">
                            <Chip active={cadence === 'day'} onClick={() => setCadence('day')}>D</Chip>
                            <Chip active={cadence === 'week'} onClick={() => setCadence('week')}>W</Chip>
                            <Chip active={cadence === 'month'} onClick={() => setCadence('month')}>M</Chip>
                            <Chip active={cadence === 'year'} onClick={() => setCadence('year')}>Y</Chip>
                        </div>
                    </Metric>
                </div>
            </Card>
        </div>
    );
}

function Metric({ label, value, accent = false, children }) {
    return (
        <div className={`kw-metric ${accent ? 'accent' : ''}`}>
            {children}
            <div className="kw-metric-label">{label}</div>
            <div className="kw-metric-value">{value}</div>
        </div>
    );
}

function Chip({ active, onClick, children }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`kw-chip-btn ${active ? 'active' : ''}`}
            aria-pressed={active}
        >
            {children}
        </button>
    );
}

function labelForCadence(c) {
    switch (c) {
        case 'day':
            return 'Day';
        case 'week':
            return 'Week';
        case 'month':
            return 'Month';
        case 'year':
            return 'Year';
        default:
            return '';
    }
}
