// src/utils/kinkoCache.js
// Super-simple localStorage JSON cache with TTL.

const NS = 'kinko.cache:';

export function getCachedJSON(key, ttlMs) {
  try {
    const raw = localStorage.getItem(NS + key);
    if (!raw) return null;

    const { t, data } = JSON.parse(raw);
    const ageMs = Date.now() - (t || 0);

    if (Number.isFinite(ttlMs) && ttlMs > 0 && ageMs > ttlMs) return null; // expired
    return { data, ageMs };
  } catch {
    return null;
  }
}

export function setCachedJSON(key, data) {
  try {
    localStorage.setItem(NS + key, JSON.stringify({ t: Date.now(), data }));
  } catch {
    // storage full / disabled — ignore
  }
}

export function clearCachedJSON(key) {
  try { localStorage.removeItem(NS + key); } catch {}
}

export function clearAllKinkoCache() {
  try {
    const prefix = NS;
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith(prefix)) localStorage.removeItem(k);
    }
  } catch {}
}
