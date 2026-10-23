import { HISTORY_RANGES } from './historyChart.js';
import { identifyObservation } from './portfolioHistory.js';
// Attempts are private, encrypted beside readings, not in a public wallet cache.
// One anchor per visit/range, at most 8 wallet/network reads, concurrency 2.
export function backfillAnchor(range, now = Date.now()) {
  const duration = HISTORY_RANGES[range];
  const width = range === '1H' ? 300000 : range === '1D' ? 3600000 : 86400000;
  return Math.floor((now - (duration === Infinity ? 365 * 86400000 : duration) * .95) / width) * width;
}
export async function collectBackfill({ jobs, time, range, scope, request }) {
  const responses = new Array(jobs.length); let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(2, jobs.length) }, async () => {
    while (cursor < jobs.length) {
      const i = cursor++;
      try { responses[i] = await request({ ...jobs[i], time, range }); }
      catch { responses[i] = { ...jobs[i], value: null, positions: [], excluded: 0, error: true }; }
    }
  }));
  const successful = responses.filter((r) => Number.isFinite(r.value));
  if (!successful.length) return null;
  // Coverage includes requested membership, exact valued identities, sources and methodology.
  const coverage = JSON.stringify({ method: 'archive-liquid-v2', membership: jobs.map((j) => `${j.chain}:${j.address.toLowerCase()}`).sort(),
    assets: responses.flatMap((r) => r.positions.filter((p) => p.valueExact != null).map((p) => `${r.chain}:${r.address}:${p.asset}`)).sort(),
    incomplete: responses.filter((r) => r.value == null).map((r) => `${r.chain}:${r.address}`).sort() });
  return identifyObservation({ scope, time, value: successful.reduce((n, r) => n + r.value, 0), coverage, partial: true,
    excluded: responses.reduce((n, r) => n + r.excluded, 0), method: 'archive-liquid-v2', cadence: 0,
    provenance: { kind: 'backfill', staking: 'excluded', networksUnavailable: responses.filter((r) => r.error).length,
      discovery: 'bounded-seeds-only', positions: responses.flatMap((r) => r.positions.map((p) => ({ ...p, wallet: r.address }))) } });
}
