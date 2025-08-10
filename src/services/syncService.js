// src/services/syncService.js
// REMOTE-ONLY sync. No localStorage, no mirroring, no fallbacks.

const API_BASE = (import.meta.env.VITE_SYNC_API_BASE || '').replace(/\/+$/, '');
if (!API_BASE) {
  throw new Error('VITE_SYNC_API_BASE is not set. Remote-only mode cannot run.');
}

// --- small helpers ---
const j = (r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)));
const url = (id) => `${API_BASE}/v1/portfolio/${encodeURIComponent(String(id).trim().toUpperCase())}`;

// --- public API ---
export async function loadById(id) {
  if (!id) throw new Error('Missing Portfolio ID');
  const data = await fetch(url(id), { headers: { Accept: 'application/json' } }).then(j);
  const wallets = Array.isArray(data?.wallets) ? data.wallets : [];
  return { wallets, source: 'remote', meta: { updatedAt: data?.updatedAt, checksum: data?.checksum } };
}

export async function saveById(id, wallets) {
  if (!id) throw new Error('Missing Portfolio ID');
  const body = { wallets: Array.isArray(wallets) ? wallets : [] };
  const data = await fetch(url(id), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body)
  }).then(j);
  return { ok: true, source: 'remote', meta: data };
}

// optional generator
export function generatePortfolioId(len = 8) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[(Math.random() * chars.length) | 0];
  return out;
}

// legacy aliases (kept so other files import without errors)
export const loadPortfolio   = loadById;
export const savePortfolio   = saveById;
export const createPortfolio = saveById;
