import { test } from 'node:test';
import assert from 'node:assert/strict';
import { historyChartModel } from '../../src/reimagined/historyChart.js';
const now = Date.now();
const samples = (count, extra = {}) => Array.from({ length: count }, (_, i) => ({ time: now - (count - i) * 120000, value: 100 + i, coverage: 'a', ...extra }));
test('chart waits for comparable readings and does not fabricate an early trend', () => {
  for (const n of [0, 1, 2, 4]) assert.equal(historyChartModel(samples(n), now).sparse, true);
  assert.equal(historyChartModel(samples(5), now).sparse, false);
  assert.equal(historyChartModel(samples(20).map((s, i) => ({ ...s, coverage: i < 5 ? 'stable' : String(i) })), now).sparse, true);
  assert.equal(historyChartModel(samples(20).map((s, i) => ({ ...s, coverage: String(i) })), now).sparse, true);
});
test('an overnight void uses compact history while a smaller gap remains shaded in a usable chart', () => {
  const dense = samples(60);
  const overnight = [...dense, { ...dense.at(-1), time: now + 27 * 3600000 }];
  assert.equal(historyChartModel(overnight, now).sparse, true);
  assert.equal(historyChartModel(overnight, now).sessionCount, 2);
  const withGap = [...dense.slice(0, 30), ...dense.slice(30).map((s) => ({ ...s, time: s.time + 3600000 }))];
  const m = historyChartModel(withGap, now);
  assert.equal(m.sparse, false);
  assert.equal(m.gaps.length, 1);
  assert.equal(m.segments.length, 2);
});
test('coverage boundaries stay separate, including compaction markers, without inventing time gaps', () => {
  const readings = samples(20).map((s, i) => ({ ...s, coverage: i >= 10 ? 'b' : 'a', breakBefore: i === 5 }));
  const model = historyChartModel(readings, now);
  assert.equal(model.segments.length, 3);
  assert.equal(model.sessionCount, 1);
  assert.equal(model.gaps.length, 0);
  assert.equal(model.sparse, false);
});
