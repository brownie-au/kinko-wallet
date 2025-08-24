// src/hooks/useCacheFirst.js
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Cache-first data loader.
 * - Renders instantly from localStorage cache (if available)
 * - Revalidates in the background on mount
 * - Auto-refreshes every 10 minutes
 * - Exposes refreshNow() for your existing "Refresh" buttons
 *
 * Minimal contract expected from caller:
 *   - fetchFresh: () => Promise<any>  // returns latest data from chain/service
 *
 * Notes:
 * - We store cache and timestamp under cacheKey + ":data" and ":ts"
 * - We only update React state if data actually changed (stringified diff)
 */

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function useCacheFirst({
    cacheKey,
    fetchFresh,
    // Optional knobs:
    ttlMs = DEFAULT_TTL_MS,
    onError,
}) {
    const DATA_KEY = `${cacheKey}:data`;
    const TS_KEY = `${cacheKey}:ts`;

    // Read synchronously before first paint for instant render
    const initialData = useMemo(() => {
        try {
            const raw = localStorage.getItem(DATA_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    }, [DATA_KEY]);

    const [data, setData] = useState(initialData);
    const [isRefreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);

    const lastUpdated = useMemo(() => {
        try {
            const ts = Number(localStorage.getItem(TS_KEY) || 0);
            return ts || null;
        } catch {
            return null;
        }
    }, [TS_KEY, initialData]);

    const lastSavedJsonRef = useRef(initialData ? JSON.stringify(initialData) : '');

    const saveToCache = useCallback((next) => {
        try {
            const nextJson = JSON.stringify(next ?? null);
            if (nextJson !== lastSavedJsonRef.current) {
                localStorage.setItem(DATA_KEY, nextJson);
                lastSavedJsonRef.current = nextJson;
            }
            localStorage.setItem(TS_KEY, String(Date.now()));
        } catch {
            /* ignore quota errors */
        }
    }, [DATA_KEY, TS_KEY]);

    const applyData = useCallback((next) => {
        const nextJson = JSON.stringify(next ?? null);
        if (nextJson !== lastSavedJsonRef.current) {
            setData(next);
            saveToCache(next);
        } else {
            // no data change but ensure timestamp is fresh
            try { localStorage.setItem(TS_KEY, String(Date.now())); } catch { }
        }
    }, [saveToCache, TS_KEY]);

    const refreshNow = useCallback(async () => {
        if (!fetchFresh) return;
        setRefreshing(true);
        setError(null);
        try {
            const fresh = await fetchFresh(); // must return data shape your UI expects
            applyData(fresh);
        } catch (e) {
            setError(e);
            onError?.(e);
        } finally {
            setRefreshing(false);
        }
    }, [fetchFresh, applyData, onError]);

    // Background revalidation on mount
    useEffect(() => {
        refreshNow();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Periodic refresh (TTL)
    useEffect(() => {
        const id = setInterval(refreshNow, ttlMs);
        return () => clearInterval(id);
    }, [refreshNow, ttlMs]);

    return {
        data,                 // cached or fresh
        isRefreshing,         // spinner hook for your Refresh button
        error,                // surface if you want
        refreshNow,           // wire to your existing "Refresh" button
        lastUpdated,          // Date.now() ms (or null)
    };
}
