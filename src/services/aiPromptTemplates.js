// src/services/aiPromptTemplates.js
/* Build clean, reusable prompts for the AI Portfolio Analyzer.
   Keep this file purely about wording/format — no networking.
*/

// Optional: shared labels if you want consistency with UI
export const RISK_LEVELS = ['Very Low', 'Low', 'Medium', 'High', 'Very High'];
export const TIMEFRAMES = {
  '1y': '1 year',
  '3y': '3 years',
  '5y': '5+ years'
};

/** Compact text summary to keep prompts small but informative. */
function summarizePortfolioForPrompt(portfolio) {
  if (!portfolio || !Array.isArray(portfolio.assets)) return 'No assets.';
  const total = Number(portfolio.totalUsd || 0);

  // Top 10 by USD
  const top = [...portfolio.assets]
    .filter((a) => (Number(a.valueUsd) || 0) > 0)
    .sort((a, b) => Number(b.valueUsd) - Number(a.valueUsd))
    .slice(0, 10);

  const lines = top.map((a, i) => {
    const pct = total > 0 ? Math.round((Number(a.valueUsd) / total) * 1000) / 10 : 0;
    return (
      `${i + 1}. ${a.symbol || a.name || '—'} on ${a.chain || 'n/a'} — ` +
      `amount=${Number(a.amount || 0)}, price=$${Number(a.priceUsd || 0).toFixed(6)}, ` +
      `value=$${Number(a.valueUsd || 0).toFixed(2)} (${pct}% of portfolio)` +
      (Number.isFinite(a.change24hPct) ? `, 24h=${a.change24hPct.toFixed(2)}%` : '')
    );
  });

  return [
    `Total USD: $${total.toFixed(2)}`,
    `Chains: ${Array.isArray(portfolio.chains) ? portfolio.chains.join(', ') : 'n/a'}`,
    `Top holdings (max 10):`,
    ...lines
  ].join('\n');
}

/** System prompt: persona + output style (stable, reusable). */
export function buildSystemPrompt({ riskLabel = 'Medium', timeframeLabel = '5+ years' } = {}) {
  return [
    'You are an elite crypto portfolio analyst with 20 years experience (10 in institutional finance & security, 10 in digital assets).',
    'Write concise, professional, decision-useful insights. Be objective and data-driven.',
    `Assume the holder risk tolerance is "${riskLabel}" and their time horizon is "${timeframeLabel}".`,
    'Required output sections in HTML-friendly markup:',
    '1) <h6>Overview</h6> 2-3 lines, crisp.',
    '2) <h6>Strategic Observations</h6> bullets (<strong>bold</strong> key metrics).',
    '3) <h6>Scorecard</h6> JSON with components + total score (0-100).',
    '4) <h6>Breakdown</h6> list of asset-level comments if useful.',
    'Keep it readable. No asterisks styling. Avoid hype.'
  ].join('\n');
}

/** User prompt: injects live data + objectives. */
export function buildUserPrompt({ portfolio, objective = '' } = {}) {
  const header = objective?.trim() ? `User objectives: ${objective.trim()}\n\n` : '';
  return (
    header +
    [
      'Portfolio summary (compact, USD-denominated where applicable):',
      '```',
      summarizePortfolioForPrompt(portfolio),
      '```',
      '',
      'Return the sections exactly as requested in the system prompt.'
    ].join('\n')
  );
}
