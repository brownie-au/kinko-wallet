// src/utils/walletCache.js
const CACHE_PREFIX = 'kw:wallet-cache:'; // one key per wallet(+chain)
const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

/** Save a wallet snapshot (tokens, totals, chain, etc.) */
export function setWalletCache(key, payload) {
  if (!key) return;
  const data = { ...payload, updatedAt: Date.now() };
  localStorage.setItem(CACHE_PREFIX + key.toLowerCase(), JSON.stringify(data));
}

/** Read a wallet snapshot. Returns stale data too (sticky), with .stale flag. */
export function getWalletCache(key, { maxAge = DEFAULT_TTL_MS } = {}) {
  if (!key) return null;
  const k = CACHE_PREFIX + key.toLowerCase();
  try {
    const raw = localStorage.getItem(k);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !data.updatedAt) return null;
    const stale = Date.now() - data.updatedAt > maxAge;
    return { ...data, stale };
  } catch {
    return null;
  }
}

/** Clear one wallet(+chain) cache */
export function clearWalletCache(key) {
  if (!key) return;
  localStorage.removeItem(CACHE_PREFIX + key.toLowerCase());
}

/** Clear all cache entries for a wallet across chains (prefix match) */
export function clearWalletPrefix(address) {
  if (!address) return;
  const prefix = CACHE_PREFIX + address.toLowerCase();
  const toRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(prefix)) toRemove.push(k);
  }
  toRemove.forEach((k) => localStorage.removeItem(k));
}

/** Debug helper: read all wallet caches */
export function getAllWalletCaches() {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(CACHE_PREFIX)) {
      try {
        const data = JSON.parse(localStorage.getItem(k) || 'null');
        out.push({ key: k.replace(CACHE_PREFIX, ''), ...data });
      } catch {}
    }
  }
  return out;
}

export const WALLET_CACHE_DEFAULT_TTL = DEFAULT_TTL_MS;
