// src/components/kw-HexStakingHeader.jsx
import React, { useMemo, useState } from 'react';
import { Card, Button, Badge } from 'react-bootstrap';
import '../styles/kw-hex-staking-header.css';

const nf = (v, opts = {}) =>
    new Intl.NumberFormat(undefined, { maximumFractionDigits: 2, ...opts }).format(Number(v || 0));
const plural = (n, s) => `${n} ${s}${Number(n) === 1 ? '' : 's'}`;

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

    const cadenceHex = useMemo(() => {
        switch (cadence) {
            case 'day': return yieldPerDay;
            case 'week': return yieldPerWeek;
            case 'month': return yieldPerMonth;
            case 'year': return yieldPerYear;
            default: return 0;
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
                            <Badge bg="dark" className="kw-chip subtle">watch‑only</Badge>
                        </div>
                        <div className="kw-meta">
                            <span className="kw-updated">Updated: {updatedLabel}</span>
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
        case 'day': return 'Day';
        case 'week': return 'Week';
        case 'month': return 'Month';
        case 'year': return 'Year';
        default: return '';
    }
}
