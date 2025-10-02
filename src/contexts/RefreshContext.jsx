// src/contexts/RefreshContext.jsx
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

import { clearWalletPrefix } from '@/utils/walletCache';
import { buildPortfolioDetailed } from '@/services/portfolioAggService';
import { refreshHexStakesAndCache } from '@/services/kw-hexPulseService';
import { refreshEhexStakesAndCache } from '@/services/kw-ehexStakingService';

const RefreshContext = createContext(null);
const TASK_TIMEOUT_MS = 20000;
const GLOBAL_REASON = 'global-refresh';

/**
 * Run a task with a timeout guard. Resolves/rejects exactly once.
 * @param {string} name
 * @param {() => (void|Promise<void>)} task
 */
function runWithTimeout(name, task) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const onSettle = (fn) => (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`Task "${name}" timed out after ${TASK_TIMEOUT_MS}ms`));
    }, TASK_TIMEOUT_MS);

    Promise.resolve()
      .then(() => task())
      .then(onSettle(resolve), onSettle(reject));
  });
}

function getVisibleWallets() {
  try {
    const raw = localStorage.getItem('wallets') || '[]';
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((wallet) => wallet && !wallet.hidden)
      .map((wallet) => ({
        address: wallet.address,
        name: wallet.name
      }))
      .filter((wallet) => typeof wallet.address === 'string' && wallet.address);
  } catch {
    return [];
  }
}

