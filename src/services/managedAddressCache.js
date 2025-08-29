// src/services/managedAddressCache.js
/* Managed Address Cache (5-minute TTL)
   Purpose:
     - Keep a clean, centralized cache of the user's managed addresses.
     - Avoids scattering address reads across components and services.
     - Allows "drop-in" replacement later without touching UI.

   Data model (localStorage):
     key: 'kw:managed:addresses:v1'
     value: {
       updatedAt: <ms epoch>,
       addresses: [{ address: string, name?: string, chain?: string, source?: 'walletsLS'|'injected'|string }]
     }

   Public API:
     - readManagedAddressCache({ freshOnly }): -> { addresses, updatedAt } | null
     - writeManagedAddressCache(addresses): void
     - ensureManagedAddressCache({ sourceAddresses?, force? }): Promise<{ addresses, updatedAt }>
     - getManagedAddresses({ preferFresh? }): Promise<string[]> (lowercased unique)
     - subscribeManagedAddressCache(handler): () => void
     - clearManagedAddressCache(): void

   Notes:
     - By default, we build from localStorage 'wallets' if no source provided.
     - TTL is 5 minutes. 'force' bypasses TTL.
     - Event-driven: cross-tab + in-tab listeners notified via storage + CustomEvent.
*/

export const ADDR_LS_KEY = 'kw:managed:addresses:v1';
export const ADDR_EVENT = 'kw:managed:addresses:event';
export const ADDR_TTL_MS = 5 * 60 * 1000; // 5 minutes

/* ------------------ utils ------------------ */
const now = () => Date.now();

function isFresh(updatedAt) {
    return Number.isFinite(updatedAt) && (now() - Number(updatedAt) < ADDR_TTL_MS);
}

function normAddr(a) {
    const s = String(a || '').trim();
    // Lowercase hex/EVM style; leave others as-is if we can't tell.
    return /^0x[0-9a-fA-F]{4,}$/.test(s) ? s.toLowerCase() : s;
}

function uniqBy(arr, keyFn) {
    const seen = new Set();
    const out = [];
    for (const x of arr || []) {
        const k = keyFn(x);
        if (k && !seen.has(k)) {
            seen.add(k);
            out.push(x);
        }
    }
    return out;
}

function shallowEqualAddresses(a1 = [], a2 = []) {
    if (a1.length !== a2.length) return false;
    const s1 = new Set(a1.map(x => normAddr(x.address)));
    for (const b of a2) if (!s1.has(normAddr(b.address))) return false;
    return true;
}

/* ------------------ IO: localStorage ------------------ */
export function readManagedAddressCache({ freshOnly = false } = {}) {
    try {
        const raw = localStorage.getItem(ADDR_LS_KEY);
        if (!raw) return null;
        const obj = JSON.parse(raw);
        if (!obj || !Array.isArray(obj.addresses)) return null;
        if (freshOnly && !isFresh(obj.updatedAt)) return null;
        // Normalize shape
        const addresses = obj.addresses.map(x => ({
            address: normAddr(x.address),
            name: x.name || '',
            chain: x.chain || '',
            source: x.source || ''
        }));
        return { addresses, updatedAt: Number(obj.updatedAt) || 0 };
    } catch {
        return null;
    }
}

export function writeManagedAddressCache(addresses = []) {
    try {
        const normalized = uniqBy(
            (addresses || []).map(x => ({
                address: normAddr(x.address),
                name: x.name || '',
                chain: x.chain || '',
                source: x.source || ''
            })).filter(x => x.address),
            x => x.address
        );
        const payload = { updatedAt: now(), addresses: normalized };
        localStorage.setItem(ADDR_LS_KEY, JSON.stringify(payload));

        // Cross-tab storage event already fires in other tabs; this notifies same-tab listeners:
        try {
            const evt = new CustomEvent(ADDR_EVENT, { detail: { type: 'updated', payload } });
            window.dispatchEvent(evt);
        } catch { /* noop */ }
    } catch { /* noop */ }
}

export function clearManagedAddressCache() {
    try {
        localStorage.removeItem(ADDR_LS_KEY);
        const evt = new CustomEvent(ADDR_EVENT, { detail: { type: 'cleared' } });
        window.dispatchEvent(evt);
    } catch { /* noop */ }
}

/* ------------------ sources ------------------ */
// Default source = localStorage('wallets'), as used by the app today.
function readWalletsLS() {
    try {
        const arr = JSON.parse(localStorage.getItem('wallets') || '[]');
        if (!Array.isArray(arr)) return [];
        return arr.map(w => ({
            address: normAddr(w?.address || w),
            name: String(w?.name || '').trim(),
            chain: String(w?.chain || ''), // optional
            source: 'walletsLS'
        })).filter(x => x.address);
    } catch {
        return [];
    }
}

/* ------------------ builders ------------------ */
function buildAddressList({ sourceAddresses } = {}) {
    const fromLS = readWalletsLS();
    const injected = Array.isArray(sourceAddresses) ? sourceAddresses : [];
    const merged = [...injected, ...fromLS].filter(x => x && x.address);
    return uniqBy(merged, x => normAddr(x.address));
}

/* ------------------ API ------------------ */
export async function ensureManagedAddressCache({ sourceAddresses, force = false } = {}) {
    const cached = readManagedAddressCache({ freshOnly: !force });
    const built = buildAddressList({ sourceAddresses });

    if (cached && !force) {
        // If fresh and same set, reuse
        if (isFresh(cached.updatedAt) && shallowEqualAddresses(cached.addresses, built)) {
            return cached;
        }
    }

    // Write new snapshot (always) if force or stale or changed
    writeManagedAddressCache(built);
    return { addresses: built, updatedAt: now() };
}

/** Convenience: returns lowercased array of addresses only. */
export async function getManagedAddresses({ preferFresh = true } = {}) {
    const cached = readManagedAddressCache({ freshOnly: preferFresh });
    if (cached) return cached.addresses.map(x => x.address);
    const ensured = await ensureManagedAddressCache({ force: false });
    return ensured.addresses.map(x => x.address);
}

/** Subscribe to cache updates. Returns an unsubscribe fn. */
export function subscribeManagedAddressCache(handler) {
    if (typeof handler !== 'function') return () => { };
    const onStorage = (e) => {
        if (e?.key && e.key !== ADDR_LS_KEY) return;
        handler({ type: 'storage', key: e?.key });
    };
    const onCustom = (e) => handler({ type: 'custom', detail: e?.detail || {} });

    window.addEventListener('storage', onStorage);
    window.addEventListener(ADDR_EVENT, onCustom);
    return () => {
        window.removeEventListener('storage', onStorage);
        window.removeEventListener(ADDR_EVENT, onCustom);
    };
}
