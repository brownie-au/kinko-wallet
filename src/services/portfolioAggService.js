import { getChainHoldings } from './chainHoldingsService.js';
import { aggregateHoldings, normalizeWallets } from './portfolioAggregation.js';
import { isTokenBlacklisted } from '../data/tokenBlocklist.js';
const spam = (t) => t.possible_spam === true || /https?:\/\/|www\.|\bclaim rewards\b|\bconnect wallet\b/i.test(`${t.name} ${t.symbol}`);

export async function buildPortfolioDetailed(wallets = [], options = {}) {
  let saved = [];
  try {
    const parsed = JSON.parse(localStorage.getItem('wallets') || '[]');
    saved = Array.isArray(parsed) ? parsed : [];
  } catch {
    /* optional */
  }
  const resolved = wallets.map((w) => ({
    ...w,
    networks: w.networks || saved.find((s) => s.address?.toLowerCase() === w.address?.toLowerCase())?.networks
  }));
  const visible = normalizeWallets(resolved).filter((w) => !w.hidden);
  const only = options.only || 'all';
  const requests = visible.flatMap((w) =>
    w.networks.filter((c) => ['all', 'auto', 'summary'].includes(only) || c === only).map((chain) => ({ wallet: w.address, chain }))
  );
  const rows = [],
    issues = [];
  // Limit provider pressure to three wallet/network jobs at a time.
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, requests.length) }, async () => {
      while (cursor < requests.length) {
        const req = requests[cursor++];
        try {
          const result = await getChainHoldings(req.chain, req.wallet, options);
          rows.push(...result.rows);
          issues.push(...result.issues.map((message) => ({ ...req, message })));
        } catch {
          issues.push({ ...req, message: 'Network unavailable; holdings could not be refreshed.' });
        }
      }
    })
  );
  const safe = rows.filter((t) => !spam(t) && !isTokenBlacklisted(t));
  const result = aggregateHoldings(safe);
  return {
    ...result,
    issues,
    partial: issues.length > 0,
    asOf: rows.length ? Math.min(...rows.map((t) => t.fetchedAt || Date.now())) : null
  };
}
export const buildPortfolioDetailedFromCache = buildPortfolioDetailed;
export async function buildPortfolioTotals(wallets, options) {
  return buildPortfolioDetailed(wallets, options);
}
