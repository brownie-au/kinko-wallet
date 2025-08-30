// src/components/WalletFilterChips.jsx
import { useEffect, useMemo, useState } from 'react';

/**
 * Rectangular wallet filter buttons (same style/behavior used on the eHEX page).
 *
 * Props:
 * - wallets: [{ address: "0x..", label: "HEX MAIN" }, ...]
 * - onChange: (addrs: string[], isAll: boolean) => void
 * - lsKey?: string  // optional localStorage key (defaults to shared key)
 */
export default function WalletFilterChips({ wallets = [], onChange, lsKey }) {
  const LS_KEY = lsKey || 'kw:staking:walletChipSel';

  // unique, normalized list
  const items = useMemo(() => {
    const m = new Map();
    (wallets || []).forEach((w) => {
      const addr = String(w?.address || '').toLowerCase();
      if (!addr) return;
      if (!m.has(addr)) {
        const short = '0x…' + addr.slice(-4);
        m.set(addr, { address: addr, label: w?.label || short });
      }
    });
    return Array.from(m.values());
  }, [wallets]);

  const [sel, setSel] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return new Set(); // empty = All
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? new Set(arr.map((a) => a.toLowerCase())) : new Set();
    } catch {
      return new Set();
    }
  });

  // prune selections when items change
  useEffect(() => {
    const allowed = new Set(items.map((i) => i.address));
    const next = new Set();
    sel.forEach((s) => allowed.has(s) && next.add(s));
    if (next.size !== sel.size) setSel(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map((i) => i.address).join('|')]);

  const isAll = sel.size === 0 || sel.size === items.length;

  // notify parent + persist
  useEffect(() => {
    const allAddrs = items.map((i) => i.address);
    onChange?.(isAll ? allAddrs : Array.from(sel), isAll);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(Array.from(sel)));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAll, sel, items.map((i) => i.address).join('|')]);

  const toggleAll = () => setSel(new Set()); // collapse to All
  const toggleOne = (addr) => {
    const next = new Set(sel);
    next.has(addr) ? next.delete(addr) : next.add(addr);
    // if everything is selected, store as "All" (empty) to keep UX consistent
    if (next.size === 0 || next.size === items.length) setSel(new Set());
    else setSel(next);
  };

  return (
    <div className="d-flex flex-wrap align-items-center gap-2">
      <button
        type="button"
        className={`btn btn-sm ${isAll ? 'btn-primary' : 'btn-outline-secondary'}`}
        onClick={toggleAll}
        aria-pressed={isAll}
      >
        All
      </button>

      {items.map((w) => {
        const active = !isAll && sel.has(w.address);
        return (
          <button
            key={w.address}
            type="button"
            className={`btn btn-sm ${active ? 'btn-primary' : 'btn-outline-secondary'}`}
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
