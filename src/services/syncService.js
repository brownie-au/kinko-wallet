// src/services/syncService.js
// Behaviour:
// - CREATE/UPDATE: POST /api/portfolio with { id?, wallets }
// - LOAD:          GET  /api/portfolio?id=ID (fallback to v1 GET /v1/portfolio/:id)

function resolveApiBase() {
  const raw = (import.meta?.env?.VITE_SYNC_API_BASE || '').trim();
  const isPlaceholder =
    /<|>/.test(raw) || /^https?:\/\/<your-sync-api-domain>\/?$/i.test(raw);
  let base = raw;
  if (!base || isPlaceholder) {
    if (typeof window !== 'undefined' && window.location?.origin) {
      base = `${window.location.origin}/api`;
    } else {
      base = '/api';
    }
  }
  base = String(base || '').trim().replace(/\s+$/, '');
  base = base.replace(/\/+$/, '');
  if (!base.toLowerCase().endsWith('/api')) {
    base = `${base}/api`;
  }
  return base.replace(/\/+$/, '') || '/api';
}

const API_BASE = resolveApiBase();

/* -------------------- PID helpers -------------------- */
export function normalizePid(v) {
  return String(v ?? '').trim().toUpperCase();
}
// Strict validator (kept because other files import it)
export function isValidPid(v) {
  return /^[A-Z0-9]{8}$/.test(normalizePid(v));
}
// Relaxed presence check (used internally when we just need "some PID")
export function isNonEmptyPid(v) {
  return normalizePid(v).length > 0;
}

/* -------------------- Response helpers -------------------- */
function extractWallets(data) {
  try {
    if (Array.isArray(data?.wallets)) return data.wallets;

    const raw = data?.value ?? data?.result;
    if (raw != null) {
      const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(obj?.wallets)) return obj.wallets;
    }

    if (data?.data) return extractWallets(data.data);
  } catch { }
  return [];
}

function extractId(data) {
  const tryVals = [
    data?.id,
    data?.value?.id,
    data?.result?.id,
    (() => {
      try {
        const raw = data?.value ?? data?.result;
        if (typeof raw === 'string') {
          const j = JSON.parse(raw);
          return j?.id;
        }
        return raw?.id;
      } catch { return undefined; }
    })(),
  ].filter(Boolean);

  for (const c of tryVals) {
    const clean = normalizePid(c);
    if (clean) return clean;
  }
  return '';
}

const j = async (r) => {
  if (!r) throw new Error('No response');
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try {
      const txt = await r.text();
      if (txt) {
        try {
          const jj = JSON.parse(txt);
          if (jj && jj.error) msg += `: ${jj.error}`;
          else msg += `: ${txt}`;
        } catch { msg += `: ${txt}`; }
      }
    } catch { }
    const err = new Error(msg);
    err.status = r.status;
    throw err;
  }
  const ct = r.headers.get('content-type') || '';
  if (ct.includes('application/json')) return r.json();
  return {};
};

const v1Url = (id) =>
  `${API_BASE}/v1/portfolio/${encodeURIComponent(normalizePid(id))}`;

const ensureWalletArray = (wallets) => {
  if (Array.isArray(wallets)) return wallets;
  if (wallets == null) return [];
  return [wallets];
};

async function postPortfolioRequest(id, wallets) {
  const cleanId = normalizePid(id);
  const body = { wallets: ensureWalletArray(wallets) };
  if (cleanId) body.id = cleanId;

  const data = await fetch(`${API_BASE}/portfolio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  }).then(j);

  const returnedId = extractId(data) || cleanId;
  const normalizedId = normalizePid(returnedId);
  if (!normalizedId) throw new Error('Server did not return a valid Portfolio ID');

  const meta = typeof data?.meta === 'object' && data?.meta !== null ? data.meta : {};
  return { ok: true, id: normalizedId, meta };
}

/* -------------------- Public API -------------------- */

// LOAD (GET /portfolio?id=ID) with v1 fallback
export async function loadById(id) {
  const clean = normalizePid(id);
  if (!clean) throw new Error('Missing Portfolio ID');

  const q = `${API_BASE}/portfolio?id=${encodeURIComponent(clean)}`;
  try {
    const data = await fetch(q, { headers: { Accept: 'application/json' } }).then(j);
    const wallets = extractWallets(data);
    return { wallets, source: 'remote', meta: {} };
  } catch (e) {
    if (/HTTP\s(404|405)/.test(String(e?.message || ''))) {
      const data = await fetch(v1Url(clean), { headers: { Accept: 'application/json' } }).then(j);
      const wallets = extractWallets(data);
      return { wallets, source: 'remote', meta: { updatedAt: data?.updatedAt, checksum: data?.checksum } };
    }
    throw e;
  }
}

export async function saveById(id, wallets) {
  return postPortfolioRequest(id, wallets);
}

export async function createPortfolio(wallets) {
  return postPortfolioRequest(undefined, wallets);
}

export async function createRemote(wallets) {
  const { id } = await createPortfolio(wallets);
  return id;
}

export async function updateRemote(id, wallets) {
  const { id: savedId } = await saveById(id, wallets);
  return savedId;
}

/* -------------------- Optional generator (UI only) -------------------- */
export function generatePortfolioId(len = 8) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[(Math.random() * chars.length) | 0];
  return out;
}

/* -------------------- Local ID helpers -------------------- */
const ID_KEY = 'kinko:sync:id';
export function getSyncId() {
  try { return normalizePid(localStorage.getItem(ID_KEY) || ''); } catch { return ''; }
}
export function setSyncId(id) {
  try {
    const clean = normalizePid(id);
    if (clean) localStorage.setItem(ID_KEY, clean);
    else localStorage.removeItem(ID_KEY);
  } catch { }
}
export function clearSyncId() {
  try { localStorage.removeItem(ID_KEY); } catch { }
}

/* -------------------- Back-compat named exports -------------------- */
export const loadPortfolio = loadById;
export const savePortfolio = saveById;
export const updatePortfolio = updateRemote;
