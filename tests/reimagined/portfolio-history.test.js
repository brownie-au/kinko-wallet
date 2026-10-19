import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveAccess, generateAccessKey, encryptWatchlist } from '../../src/reimagined/crypto.js';
import { createPortfolioHistory, identifyObservation, normalizeHistory, HISTORY_LIMIT } from '../../src/reimagined/portfolioHistory.js';
import { observationSeries } from '../../src/reimagined/dataQuality.js';
const memory = () => {
  const map = new Map();
  return { getItem: (k) => map.get(k) || null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k), map };
};
const sample = async (extra = {}) =>
  identifyObservation({
    scope: 'all:all',
    time: Date.now(),
    value: 7090.72,
    coverage: 'private-wallet-coverage',
    partial: true,
    excluded: 3,
    ...extra
  });

test('real encrypted history survives a fresh app/store instance without plaintext amounts or coverage', async () => {
  const access = await deriveAccess(generateAccessKey()),
    storage = memory(),
    first = await sample();
  await createPortfolioHistory(storage).save(access, [first]);
  const raw = [...storage.map.values()][0];
  assert.ok(!raw.includes('7090.72'));
  assert.ok(!raw.includes('private-wallet-coverage'));
  assert.ok(!raw.includes('all:all'));
  const restored = await createPortfolioHistory(storage).load(access);
  assert.deepEqual(restored, [first]);
  const second = await sample({ time: first.time + 61000, value: 7100 });
  assert.equal(second.coverage, first.coverage);
  await createPortfolioHistory(storage).save(access, [second]);
  const again = await createPortfolioHistory(storage).load(access);
  assert.equal(again.length, 2);
  assert.equal(observationSeries(again, 'all:all', 30).observations.length, 2);
});
test('history is account-bound, authenticated and purpose-separated from watchlist backups', async () => {
  const access = await deriveAccess(generateAccessKey()),
    other = await deriveAccess(generateAccessKey()),
    storage = memory(),
    store = createPortfolioHistory(storage);
  await store.save(access, [await sample()]);
  assert.deepEqual(await store.load(other), []);
  const key = [...storage.map.keys()][0];
  const saved = JSON.parse(storage.getItem(key));
  saved.ciphertext = 'AAAA' + saved.ciphertext.slice(4);
  storage.setItem(key, JSON.stringify(saved));
  await assert.rejects(store.load(access));
  storage.setItem(key, JSON.stringify(await encryptWatchlist(access, { version: 1, samples: [await sample()] })));
  await assert.rejects(store.load(access), /unsupported/);
});
test('large histories are bounded, expired/invalid readings excluded, and current values never invented', async () => {
  const now = Date.now(),
    baseline = await sample();
  const samples = Array.from({ length: HISTORY_LIMIT + 20 }, (_, i) => ({ ...baseline, time: now - i * 61000 }));
  samples.push({ ...baseline, time: now - 40 * 86400000 }, { ...baseline, value: NaN }, { ...baseline, value: -1 });
  assert.equal(normalizeHistory(samples, now).length, HISTORY_LIMIT);
  const access = await deriveAccess(generateAccessKey()),
    store = createPortfolioHistory(memory());
  await store.save(access, samples);
  assert.equal((await store.load(access)).length, HISTORY_LIMIT);
});
test('storage errors remain explicit and clear prevents an in-flight write from restoring deleted history', async () => {
  const access = await deriveAccess(generateAccessKey()),
    storage = memory(),
    store = createPortfolioHistory(storage);
  const pending = store.save(access, [await sample()]);
  store.clear(access);
  await pending;
  assert.equal(storage.map.size, 0);
  const blocked = createPortfolioHistory({
    getItem: () => null,
    setItem: () => {
      throw Error('quota exceeded');
    },
    removeItem: () => {}
  });
  await assert.rejects(blocked.save(access, [await sample()]), /quota/);
});
