import { addDecimal, multiplyDecimal } from '../utils/tokenMath.js';
import { normalizeWallets } from '../utils/walletRecords.js';
export const portfolioKey = (t) => `${t.chain}:${t.address || 'native'}:${String(t.symbol || '').toUpperCase()}`;
export { normalizeWallets };
// Token identity is network + contract, never the ticker. Keep legacy UI breakdown keys.
export function aggregateHoldings(rows) {
  const byToken = new Map(),
    seen = new Set(),
    breakdown = new Map();
  for (const row of rows) {
    const address = row.address && row.address !== 'native' ? row.address.toLowerCase() : null;
    const identity = `${row.chain}:${address || 'native'}`;
    const holding = `${String(row.wallet).toLowerCase()}:${identity}`;
    if (seen.has(holding)) continue;
    seen.add(holding);
    const amountExact = row.amountExact || String(row.amount ?? row.balance ?? 0);
    const price = Number(row.priceUsd ?? row.price ?? row.priceUSD);
    const priced = Number.isFinite(price) && price > 0;
    const valueExact = priced ? multiplyDecimal(amountExact, String(price)) : '0';
    let token = byToken.get(identity);
    if (!token) {
      token = { ...row, address, amountExact: '0', valueExact: '0', amount: 0, valueUsd: null, priceUsd: priced ? price : null };
      byToken.set(identity, token);
    }
    if (priced && token.priceUsd == null) token.priceUsd = price;
    token.amountExact = addDecimal(token.amountExact, amountExact);
    token.valueExact = addDecimal(token.valueExact, valueExact);
    token.amount = Number(token.amountExact);
    token.valueUsd = priced || token.valueUsd != null ? Number(token.valueExact) : null;
    token.stale = token.stale || row.stale;
    const key = portfolioKey(token);
    if (!breakdown.has(key)) breakdown.set(key, []);
    breakdown.get(key).push({ wallet: row.wallet, amount: Number(amountExact), amountExact, valueUsd: priced ? Number(valueExact) : null });
  }
  const tokens = [...byToken.values()].sort((a, b) => (b.valueUsd || 0) - (a.valueUsd || 0));
  const totalExact = tokens.reduce((sum, t) => addDecimal(sum, t.valueExact), '0');
  return { totalUsd: Number(totalExact), totalExact, tokens, breakdown };
}
