// src/services/syncService.js
// Remote-backed sync when VITE_SYNC_API_BASE is set; mirrors to localStorage.
// Very loud logs so we can see exactly what's happening in DevTools.

const API = import.meta.env.VITE_SYNC_API_BASE || '';

const log = (...args) => console.log('%c[SYNC]', 'color:#0bf', ...args);
const warn = (...args) => console.warn('%c[SYNC]', 'color:#fb0', ...args);
const err  = (...args) => console.error('%c[SYNC]', 'color:#f55', ...args);

// ---------------- local wallets mirror (existing key) ----------------
export function readLocalWallets() {
  try {
    const out = JSON.parse(localStorage.getItem('wallets') || '[]');
    log('readLocalWallets()', out);
    return Array.isArray(out) ? out : [];
  } catch (e) {
    err('readLocalWallets() parse error', e);
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

// ---------------- sync id helpers ----------------
const SYNC_ID_KEY = 'kinko:sync:id';

export function saveSyncId(id) {
  localStorage.setItem(SYNC_ID_KEY, id || '');
  log('saveSyncId()', id);
}
export function getSyncId() {
  const id = localStorage.getItem(SYNC_ID_KEY) || '';
  log('getSyncId() ->', id);
  return id;
}
export function clearSyncId() {
  localStorage.removeItem(SYNC_ID_KEY);
  log('clearSyncId()');
}

export function hasRemote() {
  const ok = Boolean(API);
  log('hasRemote()', ok, API || '(none)');
  return ok;
}

// ---------------- remote API helpers ----------------
// Expected server:
//   GET  {API}/v1/portfolio/:id           -> 200 { wallets: [...], updatedAt, checksum }
//   PUT  {API}/v1/portfolio/:id  body:{ wallets } -> 200 { ok:true, updatedAt, checksum }
// CORS must allow your app origin.

async function getJSON(url) {
  const res = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json();
}
async function putJSON(url, body) {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(body || {})
  });
  if (!res.ok) throw new Error(`PUT ${url} -> ${res.status}`);
  return res.json();
}

// ---------------- public API used by modals ----------------
export async function loadById(id) {
  if (!id) {
    warn('loadById() missing id');
    return { wallets: [], source: 'none' };
  }

  if (!hasRemote()) {
    // CURRENT BEHAVIOUR: local only (why cross-browser fails)
    const wallets = readLocalWallets();
    const note = '(local-only build: no VITE_SYNC_API_BASE)';
    warn('loadById() remote unavailable', note);
    return { wallets, source: 'local' };
  }

  const url = `${API.replace(/\/+$/, '')}/v1/portfolio/${encodeURIComponent(id)}`;
  try {
    log('loadById() -> GET', url);
    const data = await getJSON(url);
    const wallets = Array.isArray(data?.wallets) ? data.wallets : [];
    log('loadById() remote OK', { count: wallets.length, updatedAt: data?.updatedAt });
    // mirror locally for offline/fast open
    writeLocalWallets(wallets);
    saveSyncId(id);
    return { wallets, source: 'remote', meta: { updatedAt: data?.updatedAt, checksum: data?.checksum } };
  } catch (e) {
    err('loadById() remote FAIL', e);
    // graceful fallback to local
    const wallets = readLocalWallets();
    return { wallets, source: 'fallback-local', error: e.message };
  }
}

export async function saveById(id, wallets) {
  if (!id) {
    warn('saveById() missing id');
    return { ok: false, error: 'missing id' };
  }

  writeLocalWallets(wallets || []);
  saveSyncId(id);

  if (!hasRemote()) {
    warn('saveById() remote unavailable; saved local only');
    return { ok: true, source: 'local-only' };
  }

  const url = `${API.replace(/\/+$/, '')}/v1/portfolio/${encodeURIComponent(id)}`;
  try {
    log('saveById() -> PUT', url, { count: (wallets || []).length });
    const resp = await putJSON(url, { wallets: wallets || [] });
    log('saveById() remote OK', resp);
    return { ok: true, source: 'remote', meta: resp };
  } catch (e) {
    err('saveById() remote FAIL', e);
    return { ok: false, source: 'local-mirror', error: e.message };
  }
}
