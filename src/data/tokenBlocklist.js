// Central spam/block list for ALL chains.
// ✅ Put every scam contract here (lowercase). One per line.
export const TOKEN_BLOCKLIST = new Set([
  // lowercase contract addresses
  '0x66a3c2fa3e467aa586e90912f977e648589cabaf'
]);

// Simple address check
export const isBlockedToken = (addr) =>
  TOKEN_BLOCKLIST.has(String(addr || '').toLowerCase());

// Symbol/name deny rules (handles variants)
const SYMBOL_DENY = new Set(['ETHG', 'AICC']);
const KEYWORD_DENY = [
  'aicc - ai chain coin',
  'aicc',
  'ethg'
];

export function isBlacklistedBySymbolOrName(symbol = '', name = '') {
  const sym = String(symbol || '').trim().toUpperCase();
  if (SYMBOL_DENY.has(sym)) return true;
  const hay = `${String(symbol || '')} ${String(name || '')}`.toLowerCase();
  return KEYWORD_DENY.some((kw) => hay.includes(kw));
}

// Unified checker usable across UI/services
export function isTokenBlacklisted(t = {}) {
  const addr = (t.address || t.contract || '').toLowerCase();
  if (addr && isBlockedToken(addr)) return true;
  return isBlacklistedBySymbolOrName(t.symbol, t.name);
}
