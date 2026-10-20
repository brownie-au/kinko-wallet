import { aggregateHoldings } from '../services/portfolioAggregation.js';
import { HISTORY_LIMIT } from './portfolioHistory.js';
import { splitTokens, tokenKey, hasUsablePrice } from './tokenFilter.js';

export function dataNotices(results, rows = [], { tracked = [], hidden = [], loading = false } = {}) {
  const groups = new Map();
  const add = (result, notice) => {
    const key = `${result.chain}:${notice.code || notice.message}`;
    if (!groups.has(key)) groups.set(key, { ...notice, chain: result.chain, wallets: new Set() });
    if (result.wallet) groups.get(key).wallets.add(result.wallet.toLowerCase());
    return groups.get(key);
  };
  for (const result of results) {
    const notices =
      result.notices ?? (result.issues || []).map((message) => ({ code: message, message, kind: 'warning', action: 'retry' }));
    // Price notices are derived from the current eligible rows, never cached notices.
    for (const notice of notices) if (notice.code !== 'price-missing') add(result, notice);
    if (result.error)
      add(result, {
        code: 'read-failed',
        kind: 'warning',
        action: 'retry',
        message: result.stale
          ? 'The latest balance read failed. Any retained balances are marked stale. Retry this network.'
          : 'Balances could not be read. Retry this network.'
      });
    if (result.stale && !result.error)
      add(result, {
        code: 'stale',
        kind: 'warning',
        action: 'retry',
        message: 'These balances are retained from an earlier read and may be stale. Retry this network.'
      });
  }
  const failedReads = new Set(results.filter((r) => r.stale || r.error)
    .map((r) => `${r.chain}:${String(r.wallet).toLowerCase()}`));
  // Reuse the same contract-based spam/manual-hide rules as Assets. The display
  // toggle is intentionally absent: unseen unpriced holdings still need a notice.
  const eligible = loading ? [] : splitTokens(rows, tracked, hidden).visible;
  for (const row of eligible) {
    if (Number(row.amountExact) > 0 && !hasUsablePrice(row) && !row.stale &&
        !failedReads.has(`${row.chain}:${String(row.wallet).toLowerCase()}`)) {
      const group = add(row, {
        code: 'price-missing',
        kind: 'limitation',
        tokens: new Set()
      });
      group.tokens.add(tokenKey(row.chain, row.address));
    }
  }
  return [...groups.values()].map(({ tokens, ...g }) => ({ ...g, wallets: [...g.wallets], ...(tokens ? {
    tokenCount: tokens.size,
    message: `${tokens.size} held token${tokens.size === 1 ? ' has' : 's have'} no usable market price and ${tokens.size === 1 ? 'is' : 'are'} excluded from the total. Use Show unpriced tokens in Assets to see ${tokens.size === 1 ? 'its quantity' : 'their quantities'}.`
  } : {}) }));
}

// Partial values are useful, but changing data coverage must never draw a false gain/loss.
export function portfolioObservation({ rows, results, scope, loading = false }) {
  if (loading || !results.length) return null;
  const eligible = rows.filter((r) => !r.stale && Number.isFinite(r.priceUsd) && r.priceUsd > 0);
  if (!eligible.length) return null;
  const time = Math.max(0, ...results.filter((r) => !r.stale && !r.error).map((r) => r.asOf || 0));
  if (!time) return null;
  const value = aggregateHoldings(eligible).totalUsd;
  if (!Number.isFinite(value)) return null;
  const excluded = rows.filter((r) => Number(r.amountExact) > 0 && !eligible.includes(r)).length;
  const incomplete = results.some(
    (r) => r.error || r.stale || r.issues?.length || r.notices?.length || (r.discovery && r.discovery !== 'complete')
  );
  const coverage = JSON.stringify({
    positions: [...new Set(eligible.map((r) => `${r.wallet.toLowerCase()}:${r.chain}:${r.address?.toLowerCase() || 'native'}`))].sort(),
    reads: results
      .map((r) => `${r.wallet}:${r.chain}:${r.error || r.stale ? 'stale' : r.discovery || (r.issues?.length ? 'partial' : 'complete')}`)
      .sort()
  });
  return { scope, time, value, coverage, partial: !!(incomplete || excluded), excluded };
}
export function appendObservation(prior, sample) {
  if (!sample || prior.some((s) => s.scope === sample.scope && s.time === sample.time && s.coverage === sample.coverage)) return prior;
  return [...prior, sample].sort((a, b) => a.time - b.time).slice(-HISTORY_LIMIT);
}
export function observationSeries(history, scope, days, now = Date.now()) {
  const samples = history.filter((s) => s.scope === scope && s.time > now - days * 86400000);
  const latest = samples.at(-1);
  if (!latest) return { observations: [], readings: [], coverageChanged: false };
  const lastDifferent = samples.findLastIndex((s) => s.coverage !== latest.coverage);
  return { observations: samples.slice(lastDifferent + 1), readings: samples, coverageChanged: lastDifferent !== -1 };
}
