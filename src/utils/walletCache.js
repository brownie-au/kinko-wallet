// src/utils/walletCache.js
const CACHE_PREFIX = 'kw:wallet-cache:'; // one key per wallet
const DEFAULT_TTL_MS = 10 * 60 * 1000;   // 10 minutes (tweak as you like)

/** Save a wallet snapshot (tokens, totals, chain, etc.) */
export function setWalletCache(address, payload) {
  if (!address) return;
  const key = CACHE_PREFIX + address.toLowerCase();
  const data = { ...payload, updatedAt: Date.now() };
  localStorage.setItem(key, JSON.stringify(data));
}

/** Read a wallet snapshot. If maxAge is provided, stale is still returned (we want "sticky") */
export function getWalletCache(address, { maxAge = DEFAULT_TTL_MS } = {}) {
  if (!address) return null;
  const key = CACHE_PREFIX + address.toLowerCase();
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !data.updatedAt) return null;
    // We *keep* stale data (sticky), but you can check staleness via .stale
    const stale = Date.now() - data.updatedAt > maxAge;
    return { ...data, stale };
  } catch {
    return null;
  }
}

/** Optional: clear one wallet’s cache */
export function clearWalletCache(address) {
  if (!address) return;
  localStorage.removeItem(CACHE_PREFIX + address.toLowerCase());
}

/** Optional: read all wallet caches (useful for debugging) */
export function getAllWalletCaches() {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(CACHE_PREFIX)) {
      try {
        const data = JSON.parse(localStorage.getItem(k) || 'null');
        out.push({ address: k.replace(CACHE_PREFIX, ''), ...data });
      } catch {}
    }
  }
  return out;
}
