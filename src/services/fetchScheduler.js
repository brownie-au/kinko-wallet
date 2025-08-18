// src/services/fetchScheduler.js
// Ensures at most one fetch per key runs within a window (default 5 minutes).
// Also dedupes concurrent callers: everyone awaits the same promise.

const inflight = new Map(); // key -> Promise
const lastRun = new Map();  // key -> timestamp

export async function scheduledFetch(key, fn, { minIntervalMs = 5 * 60_000 } = {}) {
  const now = Date.now();

  // If something is already running for this key, share it
  if (inflight.has(key)) return inflight.get(key);

  // If last run was recent, skip and return null to signal "use cache"
  const last = lastRun.get(key) || 0;
  if (now - last < minIntervalMs) return null;

  const p = (async () => {
    try {
      const res = await fn();
      lastRun.set(key, Date.now());
      return res;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, p);
  return p;
}
