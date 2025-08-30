// src/components/ChainUI.jsx
import React from 'react';

// Accent colours (kept soft so they work on light/dark)
export const CHAIN_COLORS = {
  all: 'var(--bs-primary, #0d6efd)',
  eth: '#2ecc71',
  pulse: '#9b59b6',
  base: '#3498db'
};

// --- helpers ---
export function normalizeChain(input) {
  if (input == null) return 'eth';
  const s = String(input).toLowerCase();

  // ids
  if (s === '1') return 'eth';
  if (s === '369') return 'pulse';
  if (s === '8453') return 'base';

  // names/aliases
  if (s === 'all') return 'all';
  if (s.includes('pulse') || s === 'pls' || s === 'plsx') return 'pulse';
  if (s.includes('base')) return 'base';
  if (s.includes('eth') || s === 'ehex') return 'eth';

  return 'eth';
}

/** Small inline chain chip (for token rows) */
export function ChainChip({ chain = 'eth', className = '', style }) {
  const key = normalizeChain(chain);
  const bg = CHAIN_COLORS[key] || CHAIN_COLORS.eth;
  const baseStyle = {
    display: 'inline-block',
    padding: '1px 6px', // in-between padding
    borderRadius: 6, // subtle rounded
    fontSize: 10, // halfway between 8.5 and old ~12
    lineHeight: 1.2,
    fontWeight: 500,
    color: '#fff',
    background: bg,
    marginLeft: 5
  };
  return (
    <span className={`k-chain-chip ${className}`} style={{ ...baseStyle, ...style }}>
      {key.toUpperCase()}
    </span>
  );
}

/** Larger badge (used in some layouts) */
export function ChainBadge({ chain = 'eth', children }) {
  const key = normalizeChain(chain);
  const bg = CHAIN_COLORS[key] || CHAIN_COLORS.eth;
  const style = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '3px 10px',
    borderRadius: 999,
    fontSize: 12,
    lineHeight: 1,
    color: '#fff',
    background: bg,
    boxShadow: '0 1px 0 rgba(0,0,0,.15)',
    minWidth: 56
  };
  return (
    <span className="k-chain-badge" style={style}>
      {children ?? key.toUpperCase()}
    </span>
  );
}

/** Selector pill used in headers */
export function ChainSelector({ value = 'all', onChange, options = ['all', 'eth', 'pulse', 'base'], size = 'sm' }) {
  const baseVars = {
    '--k-chip-padding-y': '6px',
    '--k-chip-padding-x': '12px',
    '--k-chip-radius': '12px',
    '--k-chip-font': size === 'sm' ? '0.9rem' : '1rem'
  };

  const btnStyle = (active, chain) =>
    active
      ? {
          ...baseVars,
          '--k-chip-active-bg': CHAIN_COLORS[normalizeChain(chain)] || CHAIN_COLORS.all
        }
      : baseVars;

  return (
    <div className="d-inline-flex align-items-center gap-2">
      {options.map((c) => {
        const active = value === c;
        const label = c === 'all' ? 'All' : c === 'eth' ? 'Ethereum' : c === 'pulse' ? 'PulseChain' : c === 'base' ? 'Base' : c;

        return (
          <button
            key={c}
            type="button"
            className={`k-chain-btn badge ${active ? 'is-active' : ''}`}
            style={btnStyle(active, c)}
            onClick={() => onChange?.(c)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
