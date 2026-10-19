import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dataNotices, portfolioObservation, appendObservation, observationSeries } from '../../src/reimagined/dataQuality.js';
const wallet = '0x' + '1'.repeat(40),
  other = '0x' + '2'.repeat(40),
  now = Date.now();
const row = { wallet, chain: 'bsc', address: null, amountExact: '2', priceUsd: 100 };
const result = {
  wallet,
  chain: 'bsc',
  asOf: now,
  discovery: 'manual',
  notices: [{ code: 'discovery-manual', kind: 'limitation', message: 'Manual discovery', action: 'track-token' }]
};
const sample = (extra = {}) => portfolioObservation({ rows: [row], results: [result], scope: 'all:all', ...extra });
test('notices identify the network, group affected wallets and retain actionable limitations', () => {
  const notices = dataNotices([result, { ...result, wallet: other }, { ...result, chain: 'eth' }], [row]);
  assert.equal(notices.length, 2);
  assert.equal(notices[0].chain, 'bsc');
  assert.equal(notices[0].wallets.length, 2);
  assert.equal(notices[0].kind, 'limitation');
  assert.equal(notices[0].action, 'track-token');
});
test('read failures and unpriced holdings remain visible instead of silently disappearing', () => {
  const notices = dataNotices([{ ...result, notices: [], stale: true, error: 'timeout' }], [{ ...row, priceUsd: null }]);
  assert.deepEqual(
    notices.map((n) => n.code),
    ['read-failed', 'price-missing']
  );
  assert.match(notices[0].message, /stale/);
});
test('partial fresh priced values collect even with discovery limits and unpriced tokens', () => {
  const d = sample({ rows: [row, { ...row, address: other, priceUsd: null, amountExact: '9' }] });
  assert.equal(d.value, 200);
  assert.equal(d.partial, true);
  assert.equal(d.excluded, 1);
  assert.equal(d.time, now);
});
test('stale values are excluded; unavailable, unpriced and in-progress reads cannot invent samples', () => {
  assert.equal(sample({ rows: [{ ...row, stale: true }] }), null);
  assert.equal(sample({ rows: [{ ...row, priceUsd: null }] }), null);
  assert.equal(sample({ loading: true }), null);
  assert.equal(sample({ results: [{ ...result, error: 'offline', stale: true }] }), null);
  assert.equal(sample({ rows: [row, { ...row, wallet: other, stale: true, amountExact: '500' }] }).value, 200);
});
test('cached timestamps do not create a second point, but new readings do', () => {
  const first = sample();
  const history = appendObservation([], first);
  assert.equal(appendObservation(history, first), history);
  const next = sample({ results: [{ ...result, asOf: now + 61000 }] });
  assert.equal(appendObservation(history, next).length, 2);
});
test('coverage changes start a new series rather than manufacture gains or losses', () => {
  const first = sample();
  const next = sample({
    rows: [row, { ...row, address: other }],
    results: [{ ...result, asOf: now + 61000, discovery: 'complete', notices: [] }]
  });
  const h = appendObservation(appendObservation([], first), next);
  const series = observationSeries(h, 'all:all', 1, now + 62000);
  assert.equal(series.coverageChanged, true);
  assert.equal(series.observations.length, 1);
  const third = { ...next, time: now + 122000, value: 405 };
  assert.equal(observationSeries(appendObservation(h, third), 'all:all', 1, now + 123000).observations.length, 2);
  assert.equal(observationSeries(h, 'different', 1, now + 62000).observations.length, 0);
});