export function RefreshProvider({ children }) {
  const tasksRef = useRef(new Map());
  const refreshingRef = useRef(false);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [lastRunAt, setLastRunAt] = useState(0);
  const [refreshCounter, setRefreshCounter] = useState(0);

  const registerTask = useCallback((name, fn) => {
    if (!name || typeof fn !== 'function') return () => {};
    const key = String(name);
    tasksRef.current.set(key, fn);
    return () => {
      const current = tasksRef.current.get(key);
      if (current === fn) tasksRef.current.delete(key);
    };
  }, []);

  const bump = useCallback(() => {
    setRefreshCounter((n) => n + 1);
  }, []);

  const refreshAll = useCallback(async () => {
    if (refreshingRef.current) return null;

    const snapshot = Array.from(tasksRef.current.entries());
    const wallets = getVisibleWallets();
    const walletAddresses = wallets
      .map((wallet) => String(wallet.address || '').trim())
      .filter(Boolean);

    const txTask = tasksRef.current.get('transaction-history') || null;
    const otherTasks = snapshot.filter(([name]) =>
      !name.startsWith('wallet-detail') &&
      !name.startsWith('staking:') &&
      name !== 'portfolio-overview' &&
      name !== 'transaction-history'
    );

    const walletSteps = wallets.length;
    const stakingSteps = 2; // HEX + eHEX
    const portfolioSteps = 1;
    const historySteps = txTask ? 1 : 0;
    const otherSteps = otherTasks.length;
    const totalSteps = walletSteps + stakingSteps + portfolioSteps + historySteps + otherSteps;

    refreshingRef.current = true;
    setIsRefreshing(true);
    setProgress({ done: 0, total: totalSteps });

    const tick = () => {
      if (!totalSteps) return;
      setProgress((prev) => {
        const total = prev.total || totalSteps;
        const done = Math.min(total, prev.done + 1);
        if (done === prev.done && total === prev.total) return prev;
        return { done, total };
      });
    };

    const walletResults = [];
    let hexPayload = null;
    let ehexPayload = null;
    let portfolioPayload = null;
    let historyResult = null;
    let otherResults = [];

    try {
      const seenGenericWalletTask = new Set();
      const walletSettled = await Promise.allSettled(
        wallets.map(async (wallet) => {
          const address = String(wallet?.address || '').trim();
          if (!address) {
            tick();
            return undefined;
          }

          try {
            clearWalletPrefix(address);
            await buildPortfolioDetailed([{ address, name: wallet?.name }], { force: true });

            const lower = address.toLowerCase();
            const specificKey = `wallet-detail:${lower}`;
            const hasSpecific = tasksRef.current.has(specificKey);
            const taskName = hasSpecific ? specificKey : 'wallet-detail';
            const taskFn = tasksRef.current.get(taskName);
            if (taskFn && (!hasSpecific ? !seenGenericWalletTask.has(taskName) : true)) {
              if (!hasSpecific) seenGenericWalletTask.add(taskName);
              try {
                await runWithTimeout(taskName, () => taskFn({
                  reason: GLOBAL_REASON,
                  wallet
                }));
              } catch (error) {
                console.warn(`[refresh] wallet task "${taskName}" failed`, error);
              }
            }
          } finally {
            tick();
          }
        })
      );
      walletResults.push(...walletSettled);

      const stakingSettled = await Promise.allSettled([
        (async () => {
          try {
            hexPayload = await refreshHexStakesAndCache(walletAddresses);
            return hexPayload;
          } finally {
            tick();
          }
        })(),
        (async () => {
          try {
            ehexPayload = await refreshEhexStakesAndCache({ chain: 'ethereum', wallets: walletAddresses });
            return ehexPayload;
          } finally {
            tick();
          }
        })()
      ]);

      const stakingHexTask = tasksRef.current.get('staking:hex');
      if (stakingHexTask && hexPayload) {
        try {
          await runWithTimeout('staking:hex', () => stakingHexTask({
            reason: GLOBAL_REASON,
            payload: hexPayload,
            wallets: walletAddresses
          }));
        } catch (error) {
          console.warn('[refresh] staking:hex task failed', error);
        }
      }

      const stakingEhexTask = tasksRef.current.get('staking:ehex');
      if (stakingEhexTask && ehexPayload) {
        try {
          await runWithTimeout('staking:ehex', () => stakingEhexTask({
            reason: GLOBAL_REASON,
            payload: ehexPayload,
            wallets: walletAddresses
          }));
        } catch (error) {
          console.warn('[refresh] staking:ehex task failed', error);
        }
      }

      let portfolioStatus;
      try {
        const value = await buildPortfolioDetailed(wallets, { force: false });
        portfolioPayload = value;
        portfolioStatus = { status: 'fulfilled', value };
      } catch (error) {
        portfolioStatus = { status: 'rejected', reason: error };
      } finally {
        tick();
      }

      const portfolioTask = tasksRef.current.get('portfolio-overview');
      if (portfolioTask && portfolioPayload) {
        try {
          await runWithTimeout('portfolio-overview', () => portfolioTask({
            reason: GLOBAL_REASON,
            payload: portfolioPayload
          }));
        } catch (error) {
          console.warn('[refresh] portfolio-overview task failed', error);
        }
      }

      if (txTask) {
        try {
          const value = await runWithTimeout('transaction-history', () => txTask({ reason: GLOBAL_REASON }));
          historyResult = { status: 'fulfilled', value };
        } catch (error) {
          historyResult = { status: 'rejected', reason: error };
        } finally {
          tick();
        }
      }

      otherResults = await Promise.allSettled(
        otherTasks.map(([name, task]) =>
          runWithTimeout(name, () => task({ reason: GLOBAL_REASON }))
            .catch((error) => {
              throw error;
            })
            .finally(() => {
              tick();
            })
        )
      );

      const now = Date.now();
      setLastRunAt(now);
      bump();

      return {
        walletResults,
        stakingResults: stakingSettled,
        portfolioResult: portfolioStatus,
        historyResult,
        otherResults
      };
    } finally {
      refreshingRef.current = false;
      setIsRefreshing(false);
      setProgress((prev) => {
        const total = prev.total || totalSteps;
        if (prev.done === total && prev.total === total) return prev;
        return { done: total, total };
      });
    }
  }, [bump]);

  const value = useMemo(
    () => ({
      registerTask,
      refreshAll,
      isRefreshing,
      progress,
      lastRunAt,
      refreshCounter,
      bump
    }),
    [registerTask, refreshAll, isRefreshing, progress, lastRunAt, refreshCounter, bump]
  );

  return <RefreshContext.Provider value={value}>{children}</RefreshContext.Provider>;
}

export function useRefresh() {
  const ctx = useContext(RefreshContext);
  if (!ctx) {
    throw new Error('useRefresh must be used within a RefreshProvider');
  }
  return ctx;
}

export default RefreshContext;

