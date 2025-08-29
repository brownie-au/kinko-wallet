// src/hooks/useManagedAddresses.js
/* A tiny hook around the Managed Address Cache (5-min TTL).
   Responsibilities:
   - Read from the managedAddressCache service
   - Ensure a fresh snapshot on mount (unless a fresh one exists)
   - Subscribe to cache updates (cross-tab + same-tab)
   - Expose a `refresh()` that bypasses TTL (force=true)

   Usage:
     const { addresses, updatedAt, loading, error, refresh } = useManagedAddresses();
*/

import { useEffect, useState, useCallback } from 'react';
import {
    ensureManagedAddressCache,
    readManagedAddressCache,
    subscribeManagedAddressCache,
} from '../services/managedAddressCache';

export default function useManagedAddresses(options = {}) {
    const {
        autoRefresh = true,  // listen for cache updates
        preferFresh = true,  // if a fresh cache exists, use it without forcing
    } = options;

    const [addresses, setAddresses] = useState([]);
    const [updatedAt, setUpdatedAt] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async ({ force = false } = {}) => {
        setError('');
        try {
            setLoading(true);

            if (!force) {
                const cached = readManagedAddressCache({ freshOnly: preferFresh });
                if (cached) {
                    setAddresses(cached.addresses.map(a => a.address));
                    setUpdatedAt(Number(cached.updatedAt) || 0);
                    setLoading(false);
                    return;
                }
            }

            const snap = await ensureManagedAddressCache({ force });
            setAddresses((snap.addresses || []).map(a => a.address));
            setUpdatedAt(Number(snap.updatedAt) || Date.now());
        } catch (e) {
            setError(e?.message || 'Failed to load managed addresses');
        } finally {
            setLoading(false);
        }
    }, [preferFresh]);

    // Initial load
    useEffect(() => { load({ force: false }); }, [load]);

    // Subscribe to updates
    useEffect(() => {
        if (!autoRefresh) return () => { };
        const unsub = subscribeManagedAddressCache(() => {
            const cached = readManagedAddressCache({ freshOnly: false });
            if (cached) {
                setAddresses(cached.addresses.map(a => a.address));
                setUpdatedAt(Number(cached.updatedAt) || 0);
            }
        });
        return unsub;
    }, [autoRefresh]);

    const refresh = useCallback(() => load({ force: true }), [load]);

    return { addresses, updatedAt, loading, error, refresh };
}
