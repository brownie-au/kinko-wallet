// src/services/syncService.js
// Local-first sync. If VITE_SYNC_API_BASE is set, we also push/pull to a backend.
// Always mirror to the 'wallets' key so the UI stays in sync.

const API = import.meta.env.VITE_SYNC_API_BASE || '';

const log  = (...a) => console.log('%c[SYNC]', 'color:#0bf', ...a);
const warn = (...a) => console.warn('%c[SYNC]', 'color:#fb0', ...a);
const err  = (...a) => console.error('%c[SYNC]', 'color:#f55', ...a);

/* -------------------- local UI mirror (wallets key) -------------------- */
export function readLocalWallets() {
  try {
    const out = JSON.parse(localStorage.getItem('wallets') || '[]');
    return Array.isArray(out) ? out : [];
  } catch {
    return [];
  }
}
export function writeLocalWallets(wallets) {
  try {
    localStorage.setItem('wallets', JSON.stringify(wallets || []));
    log('writeLocalWallets()', { count: (wallets || []).length });
  } catch (e) {
    err('writeLocalWallets() error', e);
  }
}

/* -------------------- sync id helpers -------------------- */
const SYNC_ID_KEY = 'kinko:sync:id';
const bundleKey = (id) => `kinko:sync:local:${id}`;

export function saveSyncId(id) {
  localStorage.setItem(SYNC_ID_KEY, id || '');
  log('saveSyncId()', id);
}
export function getSyncId() {
  return localStorage.getItem(SYNC_ID_KEY) || '';
}
export function clearSyncId() {
  localStorage.removeItem(SYNC_ID_KEY);
}

/* -------------------- bundle helpers (local) -------------------- */
export function readSyncBundle(id) {
  if (!id) return { wallets: [], updatedAt: 0 };
  try {
    const raw = localStorage.getItem(bundleKey(id));
    const obj = raw ? JSON.parse(raw) : null;
    const wallets = Array.isArray(obj?.wallets) ? obj.wallets : [];
    return { wallets, updatedAt: obj?.updatedAt || 0 };
  } catch (e) {
    warn('readSyncBundle() parse error', e);
    return { wallets: [], updatedAt: 0 };
  }
}

export function writeSyncBundle(id, wallets) {
  if (!id) return;
  const payload = { wallets: Array.isArray(wallets) ? wallets : [], updatedAt: Date.now() };
  localStorage.setItem(bundleKey(id), JSON.stringify(payload));
  log('writeSyncBundle()', { id, count: payload.wallets.length });
}

/* -------------------- remote helpers (optional) -------------------- */
function hasRemote() {
  return Boolean(API);
}
async function getJSON(url) {
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`GET ${url} -> ${r.status}`);
  return r.json();
}
async function putJSON(url, body) {
  const r = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body || {})
  });
  if (!r.ok) throw new Error(`PUT ${url} -> ${r.status}`);
  return r.json();
}

/* -------------------- ID generator -------------------- */
export function generatePortfolioId(len = 8) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // avoid 0/O/I/1
  let out = '';
  for (let i = 0; i < len; i++) out += chars[(Math.random() * chars.length) | 0];
  return out;
}

/* -------------------- public API -------------------- */
// Load wallets by ID → mirror to 'wallets'
export async function loadById(id) {
  id = (id || '').trim().toUpperCase();
  if (!id) return { wallets: [], source: 'none' };

  // Remote if configured, else local bundle
  if (hasRemote()) {
    const url = `${API.replace(/\/+$/, '')}/v1/portfolio/${encodeURIComponent(id)}`;
    try {
      const data = await getJSON(url);
      const wallets = Array.isArray(data?.wallets) ? data.wallets : [];
      writeLocalWallets(wallets);
      saveSyncId(id);
      return { wallets, source: 'remote', meta: { updatedAt: data?.updatedAt, checksum: data?.checksum } };
    } catch (e) {
      err('loadById remote FAIL, falling back to local bundle', e);
    }
  }

  const { wallets } = readSyncBundle(id);
  writeLocalWallets(wallets);
  saveSyncId(id);
  return { wallets, source: 'local-bundle' };
}

// Save wallets under ID → mirror to local + (optional) remote
export async function saveById(id, wallets) {
  id = (id || '').trim().toUpperCase();
  if (!id) return { ok: false, error: 'missing id' };

  // Always update local mirror + local bundle
  writeLocalWallets(wallets || []);
  writeSyncBundle(id, wallets || []);
  saveSyncId(id);

  if (!hasRemote()) return { ok: true, source: 'local-only' };

  try {
    const url = `${API.replace(/\/+$/, '')}/v1/portfolio/${encodeURIComponent(id)}`;
    const resp = await putJSON(url, { wallets: wallets || [] });
    return { ok: true, source: 'remote', meta: resp };
  } catch (e) {
    err('saveById remote FAIL, kept local mirror', e);
    return { ok: false, source: 'local-mirror', error: e.message };
  }
}

/* ---- compatibility aliases ---- */
export const loadPortfolio   = loadById;
export const savePortfolio   = saveById;
export const createPortfolio = saveById; // kept for legacy callers
