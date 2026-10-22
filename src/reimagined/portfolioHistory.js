import { hex } from './crypto.js';
export const HISTORY_RETENTION = 32 * 86400000;
const prefix = 'kinko:portfolio-history:v1:';
const retention = HISTORY_RETENTION;
const encode = (bytes) => {
  const parts = [];
  for (let i = 0; i < bytes.length; i += 32768) parts.push(String.fromCharCode(...bytes.subarray(i, i + 32768)));
  return btoa(parts.join(''));
};
const decode = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
async function sealHistory(access, samples) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(`kinko:portfolio-history:v1:${access.id}`) },
    access.encryptionKey,
    new TextEncoder().encode(JSON.stringify({ version: 1, samples }))
  );
  return { version: 1, type: 'portfolio-history', iv: encode(iv), ciphertext: encode(new Uint8Array(ciphertext)) };
}
async function unsealHistory(access, envelope) {
  if (envelope?.version !== 1 || envelope.type !== 'portfolio-history') throw new Error('Saved portfolio history is unsupported.');
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decode(envelope.iv), additionalData: new TextEncoder().encode(`kinko:portfolio-history:v1:${access.id}`) },
    access.encryptionKey,
    decode(envelope.ciphertext)
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}

export async function identifyObservation(sample) {
  if (!sample) return null;
  const coverage = /^[a-f0-9]{64}$/.test(sample.coverage)
    ? sample.coverage
    : hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sample.coverage)));
  return { ...sample, coverage };
}
export function normalizeHistory(samples, now = Date.now()) {
  if (!Array.isArray(samples)) throw new Error('Saved portfolio history is invalid.');
  const seen = new Set();
  const valid = samples
    .filter(
      (s) =>
        s &&
        typeof s.scope === 'string' &&
        s.scope.length <= 100 &&
        /^[a-f0-9]{64}$/.test(s.coverage) &&
        Number.isFinite(s.time) &&
        s.time > now - retention &&
        s.time <= now + 300000 &&
        Number.isFinite(s.value) &&
        s.value >= 0
    )
    .sort((a, b) => a.time - b.time)
    .filter((s) => {
      const key = JSON.stringify([s.scope, s.time, s.coverage]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((s) => ({
      scope: s.scope,
      time: s.time,
      value: s.value,
      coverage: s.coverage,
      partial: !!s.partial,
      ...(s.breakBefore ? { breakBefore: true } : {}),
      excluded: Number.isSafeInteger(s.excluded) && s.excluded >= 0 ? s.excluded : 0
    }));
  return compactHistory(valid, now);
}
// Keep actual observations, never averages. Each scope gets its own time budget.
// Recent: 2-minute buckets; days 2–7: 15 minutes; older: one hour.
export function compactHistory(samples, now = Date.now()) {
  const buckets = new Map();
  for (const s of samples) {
    if (s.time <= now - retention) continue;
    const age = now - s.time;
    const width = age < 86400000 ? 120000 : age < 7 * 86400000 ? 900000 : 3600000;
    const key = JSON.stringify([s.scope, width, Math.floor(s.time / width)]);
    const b = buckets.get(key);
    if (!b) buckets.set(key, { first: s, last: s, min: s, max: s });
    else {
      b.last = s;
      if (s.value < b.min.value) b.min = s;
      if (s.value > b.max.value) b.max = s;
    }
  }
  const keep = new Set([...buckets.values()].flatMap((b) => [b.first, b.last, b.min, b.max]));
  const prior = new Map(), breaks = new Set(), result = [];
  for (const s of samples) {
    const previous = prior.get(s.scope);
    if (s.breakBefore || (previous && previous.coverage !== s.coverage)) breaks.add(s.scope);
    prior.set(s.scope, s);
    if (!keep.has(s)) continue;
    result.push({ ...s, ...(breaks.has(s.scope) ? { breakBefore: true } : {}) });
    breaks.delete(s.scope);
  }
  return result;
}
// Separate, encrypted browser history avoids changing cloud watchlist revisions on every refresh.
export function createPortfolioHistory(
  storage = {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
    removeItem: (key) => localStorage.removeItem(key)
  }
) {
  const generations = new Map();
  const load = async (access, prune = true) => {
    const raw = storage.getItem(prefix + access.id);
    if (!raw) return [];
    const data = await unsealHistory(access, JSON.parse(raw));
    if (data.version !== 1) throw new Error('Saved portfolio history is unsupported.');
    const samples = normalizeHistory(data.samples);
    if (prune && JSON.stringify(samples) !== JSON.stringify(data.samples)) {
      const generation = generations.get(access.id) || 0;
      try {
        const pruned = await sealHistory(access, samples);
        if ((generations.get(access.id) || 0) === generation && storage.getItem(prefix + access.id) === raw)
          storage.setItem(prefix + access.id, JSON.stringify(pruned));
      } catch { /* Cleanup failure must not prevent restoring readable history. */ }
    }
    return samples;
  };
  return {
    load,
    async save(access, samples) {
      const generation = generations.get(access.id) || 0;
      const operation = async () => {
        let prior = [];
        try {
          prior = await load(access, false);
        } catch {
          /* Fresh observations can replace damaged history; write failures still propagate. */
        }
        const merged = normalizeHistory([...prior, ...samples]);
        const envelope = await sealHistory(access, merged);
        if ((generations.get(access.id) || 0) !== generation) return;
        storage.setItem(prefix + access.id, JSON.stringify(envelope));
      };
      if (globalThis.navigator?.locks) await navigator.locks.request(prefix + access.id, operation);
      else await operation();
    },
    clear(access) {
      generations.set(access.id, (generations.get(access.id) || 0) + 1);
      storage.removeItem(prefix + access.id);
    }
  };
}
export const portfolioHistory = createPortfolioHistory();
