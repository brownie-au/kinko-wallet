// src/contexts/RefreshContext.jsx
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const RefreshContext = createContext(null);
const TASK_TIMEOUT_MS = 20000;

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

    // Ensure both sync and async tasks are handled uniformly
    Promise.resolve()
      .then(() => task())
      .then(onSettle(resolve), onSettle(reject));
  });
}

export function RefreshProvider({ children }) {
  const tasksRef = useRef(new Map());
  const refreshingRef = useRef(false);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [lastRunAt, setLastRunAt] = useState(0);
  const [refreshCounter, setRefreshCounter] = useState(0);

  const registerTask = useCallback((name, fn) => {
    if (!name || typeof fn !== 'function') return () => { };
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
    if (refreshingRef.current) return [];

    const snapshot = Array.from(tasksRef.current.entries());
    refreshingRef.current = true;
    setIsRefreshing(true);
    setProgress({ done: 0, total: snapshot.length });

    try {
      if (snapshot.length === 0) {
        const now = Date.now();
        setLastRunAt(now);
        bump();
        return [];
      }

      const results = await Promise.allSettled(
        snapshot.map(([name, task]) =>
          runWithTimeout(name, () => task())
            .catch((error) => {
              // propagate rejection so allSettled reports it
              throw error;
            })
            .finally(() => {
              setProgress((prev) => {
                const total = snapshot.length;
                const done = Math.min(total, prev.done + 1);
                if (prev.done === done && prev.total === total) return prev;
                return { done, total };
              });
            })
        )
      );

      const now = Date.now();
      setLastRunAt(now);
      bump();
      return results;
    } finally {
      refreshingRef.current = false;
      setIsRefreshing(false);
      setProgress((prev) => {
        const total = snapshot.length;
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
