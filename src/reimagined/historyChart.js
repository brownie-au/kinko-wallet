export const HISTORY_RANGES = { '1H': 3600000, '1D': 86400000, '1W': 7 * 86400000, '1M': 30 * 86400000, '1Y': 365 * 86400000, MAX: Infinity };
export const PRICE_TOLERANCE = { '1H': 60000, '1D': 300000, '1W': 1800000, '1M': 7200000, '1Y': 43200000, MAX: 43200000 };
export function bucketWidth(time, now = Date.now()) {
  const age = now - time;
  return age < 86400000 ? 120000 : age < 7 * 86400000 ? 900000 : age < 90 * 86400000 ? 3600000 : age < 2 * 365 * 86400000 ? 86400000 : 7 * 86400000;
}
export function compatible(a, b) {
  return a.scope === b.scope && a.coverage === b.coverage && (a.method || 'saved-v1') === (b.method || 'saved-v1') && !!a.partial === !!b.partial && !!a.priceOutOfTolerance === !!b.priceOutOfTolerance;
}
// Absence is a gap, never a zero or an inferred valuation. Backfill retains its real cadence.
export function historyChartModel(observations, now = Date.now()) {
  const segments = [], gaps = [];
  let sessionCount = 0;
  for (const [index, sample] of observations.entries()) {
    const previous = observations[index - 1];
    const threshold = Math.max(1800000, bucketWidth(sample.time, now) * 2, Math.min(sample.cadence || 0, 31 * 86400000) * 1.5);
    const gap = previous && sample.time - previous.time > threshold;
    if (!previous || gap) sessionCount++;
    if (gap) gaps.push({ from: previous.time, to: sample.time });
    if (!previous || gap || sample.breakBefore || !compatible(previous, sample)) segments.push([]);
    segments.at(-1).push({ ...sample, index });
  }
  return { segments, gaps, sessionCount, sparse: observations.length < 2 };
}
export function historyWindow(history, scope, range = '1M', now = Date.now()) {
  const duration = HISTORY_RANGES[range] ?? Number(range) * 86400000;
  const all = history.filter((s) => s.scope === scope && s.time <= now).sort((a, b) => a.time - b.time);
  const observations = all.filter((s) => s.time >= now - duration).map((s) => {
    const quotes = s.provenance?.quotes || s.provenance?.positions || [];
    const tolerance = PRICE_TOLERANCE[range] ?? 300000;
    const outside = quotes.some((q) => !Number.isFinite(q.priceTime ?? q.time) || Math.abs((q.priceTime ?? q.time) - s.time) > tolerance);
    return outside ? { ...s, partial: true, priceOutOfTolerance: true } : s;
  });
  const model = historyChartModel(observations, now);
  const start = observations[0], end = observations.at(-1);
  // Only compare an uninterrupted, like-for-like segment. Always label the actual interval.
  const comparable = observations.length > 1 && model.segments.length === 1;
  const dollar = comparable ? end.value - start.value : null;
  return { observations, readings: observations, model, coverageChanged: model.segments.length > 1,
    availableSince: all[0]?.time, short: !!start && duration !== Infinity && start.time > now - duration + Math.min(duration * .05, 3600000),
    comparison: { dollar, percent: comparable && start.value > 0 ? dollar / start.value * 100 : null, from: start?.time, to: end?.time } };
}
