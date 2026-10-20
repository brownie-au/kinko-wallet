// Contract identity is always chain + address; symbols and missing prices are not trust signals.
export const tokenKey = (chain, address) => `${chain}:${String(address || '').toLowerCase()}`;
export const hasUsablePrice = (token) => typeof token.priceUsd === 'number' && Number.isFinite(token.priceUsd) && token.priceUsd > 0;
export function spamReason(token) {
  if (token.spam === true || token.is_spam === true) return 'Flagged by the token provider';
  const normalize = (value) => String(value || '').normalize('NFKC')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '')
    .replace(/[\u3002\uFF61]/g, '.').replace(/\s*\.\s*/g, '.').toLowerCase();
  const name = normalize(token.name), symbol = normalize(token.symbol), text = `${name} ${symbol}`;
  const domain = /(?:[a-z0-9-]+\.)+[a-z]{2,24}(?=$|[^a-z0-9-])/;
  const bareDomain = /^(?:[a-z0-9-]+\.)+[a-z]{2,24}(?:[/?#].*)?$/;
  const promotional = /\b(claim|clalm|collect|airdrop|rewards?|redeem|visit|vouchers?|gifts?|swap|check|get)\b/;
  // A website used as the whole token name/symbol and shortened links are suspicious
  // even without "claim" wording. A domain inside an ordinary company name alone is not.
  const folded = text.replace(/[сС]/g, 'c').replace(/[аА]/g, 'a').replace(/[мМ]/g, 'm').replace(/[іІ]/g, 'i');
  if (/https?:\/\/|www\.|(?:t\.ly|t\.me|fli\.so|bio\.link)\//.test(text) ||
      bareDomain.test(name) || bareDomain.test(symbol) ||
      (domain.test(text) && (promotional.test(folded) || /[\[\]|▷]/.test(text))))
    return 'Website or promotional link in token metadata';
  return null;
}
export function tokenFilterReason(token, tracked = [], hidden = []) {
  if (!token.address) return null; // Native assets cannot be hidden.
  const key = tokenKey(token.chain, token.address);
  if (hidden.some((t) => tokenKey(t.chain, t.address) === key)) return 'Hidden by you';
  if (tracked.some((t) => tokenKey(t.chain, t.address) === key)) return null;
  return spamReason(token);
}
export function splitTokens(rows, tracked = [], hidden = []) {
  const visible = [], filtered = [];
  for (const row of rows) {
    const reason = tokenFilterReason(row, tracked, hidden);
    (reason ? filtered : visible).push(reason ? { ...row, reason } : row);
  }
  return { visible, filtered };
}

// Display policy only: lack of a market price is not a spam verdict. Keep the
// original rows for review and financial coverage checks; explicit tracking wins.
export function assetListTokens(tokens, { tracked = [], showUnpriced = false, hideDust = false } = {}) {
  const trackedKeys = new Set(tracked.map((t) => tokenKey(t.chain, t.address)));
  return tokens.filter((t) => {
    if (!t.address || trackedKeys.has(tokenKey(t.chain, t.address))) return true;
    const priced = hasUsablePrice(t);
    if (!priced) return showUnpriced;
    return !hideDust || t.valueUsd == null || t.valueUsd >= 0.01;
  });
}
