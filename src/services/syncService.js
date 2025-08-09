// src/services/syncService.js
// Works with our live /api/portfolio backend (GET ?slug=, PUT body),
// and falls back to localStorage-only if VITE_SYNC_API_BASE is blank (dev).

const BASE = (import.meta.env.VITE_SYNC_API_BASE || '').replace(/\/$/, '');
const API = `${BASE}/api/portfolio`;

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
  crypto.getRandomValues(new Uint8Array(len)).forEach(
    (n) => (out += alphabet[n % alphabet.length])
  );
  return out;
}

async function apiGet(id) {
  const r = await fetch(`${API}?slug=${encodeURIComponent(id)}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('GET failed');
  return r.json(); // { slug, version, updatedAt, blob }
}

async function apiPut(id, blob, prevVersion) {
  const r = await fetch(API, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug: id, blob, prevVersion })
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`PUT failed ${r.status} ${text}`);
  }
  return r.json(); // { slug, version, updatedAt, blob }
}

/* --------------------------- API methods --------------------------- */
// Create a new Portfolio ID from current local wallets
export async function createPortfolio() {
  const payload = { wallets: readLocalWallets() };

  // Cloud path
  if (API) {
    const id = genId(8);
    const saved = await apiPut(id, payload); // first version
    saveSyncId(saved.slug);
    return { id: saved.slug, source: 'api', version: saved.version };
  }

  // Local fallback (dev only)
  const id = genId(8);
  localStorage.setItem(`kinko:sync:local:${id}`, JSON.stringify(payload));
  saveSyncId(id);
  return { id, source: 'local', version: 1 };
}

// Load a portfolio by ID (does not overwrite local by itself)
export async function loadPortfolio(id) {
  const code = (id || '').toUpperCase().trim();
  if (!code) throw new Error('Empty ID');

  if (API) {
    const rec = await apiGet(code); // may be null
    if (!rec) throw new Error('Not found');
    return rec.blob || { wallets: [] };
  }

  // Local fallback (dev)
  const raw = localStorage.getItem(`kinko:sync:local:${code}`);
  if (!raw) throw new Error('Not found (local)');
  return JSON.parse(raw);
}

// Save current local wallets to the given ID (optimistic version check)
export async function savePortfolio(id) {
  const code = (id || '').toUpperCase().trim();
  if (!code) throw new Error('Missing ID');
  const payload = { wallets: readLocalWallets() };

  if (API) {
    const existing = await apiGet(code); // may be null on first write
    const saved = await apiPut(code, payload, existing?.version);
    saveSyncId(code);
    return { ok: true, version: saved.version };
  }

  // Local fallback (dev)
  localStorage.setItem(`kinko:sync:local:${code}`, JSON.stringify(payload));
  return { ok: true, version: 1 };
}

/* ---------------- convenience for new devices --------------------- */
// Pull a portfolio ID into this device and replace local wallets
export async function importPortfolio(id) {
  const data = await loadPortfolio(id);
  writeLocalWallets(data.wallets || []);
  saveSyncId((id || '').toUpperCase().trim());
  return true;
}
