import { hex } from './crypto.js';
import { bucketWidth, compatible } from './historyChart.js';
export const HISTORY_RETENTION = Infinity; // No age-based deletion; actual observations are compacted.
const prefix = 'kinko:portfolio-history:v1:';
const queues = new Map();
const encode = (bytes) => {
  const parts = [];
  for (let i = 0; i < bytes.length; i += 32768) parts.push(String.fromCharCode(...bytes.subarray(i, i + 32768)));
  return btoa(parts.join(''));
};
const decode = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
async function sealHistory(access, samples, attempts = []) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(`kinko:portfolio-history:v1:${access.id}`) },
    access.encryptionKey,
    new TextEncoder().encode(JSON.stringify({ version: 2, samples, attempts }))
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
  const preferred = new Map();
  for (const s of samples) {
    if (!s) continue;
    const key = JSON.stringify([s.scope, s.time, s.coverage]);
    const prior = preferred.get(key);
    const rank = (p) => p?.provenance?.kind === 'observation' ? 3 : p?.provenance?.kind === 'backfill' ? 2 : 1;
    // Exact-identity duplicates: direct observations > archive > legacy; newest equal-rank wins.
    if (!prior || rank(s) >= rank(prior)) preferred.set(key, s);
  }
  const seen = new Set();
  const valid = samples
    .filter(
      (s) =>
        s &&
        typeof s.scope === 'string' &&
        s.scope.length <= 100 &&
        /^[a-f0-9]{64}$/.test(s.coverage) &&
        Number.isFinite(s.time) &&
        s.time > 0 &&
        s.time <= now + 300000 &&
        Number.isFinite(s.value) &&
        s.value >= 0
    )
    .sort((a, b) => a.time - b.time)
    .filter((s) => {
      const key = JSON.stringify([s.scope, s.time, s.coverage]);
      if (seen.has(key) || preferred.get(key) !== s) return false;
      seen.add(key);
      return true;
    })
    .map((s) => ({
      scope: s.scope, time: s.time, value: s.value, coverage: s.coverage,
      partial: !!s.partial, ...(s.breakBefore ? { breakBefore: true } : {}),
      excluded: Number.isSafeInteger(s.excluded) && s.excluded >= 0 ? s.excluded : 0,
      ...(s.method ? { method: String(s.method).slice(0, 50) } : {}),
      ...(Number.isFinite(s.cadence) ? { cadence: s.cadence } : {}),
      ...(s.provenance && typeof s.provenance === 'object' ? { provenance: s.provenance } : {})
    }));
  return compactHistory(valid, now);
}
// Actual first/last/min/max per age bucket AND per compatible segment. Never average.
// Preserve both sides of coverage and time-gap boundaries, including a one-point segment.
export function compactHistory(samples, now = Date.now()) {
  const ordered = [...samples].sort((a, b) => a.time - b.time), buckets = new Map(), prior = new Map();
  const boundaries = new Set();
  for (const s of ordered) {
    const previous = prior.get(s.scope);
    const boundary = previous && (s.breakBefore || !compatible(previous.sample, s) || s.time - previous.sample.time > Math.max(1800000, bucketWidth(s.time, now) * 2, (s.cadence || 0) * 1.5));
    const segment = (previous?.segment || 0) + (boundary ? 1 : 0);
    if (boundary) { boundaries.add(previous.sample); boundaries.add(s); }
    prior.set(s.scope, { sample: s, segment });
    const width = bucketWidth(s.time, now);
    const key = JSON.stringify([s.scope, segment, width, Math.floor(s.time / width)]);
    const b = buckets.get(key);
    if (!b) buckets.set(key, { first: s, last: s, min: s, max: s });
    else { b.last = s; if (s.value < b.min.value) b.min = s; if (s.value > b.max.value) b.max = s; }
  }
  const keep = new Set([...boundaries, ...[...buckets.values()].flatMap((b) => [b.first, b.last, b.min, b.max])]);
  return ordered.filter((s) => keep.has(s));
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
    if (![1, 2].includes(data.version)) throw new Error('Saved portfolio history is unsupported.');
    const samples = normalizeHistory(data.samples);
    return samples;
  };
  return {
    load,
    async attempts(access) {
      const raw = storage.getItem(prefix + access.id);
      return raw ? (await unsealHistory(access, JSON.parse(raw))).attempts || [] : [];
    },
    async save(access, samples, attempt) {
      const generation = generations.get(access.id) || 0;
      const operation = async () => {
        const prior = await load(access, false); // Never overwrite an unreadable encrypted cache.
        const merged = normalizeHistory([...prior, ...samples]);
        const raw = storage.getItem(prefix + access.id);
        const attempts = raw ? (await unsealHistory(access, JSON.parse(raw))).attempts || [] : [];
        const checkpoints = attempt ? [...attempts.filter((a) => a.key !== attempt.key), attempt].slice(-200) : attempts;
        const envelope = await sealHistory(access, merged, checkpoints);
        if ((generations.get(access.id) || 0) !== generation) return;
        storage.setItem(prefix + access.id, JSON.stringify(envelope));
      };
      if (globalThis.navigator?.locks) await navigator.locks.request(prefix + access.id, operation);
      else {
        const key = prefix + access.id;
        const pending = (queues.get(key) || Promise.resolve()).catch(() => {}).then(operation);
        queues.set(key, pending);
        try { await pending; } finally { if (queues.get(key) === pending) queues.delete(key); }
      }
    },
    async export(access, samples = []) {
      return sealHistory(access, normalizeHistory([...(await load(access)), ...samples]), await this.attempts(access));
    },
    async import(access, envelope) {
      const data = await unsealHistory(access, envelope);
      if (![1, 2].includes(data.version)) throw new Error('Unsupported history backup.');
      await this.save(access, normalizeHistory(data.samples));
    },
    clear(access) {
      generations.set(access.id, (generations.get(access.id) || 0) + 1);
      storage.removeItem(prefix + access.id);
    }
  };
}
export const portfolioHistory = createPortfolioHistory();
