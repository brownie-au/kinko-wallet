import { hex } from './crypto.js';
export const HISTORY_LIMIT = 2000;
const prefix = 'kinko:portfolio-history:v1:';
const retention = 31 * 86400000;
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
  return samples
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
    .slice(-HISTORY_LIMIT)
    .map((s) => ({
      scope: s.scope,
      time: s.time,
      value: s.value,
      coverage: s.coverage,
      partial: !!s.partial,
      excluded: Number.isSafeInteger(s.excluded) && s.excluded >= 0 ? s.excluded : 0
    }));
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
  const load = async (access) => {
    const raw = storage.getItem(prefix + access.id);
    if (!raw) return [];
    const data = await unsealHistory(access, JSON.parse(raw));
    if (data.version !== 1) throw new Error('Saved portfolio history is unsupported.');
    return normalizeHistory(data.samples);
  };
  return {
    load,
    async save(access, samples) {
      const generation = generations.get(access.id) || 0;
      const operation = async () => {
        let prior = [];
        try {
          prior = await load(access);
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
