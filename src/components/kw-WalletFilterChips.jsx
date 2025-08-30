// src/components/kw-WalletFilterChips.jsx
import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import './kw-wallet-chips.css';

/**
 * Wallet filter chips with an "All" chip and multi-select behaviour.
 *
 * Props:
 *  - wallets: Array<{ address: string, label?: string }>
 *  - onChange: (selectedAddresses: string[], isAll: boolean) => void
 *  - persistKey?: string  // optional localStorage key to remember selection
 */
export default function KwWalletFilterChips({ wallets, onChange, persistKey = 'kw:staking:walletChipSel' }) {
  const normalised = useMemo(() => {
    // Deduplicate by address and provide a fallback label
    const unique = new Map();
    (wallets || []).forEach((w) => {
      const addr = (w?.address || '').toLowerCase();
      if (!addr) return;
      if (!unique.has(addr)) {
        const short = addr.slice(0, 4) + '…' + addr.slice(-4);
        unique.set(addr, { address: addr, label: w?.label || short });
      }
    });
    return Array.from(unique.values());
  }, [wallets]);

  // Default is "All" selected (empty set = All)
  const [selected, setSelected] = useState(() => {
    try {
      if (!persistKey) return new Set();
      const raw = localStorage.getItem(persistKey);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? new Set(arr.map((a) => a.toLowerCase())) : new Set();
    } catch {
      return new Set();
    }
  });

  // Keep selection sane if wallet list changes
  useEffect(() => {
    if (!normalised.length) return;
    const addrs = new Set(normalised.map((w) => w.address));
    const next = new Set();
    selected.forEach((s) => {
      if (addrs.has(s)) next.add(s);
    });
    if (next.size !== selected.size) setSelected(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalised.map((w) => w.address).join('|')]);

  const isAll = selected.size === 0 || selected.size === normalised.length;

  // Publish selection to parent
  useEffect(() => {
    if (isAll) {
      onChange(
        normalised.map((w) => w.address),
        true
      );
    } else {
      onChange(Array.from(selected), false);
    }
    if (persistKey) {
      try {
        localStorage.setItem(persistKey, JSON.stringify(Array.from(selected)));
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, normalised.map((w) => w.address).join('|')]);

  const toggleAll = () => setSelected(new Set()); // empty set == All

  const toggleOne = (addr) => {
    const next = new Set(selected);
    if (next.has(addr)) next.delete(addr);
    else next.add(addr);

    // If selection equals all or none, collapse to "All" (empty set)
    const allCount = normalised.length;
    if (next.size === 0 || next.size === allCount) {
      setSelected(new Set());
    } else {
      setSelected(next);
    }
  };

  return (
    <div className="kw-wallet-chips" role="group" aria-label="Filter by wallet">
      <button
        type="button"
        className={classNames('kw-chip', 'kw-chip--all', { 'is-active': isAll })}
        onClick={toggleAll}
        aria-pressed={isAll}
        title="Show all wallets"
      >
        All
      </button>

      {normalised.map((w) => {
        const active = !isAll && selected.has(w.address);
        return (
          <button
            key={w.address}
            type="button"
            className={classNames('kw-chip', { 'is-active': active })}
            onClick={() => toggleOne(w.address)}
            aria-pressed={active}
            title={w.address}
          >
            {w.label}
          </button>
        );
      })}
    </div>
  );
}

KwWalletFilterChips.propTypes = {
  wallets: PropTypes.arrayOf(
    PropTypes.shape({
      address: PropTypes.string.isRequired,
      label: PropTypes.string
    })
  ),
  onChange: PropTypes.func.isRequired,
  persistKey: PropTypes.string
};
