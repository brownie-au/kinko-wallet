// A gap is an absence of observations, never a zero balance or an inferred return.
export function historyChartModel(observations, now = Date.now()) {
  const segments = [], gaps = [];
  let sessionCount = 0, largestGap = 0;
  for (const [index, sample] of observations.entries()) {
    const previous = observations[index - 1];
    const threshold = now - sample.time >= 7 * 86400000 ? 2 * 3600000 : 30 * 60000;
    const gap = previous && sample.time - previous.time > threshold;
    if (!previous || gap) sessionCount++;
    if (gap) {
      gaps.push({ from: previous.time, to: sample.time });
      largestGap = Math.max(largestGap, sample.time - previous.time);
    }
    if (!previous || gap || sample.breakBefore || sample.coverage !== previous.coverage) segments.push([]);
    segments.at(-1).push({ ...sample, index });
  }
  const span = observations.length > 1 ? observations.at(-1).time - observations[0].time : 0;
  const comparableCount = segments.filter((s) => s.length >= 5 && s.at(-1).time - s[0].time >= 4 * 60000)
    .reduce((count, s) => count + s.length, 0);
  const comparable = comparableCount > 0 && comparableCount / observations.length >= 0.6;
  return {
    segments, gaps, sessionCount,
    // Avoid the compressed cluster + solitary dot seen with a mostly unrecorded range.
    sparse: !comparable || (span > 0 && largestGap / span > 0.65)
  };
}
