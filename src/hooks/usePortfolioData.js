// src/hooks/usePortfolioData.js
/* eslint-disable import/no-relative-parent-imports */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  loadPortfolioSnapshot, // cache-first read (may be 'cached' or 'fresh')
  refreshPortfolioSnapshot, // background refresh using scheduler
  buildPortfolioSnapshotNow // hard, immediate rebuild (for the button)
} from '../services/portfolioDataService';

import { useWallets } from '../contexts/WalletContext';
import walletsStatic from '../data/wallets.js';

/** Resolve the wallet list (override -> context -> localStorage -> static) */
function resolveWallets(ctx, override) {
  if (Array.isArray(override) && override.length) return override;

  const fromCtx = Array.isArray(ctx?.wallets) ? ctx.wallets : [];
  if (fromCtx.length) return fromCtx;

  try {
    const fromLS = JSON.parse(localStorage.getItem('wallets') || '[]');
    if (Array.isArray(fromLS) && fromLS.length) return fromLS;
  } catch {}

  return walletsStatic;
}

/**
 * Cache-first + silent background refresh.
 * - Initial call: show cached snapshot if present (no flash)
 * - Then kick a background refresh that updates snapshot when done
 * - expose refreshNow() to force an immediate rebuild
 */
export function usePortfolioData(walletsOverride) {
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'cached' | 'fresh' | 'error'
  const [snapshot, setSnapshot] = useState(null);

  let ctx;
  try {
    ctx = useWallets();
  } catch {
    ctx = undefined;
  }

  const wallets = resolveWallets(ctx, walletsOverride);

  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );

  // ---- initial load: cache-first, then silent background refresh
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setStatus('loading');

      try {
        // 1) Cache-first: immediate UI
        const res = await loadPortfolioSnapshot(wallets);
        if (!cancelled && mounted.current) {
          setSnapshot(res?.snapshot || null);
          setStatus(res?.status || 'cached');
        }

        // 2) Silent background refresh (do NOT flip to loading)
        try {
          const fresh = await refreshPortfolioSnapshot(wallets);
          if (!cancelled && mounted.current && fresh) {
            setSnapshot(fresh);
            setStatus('fresh');
          }
        } catch {
          // keep whatever we had (cached) on background failure
        }
      } catch {
        if (!cancelled && mounted.current) setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(wallets)]);

  const rows = useMemo(() => (Array.isArray(snapshot?.rows) ? snapshot.rows : []), [snapshot]);
  const totals = useMemo(() => snapshot?.totals || { totalUsd: 0, count: 0 }, [snapshot]);

  // Explicit hard refresh for the button (forces rebuild; shows loading)
  const refreshNow = async () => {
    setStatus('loading');
    try {
      const fresh = await buildPortfolioSnapshotNow(wallets);
      if (mounted.current && fresh) {
        setSnapshot(fresh);
        setStatus('fresh');
      }
    } catch {
      if (mounted.current) setStatus('error');
    }
  };

  // Optional: throttled refresh via scheduler (keeps status unless empty)
  const refreshThrottled = async () => {
    setStatus((s) => (s === 'loading' ? s : 'loading'));
    try {
      const fresh = await refreshPortfolioSnapshot(wallets);
      if (mounted.current && fresh) {
        setSnapshot(fresh);
        setStatus('fresh');
      } else if (mounted.current) {
        setStatus('cached');
      }
    } catch {
      if (mounted.current) setStatus('error');
    }
  };

  return { snapshot: snapshot || null, rows, totals, status, refreshNow, refreshThrottled };
}

export default usePortfolioData;
