// src/utils/uiState.js
// Tiny UI state helpers for sticky chips and "last section" tracking.

const NS = 'kinko.ui:';

// ---- section tracking (session-scoped)
export const setLastSection = (section) => {
  try { sessionStorage.setItem(NS + 'last-section', section); } catch {}
};

export const getLastSection = () => {
  try { return sessionStorage.getItem(NS + 'last-section') || ''; } catch { return ''; }
};

// ---- chip value normalizer (guards against legacy/invalid values) ----
const normalizeChip = (v) => {
  try {
    const s = String(v ?? '').toLowerCase().trim();
    if (!s) return '';
    if (s === 'all') return 'all';
    if (s === 'eth' || s === 'ethereum' || s === '1') return 'eth';
    if (s === 'pulse' || s === 'pulsechain' || s === 'pls' || s === 'plsx' || s === '369') return 'pulse';
    if (s === 'bsc' || s === 'bnb' || s === '56' || s.includes('binance')) return 'bsc';
    // Add Polygon support (aliases + chainId)
    if (s === 'polygon' || s === 'matic' || s === 'pol' || s === '137') return 'polygon';
    if (s === 'base' || s === '8453') return 'base';
    return '';
  } catch {
    return '';
  }
};

// ---- sticky network chip per wallet group (persists across page reloads)
const chipKey = (groupId) => NS + 'netchip:' + String(groupId || 'default');

export const getWalletNetChip = (groupId) => {
  try {
    const raw = localStorage.getItem(chipKey(groupId)) || '';
    return normalizeChip(raw) || '';
  } catch { return ''; }
};

export const setWalletNetChip = (groupId, value) => {
  try {
    const norm = normalizeChip(value) || '';
    localStorage.setItem(chipKey(groupId), String(norm));
  } catch {}
};

// ---- GLOBAL chain chip (shared across All Wallets + individual wallets) ----
const GLOBAL_CHIP_KEY = NS + 'netchip:global';
const GLOBAL_CHIP_TS_KEY = NS + 'netchip:ts';
const FORCE_CHIP_ONCE_KEY = NS + 'force-netchip-once';

export const getGlobalNetChip = () => {
  try {
    const raw = localStorage.getItem(GLOBAL_CHIP_KEY) || '';
    return normalizeChip(raw) || '';
  } catch { return ''; }
};

export const setGlobalNetChip = (value) => {
  try {
    const norm = normalizeChip(value) || '';
    localStorage.setItem(GLOBAL_CHIP_KEY, String(norm));
    // also set a timestamp to help ignore stale writers
    localStorage.setItem(GLOBAL_CHIP_TS_KEY, String(Date.now()));
  } catch {}
};

export const getGlobalNetChipWithTs = () => {
  try {
    return {
      value: getGlobalNetChip(),
      ts: Number(localStorage.getItem(GLOBAL_CHIP_TS_KEY) || 0) || 0
    };
  } catch {
    return { value: '', ts: 0 };
  }
};

// ---- one-time override for next navigation (e.g., Dashboard -> Portfolio View All)
export const setForceGlobalChipOnce = (value) => {
  try {
    const norm = normalizeChip(value) || '';
    const payload = { value: norm, ts: Date.now() };
    localStorage.setItem(FORCE_CHIP_ONCE_KEY, JSON.stringify(payload));
  } catch {}
};

export const consumeForceGlobalChipOnce = (maxAgeMs = 60 * 1000) => {
  try {
    const raw = localStorage.getItem(FORCE_CHIP_ONCE_KEY);
    if (!raw) return '';
    const { value, ts } = JSON.parse(raw) || {};
    const fresh = typeof ts === 'number' && Date.now() - ts <= maxAgeMs;
    // consume the flag regardless to avoid sticky leftovers
    localStorage.removeItem(FORCE_CHIP_ONCE_KEY);
    return fresh ? (normalizeChip(value) || '') : '';
  } catch {
    try { localStorage.removeItem(FORCE_CHIP_ONCE_KEY); } catch {}
    return '';
  }
};

// Optional helper if you ever want to wipe all saved chips
export const clearAllNetChips = () => {
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith(NS + 'netchip:')) localStorage.removeItem(k);
    }
  } catch {}
};
