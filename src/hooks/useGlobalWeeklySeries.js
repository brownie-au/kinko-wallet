// src/hooks/useGlobalWeeklySeries.js
import { useEffect, useState } from 'react';
import { fetchGlobalDaily, toWeekly52 } from '../services/globalMarketService';

const LS_KEY = 'kw:globalWeekly:v1';
const ONE_DAY = 24 * 60 * 60 * 1000;

export default function useGlobalWeeklySeries() {
  const [series, setSeries] = useState(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(LS_KEY));
      return cached?.data || null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    let mounted = true;

    // 1) show cache instantly (if any)
    // 2) refresh in background if stale (> 1 day)
    async function load() {
      try {
        const now = Date.now();
        const cached = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
        const isFresh = cached && now - cached.savedAt < ONE_DAY;

        if (!isFresh) {
          const daily = await fetchGlobalDaily(370);
          const weekly = toWeekly52(daily);
          if (mounted) setSeries(weekly);
          localStorage.setItem(LS_KEY, JSON.stringify({ savedAt: now, data: weekly }));
        }
      } catch (e) {
        console.error('Global series refresh failed', e);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  return series; // [{t, marketCap, volume}, … 52]
}
