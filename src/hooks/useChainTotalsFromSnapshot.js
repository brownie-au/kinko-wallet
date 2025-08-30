// src/hooks/useChainTotalsFromSnapshot.js
/* eslint-disable import/no-relative-parent-imports */
import { useEffect, useMemo, useState } from 'react';
import { loadPortfolioSnapshot } from '../services/portfolioDataService';
import { useWallets } from '../contexts/WalletContext';

const nf2 = new Intl.NumberFormat('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n2 = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);

export default function useChainTotalsFromSnapshot() {
  const { wallets } = useWallets();
  const [asOf, setAsOf] = useState(0);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { snapshot } = await loadPortfolioSnapshot(wallets);
        if (!mounted) return;
        setAsOf(Number(snapshot?.asOf || Date.now()));
        setRows(Array.isArray(snapshot?.rows) ? snapshot.rows : []);
      } catch {
        if (!mounted) {
          /* noop */
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [wallets]);

  const chainTotals = useMemo(() => {
    const acc = { pulse: 0, ethereum: 0, base: 0, other: 0 };
    for (const r of rows) {
      const chain = String(r?.chain || '').toLowerCase();
      const usd = n2(r?.totalUsd ?? r?.usd ?? n2(r?.amount) * n2(r?.priceUsd));
      if (chain === 'pulse' || chain === 'pulsechain') acc.pulse += usd;
      else if (chain === 'eth' || chain === 'ethereum') acc.ethereum += usd;
      else if (chain === 'base') acc.base += usd;
      else acc.other += usd;
    }
    return acc;
  }, [rows]);

  return {
    asOf,
    rows,
    chainTotals,
    // helpers for convenience
    ethUsd: chainTotals.ethereum,
    plsUsd: chainTotals.pulse,
    baseUsd: chainTotals.base,
    fmt2: (x) => nf2.format(n2(x))
  };
}
