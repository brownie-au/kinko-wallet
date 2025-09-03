// src/services/syncService.js
// REMOTE-ONLY sync. No localStorage, no mirroring, no fallbacks.

// Resolve the Sync API base URL in a robust way:
// - Prefer VITE_SYNC_API_BASE when provided
// - If it looks like a placeholder (contains '<' or '>') or is empty,
//   fall back to same-origin '/api' which matches the serverless route folder
//   (api/v1/portfolio/[id].js) used in production deployments.
function resolveApiBase() {
  const raw = (import.meta?.env?.VITE_SYNC_API_BASE || '').trim();

  // Treat placeholders or empty values as unset
  const isPlaceholder = /<|>/.test(raw) || /^https?:\/\/<your-sync-api-domain>\/?$/i.test(raw);

  let base = raw;
  if (!base || isPlaceholder) {
    // Same-origin fallback – works when the app and API are hosted together
    // (e.g., Vercel: https://your-domain/api)
    if (typeof window !== 'undefined' && window.location?.origin) {
      base = `${window.location.origin}/api`;
    } else {
      base = '/api';
    }
  }

  // Allow relative '/api' or absolute URLs; normalize by removing trailing slashes
  return String(base).replace(/\/+$/, '');
}

const API_BASE = resolveApiBase();

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
