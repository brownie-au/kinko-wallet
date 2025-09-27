// src/components/kw-EHexStakingHeader.jsx
import React, { useMemo, useState, useEffect } from 'react';
import { Card, Button, Badge } from 'react-bootstrap';
import YieldUnitToggle from './YieldUnitToggle.jsx';
import '../styles/kw-hex-staking-header.css'; // reuse same styles
import '../styles/overrides.scss'; 

// ---------- utils ----------
const nf = (v, opts = {}) =>
    new Intl.NumberFormat(undefined, { maximumFractionDigits: 2, ...opts }).format(Number(v || 0));

const nfc = (v) =>
    new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: 'USD',
        currencyDisplay: 'narrowSymbol', // "$" instead of "US$"
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(Number(v || 0));

/** More precision for small prices (used in "@ price") */
const nfcPrice = (v) => {
    const n = Number(v || 0);
    const base = { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol' };
    if (n < 1) {
        return new Intl.NumberFormat(undefined, {
            ...base,
            minimumFractionDigits: 4,
            maximumFractionDigits: 6
        }).format(n);
    }
    return new Intl.NumberFormat(undefined, { ...base, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
};

const plural = (n, s) => `${n} ${s}${Number(n) === 1 ? '' : 's'}`;

/**
 * HEX Day counter (AEST) — ticks over at 10:00 AEST.
 * Day 1 anchor set to 2019-12-03 10:00:00 AEST.
 * Returns an integer day number (>= 1).
 */
export function getCurrentHexDayAEST(nowTs = Date.now()) {
    const tz = 'Australia/Brisbane';
    const day1 = new Date('2019-12-03T10:00:00+10:00'); // AEST anchor
    const nowLocal = new Date(new Date(nowTs).toLocaleString('en-US', { timeZone: tz }));
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
export default function KwEHexStakingHeader({
    // metrics
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

    // price/total
    hexPriceUsd = 0,
    totalUsd = 0,
    totalHex = 0,

    // controls + layout
    updatedAt,
    onRefresh,
    sticky = true,
    alignControlsRight = true,
    showUsdUnderTitle = true
}) {
    const [cadence, setCadence] = useState('day'); // 'day' | 'week' | 'month' | 'year'
    const [showUsd, setShowUsd] = useState(false); // default native token (eHEX)
    const hexDay = useHexDay();

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

    // Derived display bits for the USD line
    const usdDisplay = useMemo(() => {
        if (!showUsdUnderTitle) return null;
        const main = nfc(totalUsd || 0);

        // Small subline with amount and price if available
        const sub =
            (totalHex > 0 || hexPriceUsd > 0)
                ? `${nf(totalHex, { maximumFractionDigits: 0 })} eHEX • ${hexPriceUsd > 0 ? `@ ${nfcPrice(hexPriceUsd)}` : 'price updating…'}`
                : null;

        return (
            <div className="kw-usd-wrap">
                <div className="kw-usd-title" style={{ fontSize: '2.00rem', fontWeight: 800, lineHeight: 1.1 }}>
                    USD {main.replace(/US\$|USD/g, '').trim()}
                </div>
                {sub && <div className="kw-usd-sub">{sub}</div>}
            </div>
        );
    }, [showUsdUnderTitle, totalUsd, totalHex, hexPriceUsd]);

    const yieldValueNode = useMemo(() => {
        const valHex = cadenceHex || 0;
        const valUsd = (hexPriceUsd > 0 ? valHex * hexPriceUsd : 0);
        return showUsd
            ? `USD ${nfc(valUsd).replace(/US\$|USD/g, '').trim()}`
            : `${nf(valHex, { maximumFractionDigits: 0 })} eHEX`;
    }, [cadenceHex, hexPriceUsd, showUsd]);

    return (
        <div className={`kw-hex-stake-header ${sticky ? 'kw-sticky' : ''}`}>
            <Card className="kw-card">
                {/* Header row: title + chips on left, controls on right */}
                <div className="kw-row">
                    <div className="kw-left">
                        <div className="kw-title">
                            <span>eHEX Staking</span>
                            <Badge bg="secondary" className="kw-chip">ETHEREUM</Badge>
                            <Badge bg="secondary" className="kw-chip">Day {hexDay}</Badge>
                        </div>

                        {/* Big USD line sits under the title */}
                        {usdDisplay}
                    </div>

                    {alignControlsRight && (
                        <div className="kw-right">
                            <span className="kw-updated fw-semibold me-2">Updated: {updatedLabel}</span>
                        </div>
                    )}
                </div>

                {/* Metrics grid */}
                <div className="kw-metrics">
                    <Metric label="Active Stakes" value={nf(activeStakes, { maximumFractionDigits: 0 })} />
                    <Metric label="Total T-Shares" value={nf(totalTShares, { maximumFractionDigits: 0 })} />
                    <Metric label="Average APY" value={`${nf(avgApyPct, { maximumFractionDigits: 1 })}%`} />
                    <Metric label="Next End Stake" value={`Due in ${plural(nextEndInDays, 'day')}`} />
                    <Metric label="Total Principal" value={`${nf(totalPrincipalHex, { maximumFractionDigits: 0 })} eHEX`} />
                    <Metric label="Total Yield" value={`${nf(totalYieldHex, { maximumFractionDigits: 0 })} eHEX`} />
                    <Metric label="Average Stake Length" value={`${nf(avgStakeYears, { maximumFractionDigits: 1 })} yrs`} />

                    {/* Yield metric with cadence chips */}
                    <Metric 
                        label={`Yield (${labelForCadence(cadence)})`}
                        value={yieldValueNode}
                        accent
                    >
                        <div className="kw-yield-toggle-wrap">
                            <YieldUnitToggle checked={showUsd} onChange={setShowUsd} title="Show USD value" />
                        </div>
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
