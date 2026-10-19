// Contract identity is always chain + address; symbols and missing prices are not trust signals.
export const tokenKey = (chain, address) => `${chain}:${String(address || '').toLowerCase()}`;
export function spamReason(token) {
  if (token.spam === true || token.is_spam === true) return 'Flagged by the token provider';
  const text = `${token.name || ''} ${token.symbol || ''}`.normalize('NFKC')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '').toLowerCase();
  const link = /https?:\/\/|www\.|t\.me\/|(?:[a-z0-9-]+\.)+(?:com|net|org|io|xyz|live|site|app|finance|gifts|fun|top)(?:\b|\/)/.test(text);
  if (link && (/\b(claim|collect|airdrop|reward[s]?|redeem|visit|voucher|gift[s]?)\b/.test(text) || /https?:\/\/|www\.|t\.me\//.test(text)))
    return 'Promotional or claim link in token metadata';
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
