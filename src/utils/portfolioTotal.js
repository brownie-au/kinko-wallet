// src/utils/portfolioTotal.js
// Stores and retrieves the last known portfolio USD total

const KEY = 'kw:lastPortfolioTotalUsd';
const TS_KEY = 'kw:lastPortfolioTotalUsdAt';

// Save a number (in USD)
export function setPortfolioTotalUsd(value) {
  const v = Number(value || 0);
  try {
    localStorage.setItem(KEY, String(v));
    localStorage.setItem(TS_KEY, String(Date.now()));
  } catch (_) {}
  return v;
}

// Read the number; optionally require it to be recent
export function getPortfolioTotalUsd({ maxAgeMs } = {}) {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw == null) return 0;

    if (maxAgeMs) {
      const ts = Number(localStorage.getItem(TS_KEY) || 0);
      if (!ts || Date.now() - ts > maxAgeMs) return 0;
    }
    return Number(raw) || 0;
  } catch (_) {
    return 0;
  }
}

// Format USD consistently
export function fmtUSD(n) {
  const amt = (Number(n) || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `USD $${amt}`;
}
// Returns a timestamp (ms since epoch) when the total was saved
export function getPortfolioTotalUpdatedAt() {
  try {
    return Number(localStorage.getItem('kw:lastPortfolioTotalUsdAt') || 0);
  } catch (_) {
    return 0;
  }
}
