// src/components/kw-ChainAllocationPie.jsx
import React, { useMemo } from 'react';
import PropTypes from 'prop-types';

// Brand base colours (hex for reliable HSL math)
const CHAIN_COLOURS = {
    pulse: '#8E44AD', // Pulsechain purple
    eth: '#16C784', // ETH green
    base: '#0A5BFF', // Base blue
    staking: '#F5A200', // orange/yellow for staking & mining
    other: '#7a8899'
};


// --- tiny color helpers (hex <-> hsl) ---
function hexToHsl(hex) {
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(ch => ch + ch).join('');
    const r = parseInt(c.slice(0, 2), 16) / 255;
    const g = parseInt(c.slice(2, 4), 16) / 255;
    const b = parseInt(c.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
            default: h = 0;
        }
        h /= 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}
function hslStr(h, s, l) { return `hsl(${h} ${s}% ${l}%)`; }

const labelFromId = (id) => {
    switch ((id || '').toLowerCase()) {
        case 'pulse':
        case 'pls':
        case 'plsx': return 'PulseChain';
        case 'eth': return 'Ethereum';
        case 'base': return 'Base';
        default: return (id || 'Other').toUpperCase();
    }
};

export default function KwChainAllocationPie({
    items = [],
    size = 188,
    thickness = 22,
    className = '',
    showCenter = false,
    showLegend = false
}) {
    const rows = useMemo(() => (items || [])
        .filter(r => Number(r?.valueUsd) > 0)
        .map(r => ({
            id: (r.id || 'other').toLowerCase(),
            valueUsd: Number(r.valueUsd),
            label: r.label || labelFromId(r.id)
        })), [items]);

    const total = useMemo(() => rows.reduce((a, b) => a + b.valueUsd, 0), [rows]);

    const stops = useMemo(() => {
        if (!total) return [];
        let acc = 0;
        return [...rows].sort((a, b) => b.valueUsd - a.valueUsd).map(r => {
            const pct = (r.valueUsd / total) * 100;
            const from = acc; const to = acc + pct; acc = to;
            const base = CHAIN_COLOURS[r.id] || CHAIN_COLOURS.other;
            return { id: r.id, label: r.label, from, to, base };
        });
    }, [rows, total]);

    // Build MANY micro-stops in HSL for a butter-smooth sweep per slice.
    // (Only this block materially differs from your version.)
    const gradientParts = useMemo(() => {
        if (!stops.length) return ['#3a3a3a 0 100%'];

        const parts = [];
        const stepsPerSlice = 160;   // ↑ smoother (try 160 if you want *ultra* smooth)
        const lightDelta = +12;      // a touch brighter at the leading edge
        const darkDelta = -10;      // a touch darker at the trailing edge

        for (const s of stops) {
            const { h, s: sat, l } = hexToHsl(s.base);
            const span = s.to - s.from;
            let prev = s.from;

            for (let i = 1; i <= stepsPerSlice; i++) {
                const t = i / stepsPerSlice;                 // 0..1 along slice
                // smoothstep easing to remove any band “rings”
                const ease = t * t * (3 - 2 * t);
                const lThis = Math.max(0, Math.min(100, l + lightDelta * (1 - ease) + darkDelta * ease));

                const col = hslStr(h, sat, lThis);
                const pos = s.from + span * t;
                parts.push(`${col} ${prev.toFixed(4)}% ${pos.toFixed(4)}%`);
                prev = pos;
            }
        }
        return parts;
    }, [stops]);

    const innerPct = 100 - (100 * (size - thickness) / size);
    const backgroundLayers = [
        // Inner cutout matches the card/bg
        `radial-gradient(circle, var(--bs-card-bg, var(--bs-body-bg, #1e1e1e)) ${innerPct}%, transparent ${innerPct + 0.1}%)`,
        // Conic slices with micro-stops (super smooth)
        `conic-gradient(${gradientParts.join(', ')})`,
        // Subtle vignette for depth
        `radial-gradient(circle at 32% 32%, rgba(255,255,255,.06), transparent 55%)`
    ].join(',');

    return (
        <div className={className} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ position: 'relative', display: 'inline-block', overflow: 'visible' }}>
                <div
                    style={{
                        width: size,
                        height: size,
                        borderRadius: '50%',
                        background: backgroundLayers,
                        boxShadow:
                            'inset 0 1px 0 rgba(255,255,255,0.04), inset 0 -1px 0 rgba(0,0,0,0.22), 0 0 0 1px var(--bs-border-color, rgba(255,255,255,.10))',
                        transition: 'background 220ms ease'
                    }}
                    aria-label="Chain allocation chart"
                />
                {showCenter && (
                    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }} />
                )}
            </div>

            {showLegend && <div style={{ display: 'none' }} />} {/* legend intentionally hidden */}
        </div>
    );
}

KwChainAllocationPie.propTypes = {
    items: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string.isRequired,
        valueUsd: PropTypes.number.isRequired,
        label: PropTypes.string
    })),
    size: PropTypes.number,
    thickness: PropTypes.number,
    className: PropTypes.string,
    showCenter: PropTypes.bool,
    showLegend: PropTypes.bool
};
