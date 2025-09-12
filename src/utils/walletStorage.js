// src/utils/walletStorage.js

export function loadWallets() {
  try {
    const data = localStorage.getItem('wallets');
    const arr = data ? JSON.parse(data) : [];
    const list = Array.isArray(arr) ? arr : [];
    return list.filter((w) => !w?.hidden);
  } catch {
    return [];
  }
}

export function saveWallets(wallets) {
  localStorage.setItem('wallets', JSON.stringify(wallets));
}
