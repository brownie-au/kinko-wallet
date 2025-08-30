// src/config/ethBlocklist.js
// Add any ETH ERC-20 contract addresses you want hidden (lowercase!).
export const ETH_TOKEN_BLOCKLIST = new Set([
  '0x66a3a...abaf'.toLowerCase() // <- your scam token (paste full addr)
]);

// Optional: also allow a CSV in .env like VITE_ETH_BLOCKLIST=0xabc...,0xdef...
export function envEthBlocklist() {
  const s = import.meta.env.VITE_ETH_BLOCKLIST || '';
  return new Set(
    s
      .split(',')
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
  );
}
