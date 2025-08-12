// src/components/ChainUI.jsx
import React from 'react';

// Accent colours (kept soft so they work on light/dark)
export const CHAIN_COLORS = {
  all:   'var(--bs-primary, #0d6efd)',
  eth:   '#2ecc71',
  pulse: '#9b59b6',
  base:  '#3498db'
};

/** Tiny rounded badge for token rows (left-hand coloured chips) */
export function ChainBadge({ chain = 'eth', children }) {
  const bg = CHAIN_COLORS[chain] || CHAIN_COLORS.eth;
  const style = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 12,
    lineHeight: 1,
    color: '#fff',
    background: bg,
    boxShadow: '0 1px 0 rgba(0,0,0,.15)',
    // make all chips the same visual width (ETH/Base vs Pulse)
    minWidth: 56
  };
  return <span className="k-chain-badge" style={style}>{children ?? chain.toUpperCase()}</span>;
}

/** Selector pill used in headers; consistent across pages */
export function ChainSelector({
  value = 'all',
  onChange,
  options = ['all','eth','pulse','base'],
  size = 'sm'
}) {
  const baseVars = {
    // spacing/size via CSS so themes can tweak if needed
    '--k-chip-padding-y': '6px',
    '--k-chip-padding-x': '12px',
    '--k-chip-radius': '12px',
    '--k-chip-font': size === 'sm' ? '0.85rem' : '1rem'
  };

  // Active: we only pass the accent color as a CSS var; the rest is styled in CSS
  const btnStyle = (active, chain) =>
    active
      ? {
          ...baseVars,
          '--k-chip-active-bg': CHAIN_COLORS[chain] || CHAIN_COLORS.all
        }
      : baseVars;

  return (
    <div className="d-inline-flex align-items-center gap-2">
      {options.map((c) => {
        const active = value === c;
        const label =
          c === 'all' ? 'All' :
          c === 'eth' ? 'Ethereum' :
          c === 'pulse' ? 'PulseChain' :
          c === 'base' ? 'Base' : c;

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
