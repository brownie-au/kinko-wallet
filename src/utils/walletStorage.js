import { normalizeWallets } from './walletRecords.js';
export function loadWallets() {
  try {
    return normalizeWallets(JSON.parse(localStorage.getItem('wallets') || '[]')).filter((w) => !w.hidden);
  } catch {
    return [];
  }
}
export function saveWallets(wallets) {
  localStorage.setItem('wallets', JSON.stringify(normalizeWallets(wallets, { strict: true })));
}
