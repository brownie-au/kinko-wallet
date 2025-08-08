// src/services/syncService.js
// Works with a backend if VITE_SYNC_API_BASE is set,
// otherwise falls back to localStorage-only (good for dev).

const API = import.meta.env.VITE_SYNC_API_BASE || '';

/* ------------ local wallet helpers (your existing 'wallets' key) ------------ */
export function readLocalWallets() {
  try {
    return JSON.parse(localStorage.getItem('wallets') || '[]');
  } catch {
    return [];
  }
}

export function writeLocalWallets(wallets) {
  localStorage.setItem('wallets', JSON.stringify(wallets || []));
}

/* -------------------------- sync id helpers -------------------------- */
export function saveSyncId(id) {
  localStorage.setItem('kinko:sync:id', id);
}
export function getSyncId() {
  return localStorage.getItem('kinko:sync:id') || '';
}
export function clearSyncId() {
  localStorage.removeItem('kinko:sync:id');
}

/* ----------------------------- utils ------------------------------ */
function genId(len = 8) {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I/O/1/0
  let out = '';
  crypto.getRandomValues(new Uint8Array(len)).forEach((n) => (out += alphabet[n % alphabet.length]));
  return out;
}

/* --------------------------- API methods --------------------------- */
// Create a new Portfolio ID from current local wallets
export async function createPortfolio() {
  const payload = { wallets: readLocalWallets() };

  if (API) {
    const res = await fetch(`${API}/api/portfolio`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: payload })
    });
    if (!res.ok) throw new Error('Failed to create portfolio id');
    const { id } = await res.json();
    saveSyncId(id);
    return { id, source: 'api' };
  }

  // Local fallback (dev only)
  const id = genId(8);
  localStorage.setItem(`kinko:sync:local:${id}`, JSON.stringify(payload));
  saveSyncId(id);
  return { id, source: 'local' };
}

// Load a portfolio by ID
export async function loadPortfolio(id) {
  const code = (id || '').toUpperCase().trim();
  if (!code) throw new Error('Empty ID');

  if (API) {
    const r = await fetch(`${API}/api/portfolio/${code}`);
    if (!r.ok) throw new Error('Not found');
    const { data } = await r.json();
    return data || { wallets: [] };
  }

  // Local fallback (dev)
  const raw = localStorage.getItem(`kinko:sync:local:${code}`);
  if (!raw) throw new Error('Not found (local)');
  return JSON.parse(raw);
}

// Save current local wallets to the given ID
export async function savePortfolio(id) {
  const code = (id || '').toUpperCase().trim();
  if (!code) throw new Error('Missing ID');
  const payload = { wallets: readLocalWallets() };

  if (API) {
    const r = await fetch(`${API}/api/portfolio/${code}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-key': code },
      body: JSON.stringify({ data: payload })
    });
    if (!r.ok) throw new Error('Save failed');
    return true;
  }

  // Local fallback (dev)
  localStorage.setItem(`kinko:sync:local:${code}`, JSON.stringify(payload));
  return true;
}
