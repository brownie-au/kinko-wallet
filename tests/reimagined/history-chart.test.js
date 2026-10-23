import { test } from 'node:test';
import assert from 'node:assert/strict';
import { historyChartModel, historyWindow, HISTORY_RANGES } from '../../src/reimagined/historyChart.js';
const now = Date.now(), day = 86400000;
const point = (age, value = 100, extra = {}) => ({ scope: 'all:all', time: now - age, value, coverage: 'a', ...extra });
test('all six trailing ranges use real time and never invent earlier data', () => {
  const samples = [point(800*day), point(200*day), point(20*day), point(3*day), point(12*3600000), point(30*60000), point(0)];
  assert.deepEqual(Object.keys(HISTORY_RANGES), ['1H','1D','1W','1M','1Y','MAX']);
  for (const [range, expected] of [['1H',2],['1D',3],['1W',4],['1M',5],['1Y',6],['MAX',7]]) {
    const s = historyWindow(samples, 'all:all', range, now);
    assert.equal(s.observations.length, expected);
    assert.equal(s.observations.at(-1).time, now);
  }
  assert.equal(historyWindow([point(3*day),point(0)], 'all:all', '1Y', now).short, true);
});
test('empty history and one point have no fabricated trend or change', () => {
  assert.equal(historyWindow([], 'all:all','MAX',now).comparison.dollar, null);
  const s = historyWindow([point(0)], 'all:all','1Y',now);
  assert.equal(s.model.segments[0].length,1); assert.equal(s.comparison.percent,null);
});
test('independent arithmetic: 125.25 to 150.30 is 25.05 and 20%, zero baseline has no percent', () => {
  const s = historyWindow([point(120000,125.25),point(0,150.30)],'all:all','1H',now);
  assert.ok(Math.abs(s.comparison.dollar - 25.05) < 1e-10);
  assert.ok(Math.abs(s.comparison.percent - 20) < 1e-10);
  const zero = historyWindow([point(120000,0),point(0,12)],'all:all','1H',now);
  assert.equal(zero.comparison.dollar,12); assert.equal(zero.comparison.percent,null);
});
test('membership, coverage, partial state, method boundaries and voids disable the period comparison', () => {
  for (const change of [{coverage:'b'}, {breakBefore:true}, {method:'backfill'}, {partial:true}, {time:now+day}]) {
    const samples = [point(120000),point(0,150,change)];
    const s = historyWindow(samples,'all:all','MAX',now+2*day);
    assert.equal(s.model.segments.length,2); assert.equal(s.comparison.dollar,null);
  }
  const m = historyChartModel([point(day),point(0)],now);
  assert.equal(m.gaps.length,1); assert.equal(m.segments.length,2);
});
test('selected-range timestamp tolerance flags observed quotes and breaks incompatible quality',()=>{
  const a=point(120000,100,{method:'observed-liquid-v2',provenance:{quotes:[{priceTime:now-120000}]}});
  const b=point(0,110,{method:'observed-liquid-v2',provenance:{quotes:[{priceTime:now-90000}]}});
  const hour=historyWindow([a,b],'all:all','1H',now);
  assert.equal(hour.observations[1].partial,true);assert.equal(hour.model.segments.length,2);assert.equal(hour.comparison.dollar,null);
  assert.equal(b.partial,undefined,'display quality does not mutate saved history');
  assert.equal(historyWindow([a,b],'all:all','1D',now).comparison.dollar,10);
});
