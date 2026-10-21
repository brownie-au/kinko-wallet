import { NETWORKS, HEX_ADDRESS } from './networks.js';

const nativeIcons = { eth: 'ethereum', base: 'ethereum', pulse: 'pulsechain', bsc: 'bnb', polygon: 'polygon' };
const localTokens = {
  [`eth:${HEX_ADDRESS}`]: 'hex',
  [`pulse:${HEX_ADDRESS}`]: 'hex',
  'pulse:0x95b303987a60c71504d99aa1b13b4daa07b0790ab': 'pulsex',
  'pulse:0x2fa878ab3f87cc1c9737fc071108f904c0b0c95d': 'inc',
  'eth:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'usdc',
  'base:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 'usdc',
  'polygon:0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': 'usdc'
};

// Null explicitly identifies a native balance. Missing or malformed addresses
// must never inherit a native coin's logo (or another token's ticker branding).
export function tokenIconUrl(chain, address) {
  if (!Object.hasOwn(NETWORKS, chain)) return null;
  if (address === null) return `/assets/tokens/${nativeIcons[chain]}.png`;
  if (typeof address !== 'string' || !/^0x[0-9a-f]{40}$/i.test(address)) return null;
  const normalized = address.toLowerCase();
  const local = localTokens[`${chain}:${normalized}`];
  return local ? `/assets/tokens/${local}.png` : `/api/token-icon?chain=${chain}&address=${normalized}`;
}

export function tokenInitials(symbol) {
  return String(symbol || '?').trim().slice(0, 2).toUpperCase() || '?';
}
