// Central spam/block list for ALL chains.
// ✅ Put every scam contract here (lowercase). One per line.
export const TOKEN_BLOCKLIST = new Set(['0x66a3c2fa3e467aa586e90912f977e648589cabaf']);

export const isBlockedToken = (addr) => TOKEN_BLOCKLIST.has(String(addr || '').toLowerCase());
