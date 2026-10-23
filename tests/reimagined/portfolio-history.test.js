import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveAccess, generateAccessKey, encryptWatchlist } from '../../src/reimagined/crypto.js';
import { createPortfolioHistory, identifyObservation, normalizeHistory, HISTORY_RETENTION } from '../../src/reimagined/portfolioHistory.js';
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
    first = await sample({ time: Date.now() - 61000 });
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
test('history retains month coverage and extrema without age-based deletion', async () => {
  const now = Date.now(), baseline = await sample();
  const samples = Array.from({ length: 32 * 720 }, (_, i) => ({ ...baseline, time: now - i * 120000, value: 100 + i % 23 }));
  samples.push({ ...baseline, time: now - HISTORY_RETENTION - 1 }, { ...baseline, value: NaN }, { ...baseline, value: -1 });
  const compacted = normalizeHistory(samples, now);
  assert.ok(compacted.length < 8000);
  assert.ok(compacted[0].time < now - 31 * 86400000, 'month history survives continuous readings');
  assert.ok(compacted.every((s) => s.time > now - HISTORY_RETENTION && s.value >= 0));
  assert.ok(compacted.some((s) => s.value === 122));
  const access = await deriveAccess(generateAccessKey()), storage = memory(), store = createPortfolioHistory(storage);
  await store.save(access, samples);
  assert.deepEqual(await createPortfolioHistory(storage).load(access), compacted);
  const other = normalizeHistory([...samples, ...samples.map((s) => ({ ...s, scope: 'wallet:pulse' }))], now);
  assert.equal(other.filter((s) => s.scope === 'all:all').length, compacted.length, 'scopes cannot evict one another');
});
test('compaction preserves a coverage break even when the changed reading is thinned away', async () => {
  const now = Date.now(), baseline = await sample(), time = Math.floor((now - 10 * 86400000) / 3600000) * 3600000;
  const samples = [0, 1, 2, 3, 4].map((i) => ({ ...baseline, time: time + i * 1000, value: [100, 90, 100, 110, 100][i], coverage: i === 2 ? 'b'.repeat(64) : baseline.coverage }));
  const normalized = normalizeHistory(samples, now);
  assert.equal(normalized.length, 5);
  assert.notEqual(normalized[2].coverage, normalized[1].coverage);
  assert.equal(observationSeries(normalized, 'all:all', 30, now).coverageChanged, true);
  assert.deepEqual(normalizeHistory(normalized, now), normalized);
});
test('unlock retains older history and never rewrites the cache on read', async () => {
  const access = await deriveAccess(generateAccessKey()), storage = memory(), store = createPortfolioHistory(storage);
  const first = await sample({ time: Date.now() - 400 * 86400000 }), recent = await sample();
  await store.save(access, [first, recent]);
  const raw = [...storage.map.values()][0];
  const readOnly = createPortfolioHistory({ ...storage, setItem: () => { throw Error('quota'); } });
  assert.deepEqual(await readOnly.load(access), [first, recent]);
  assert.equal([...storage.map.values()][0], raw);
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

test('encrypted export/import, concurrent saves, checkpoints and tamper failure preserve records', async () => {
  const access = await deriveAccess(generateAccessKey()), a = memory(), b = memory();
  const store = createPortfolioHistory(a), first = await sample({ time: Date.now() - 61000 }), second = await sample();
  await Promise.all([store.save(access, [first], { key: 'range', time: Date.now() }), createPortfolioHistory(a).save(access, [second])]);
  assert.equal((await store.load(access)).length, 2);
  assert.equal((await store.attempts(access)).length, 1);
  const envelope = await store.export(access);
  assert.ok(!JSON.stringify(envelope).includes('range'));
  await createPortfolioHistory(b).import(access, envelope);
  assert.deepEqual(await createPortfolioHistory(b).load(access), [first, second]);
  const key = [...a.map.keys()][0];
  const broken = JSON.parse(a.getItem(key)); broken.ciphertext = 'AAAA' + broken.ciphertext.slice(4);
  a.setItem(key, JSON.stringify(broken));
  await assert.rejects(store.save(access, [second]));
  assert.equal(a.getItem(key), JSON.stringify(broken), 'damaged history is not replaced');
});
test('multi-year downsampling preserves extrema and every segment boundary', async () => {
  const now = Date.now(), baseline = await sample();
  const points = Array.from({ length: 4000 }, (_, i) => ({ ...baseline, time: now - 800 * 86400000 + i * 3600000,
    value: i === 2000 ? 1 : i === 2500 ? 99999 : 100, coverage: i === 2300 ? 'b'.repeat(64) : baseline.coverage }));
  const normalized = normalizeHistory(points, now);
  assert.ok(normalized.length < points.length / 2);
  for (const index of [0, 2000, 2299, 2300, 2301, 2500, 3999]) assert.ok(normalized.some((s) => s.time === points[index].time));
  assert.equal(normalized[0].time, points[0].time);
});
test('v1 encrypted records migrate without deleting old samples or changing the original on unlock', async()=>{
  const access=await deriveAccess(generateAccessKey()), storage=memory(), store=createPortfolioHistory(storage);
  const old=await sample({time:Date.now()-500*86400000});
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(`kinko:portfolio-history:v1:${access.id}`)},access.encryptionKey,new TextEncoder().encode(JSON.stringify({version:1,samples:[old]})));
  const envelope={version:1,type:'portfolio-history',iv:Buffer.from(iv).toString('base64'),ciphertext:Buffer.from(cipher).toString('base64')};
  const key=`kinko:portfolio-history:v1:${access.id}`,raw=JSON.stringify(envelope);storage.setItem(key,raw);
  assert.deepEqual(await store.load(access),[old]);assert.equal(storage.getItem(key),raw);
  await store.save(access,[await sample()]);assert.equal((await store.load(access)).length,2);
});
