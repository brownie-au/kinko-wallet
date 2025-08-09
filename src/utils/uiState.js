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

// ---- sticky network chip per wallet group (persists across page reloads)
const chipKey = (groupId) => NS + 'netchip:' + String(groupId || 'default');

export const getWalletNetChip = (groupId) => {
  try { return localStorage.getItem(chipKey(groupId)) || ''; } catch { return ''; }
};

export const setWalletNetChip = (groupId, value) => {
  try { localStorage.setItem(chipKey(groupId), String(value || '')); } catch {}
};

// Optional helper if you ever want to wipe all saved chips
export const clearAllNetChips = () => {
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith(NS + 'netchip:')) localStorage.removeItem(k);
    }
  } catch {}
};
