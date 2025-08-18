// src/utils/cacheStore.js
// Adapter so existing imports continue to work, but we use walletCache underneath.

import { getWalletCache, setWalletCache } from './walletCache';

/**
 * Read a cached value by key. Honors TTL if passed when it was set.
 * Returns the plain value or null.
 */
export async function cacheGet(key) {
  try {
    return getWalletCache(key) ?? null;
  } catch {
    return null;
  }
}

/**
 * Write a value with a TTL (ms). If ttlMs is falsy, falls back to walletCache default.
 */
export async function cacheSet(key, value, ttlMs) {
  try {
    // walletCache supports an options bag with { maxAge }
    setWalletCache(key, value, { maxAge: Number(ttlMs) || undefined });
  } catch {
    /* ignore */
  }
}
