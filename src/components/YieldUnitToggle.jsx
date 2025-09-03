// src/components/YieldUnitToggle.jsx
import React from 'react';

/**
 * Tiny toggle used next to Yield value to flip between native token and USD.
 * Controlled component.
 */
export default function YieldUnitToggle({
  checked = false,
  onChange = () => {},
  title = 'Toggle USD',
  className = '',
  label = 'USD'
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className={`kw-yield-toggle ${checked ? 'active' : ''} ${className}`}
    >
      {label}
    </button>
  );
}

