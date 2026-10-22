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
test('failed reads report stale data without presenting old missing prices as current results', () => {
  const notices = dataNotices([{ ...result, notices: [], stale: true, error: 'timeout' }], [{ ...row, priceUsd: null }]);
  assert.deepEqual(
    notices.map((n) => n.code),
    ['read-failed']
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
  assert.equal(series.observations.length, 2);
  const third = { ...next, time: now + 122000, value: 405 };
  assert.equal(observationSeries(appendObservation(h, third), 'all:all', 1, now + 123000).observations.length, 3);
  assert.equal(observationSeries(h, 'different', 1, now + 62000).observations.length, 0);
});

test('price notices exclude shared spam and hidden-contract classifications on all five chains', () => {
  for (const chain of ['eth', 'pulse', 'base', 'polygon', 'bsc']) {
    const token = { ...row, chain, address: other, name: 'Claim: scam.site', priceUsd: null };
    const flagged = { ...token, address: wallet, name: 'Ordinary name', spam: true };
    const hidden = { ...token, address: '0x' + '3'.repeat(40), name: 'Hidden token' };
    const options = { hidden: [{ chain, address: hidden.address }] };
    assert.deepEqual(dataNotices([], [token, flagged, hidden], options), []);
    const genuine = { ...token, address: '0x' + '4'.repeat(40), name: 'Community token' };
    const [notice] = dataNotices([], [token, flagged, hidden, genuine, { ...genuine, wallet: other }, genuine], options);
    assert.equal(notice.tokenCount, 1);
    assert.deepEqual(notice.wallets.sort(), [wallet, other].sort());
    assert.match(notice.message, /^1 held token has/);
    assert.deepEqual(dataNotices([], [token, flagged, hidden, { ...genuine, priceUsd: 2 }], options), []);
    // Explicitly tracked false positives are holdings again; a manual hide still wins.
    assert.equal(dataNotices([], [token], { tracked: [{ chain, address: other }] })[0].tokenCount, 1);
    assert.deepEqual(dataNotices([], [token], { tracked: [{ chain, address: other }], hidden: [{ chain, address: other }] }), []);
  }
});
test('price eligibility requires a positive holding and a finite positive numeric price', () => {
  for (const priceUsd of [null, undefined, 0, -1, NaN, Infinity, '2']) {
    assert.equal(dataNotices([], [{ ...row, priceUsd }])[0].tokenCount, 1);
  }
  for (const amountExact of ['0', '0.000', '-1']) assert.deepEqual(dataNotices([], [{ ...row, amountExact, priceUsd: null }]), []);
  assert.deepEqual(dataNotices([], [{ ...row, priceUsd: 0.00001 }]), []);
  // Native assets cannot be hidden, even if a provider attaches a spam flag.
  assert.equal(dataNotices([], [{ ...row, priceUsd: null, spam: true }])[0].tokenCount, 1);
});
test('loading and failed reads do not reuse stale price warnings; completed reads and scope determine current counts', () => {
  const missing = { ...row, address: other, priceUsd: null };
  const prior = { ...result, notices: [{ code: 'price-missing', kind: 'limitation', message: 'Old warning' }] };
  assert.deepEqual(dataNotices([prior], [missing], { loading: true }), []);
  assert.equal(dataNotices([prior], [missing])[0].tokenCount, 1);
  assert.deepEqual(dataNotices([prior], [{ ...missing, priceUsd: 1 }]), []);
  assert.deepEqual(dataNotices([], [{ ...missing, stale: true }]), []);
  const second = { ...missing, wallet: other, address: wallet };
  assert.equal(dataNotices([], [missing, second])[0].tokenCount, 2);
  assert.deepEqual(dataNotices([], [missing])[0].wallets, [wallet]);
});
