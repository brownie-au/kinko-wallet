// src/utils/walletStorage.js

export function loadWallets() {
  try {
    const data = localStorage.getItem('wallets');
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveWallets(wallets) {
  localStorage.setItem('wallets', JSON.stringify(wallets));
}
