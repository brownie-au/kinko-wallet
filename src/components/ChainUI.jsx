// src/components/ChainUI.jsx
// Small, theme-aware chain badges + selector pills used across the app.

import React from 'react';

/** Shared color map (kept soft so it works on light & dark) */
export const CHAIN_COLORS = {
  all:   'var(--bs-primary, #0d6efd)',
  eth:   '#2ecc71',  // green
  pulse: '#9b59b6',  // purple
  base:  '#3498db'   // blue
};

/** Tiny rounded badge for listing/legend use */
export function ChainBadge({ chain = 'eth', children }) {
  const bg = CHAIN_COLORS[chain] || CHAIN_COLORS.eth;
  const style = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 12,
    lineHeight: 1,
    color: '#fff',
    background: bg,
    boxShadow: '0 1px 0 rgba(0,0,0,.15)'
  };
  return <span className="k-chain-badge" style={style}>{children ?? chain.toUpperCase()}</span>;
}

/** Selector pill used in headers; keeps Datta Able spacing/contrast */
export function ChainSelector({
  value = 'all',
  onChange,
  options = ['all','eth','pulse','base'],
  size = 'sm'
}) {
  const btnStyle = (active, chain) => ({
    border: 'none',
    borderRadius: 12,
    padding: '6px 12px',
    fontSize: size === 'sm' ? '0.85rem' : '1rem',
    lineHeight: 1,
    cursor: 'pointer',
    color: active ? '#fff' : 'var(--bs-body-color)',
    background: active ? (CHAIN_COLORS[chain] || CHAIN_COLORS.all) : 'var(--bs-secondary-bg)',
    opacity: active ? 1 : 0.85
  });

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
            className="badge"
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

/** Optional: small vertical legend you can drop on any page’s left side */
export function ChainLegend({ chains = ['eth','pulse','base'] }) {
  const wrap = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8
  };
  return (
    <div className="k-chain-legend" style={wrap}>
      {chains.map((c) => (
        <ChainBadge key={c} chain={c}>
          {c === 'eth' ? 'ETH' : c === 'pulse' ? 'Pulse' : c === 'base' ? 'Base' : c}
        </ChainBadge>
      ))}
    </div>
  );
}
