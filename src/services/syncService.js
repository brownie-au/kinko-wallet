// src/services/syncService.js
// Remote Portfolio sync helpers used by UI modals.
// Primary API: POST/GET /api/portfolio
// Fallback API (legacy): PUT/GET /api/v1/portfolio/:id

function resolveApiBase() {
  const raw = (import.meta?.env?.VITE_SYNC_API_BASE || '').trim();
  const isPlaceholder = /<|>/.test(raw) || /^https?:\/\/<your-sync-api-domain>\/?$/i.test(raw);
  let base = raw;
  if (!base || isPlaceholder) {
    if (typeof window !== 'undefined' && window.location?.origin) base = `${window.location.origin}/api`;
    else base = '/api';
  }
  return String(base).replace(/\/+$/, '');
}

const API_BASE = resolveApiBase();

// normalize remote responses which may come in several shapes depending on
// the deployed API (unwrapped vs Upstash wrapper).
function extractWallets(data) {
  try {
    // Preferred shape
    if (Array.isArray(data?.wallets)) return data.wallets;

    // Upstash KV REST wrapper variants
    const raw = data?.value ?? data?.result;
    if (raw != null) {
      const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(obj?.wallets)) return obj.wallets;
    }

    // Some endpoints may put the JSON into `data.data`
    if (data?.data) return extractWallets(data.data);
  } catch {}
  return [];
}

// helpers
const j = async (r) => {
  if (!r) throw new Error('No response');
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try {
      const txt = await r.text();
      if (txt) {
        try { const j = JSON.parse(txt); if (j && j.error) msg += `: ${j.error}`; else msg += `: ${txt}`; }
        catch { msg += `: ${txt}`; }
      }
    } catch {}
    throw new Error(msg);
  }
  return r.json();
};
const v1Url = (id) => `${API_BASE}/v1/portfolio/${encodeURIComponent(String(id).trim().toUpperCase())}`;

// --- public API ---
export async function loadById(id) {
  if (!id) throw new Error('Missing Portfolio ID');
  const q = `${API_BASE}/portfolio?id=${encodeURIComponent(String(id).trim().toUpperCase())}`;
  try {
    const data = await fetch(q, { headers: { Accept: 'application/json' } }).then(j);
    const wallets = extractWallets(data);
    return { wallets, source: 'remote', meta: {} };
  } catch (e) {
    // Fallback to legacy v1 route if 404/405
    if (/HTTP\s(404|405)/.test(String(e?.message || ''))) {
      const data = await fetch(v1Url(id), { headers: { Accept: 'application/json' } }).then(j);
      const wallets = extractWallets(data);
      return { wallets, source: 'remote', meta: { updatedAt: data?.updatedAt, checksum: data?.checksum } };
    }
    throw e;
  }
}

export async function saveById(id, wallets) {
  if (!id) throw new Error('Missing Portfolio ID');
  const body = { id: String(id).trim().toUpperCase(), wallets: Array.isArray(wallets) ? wallets : [] };
  try {
    const data = await fetch(`${API_BASE}/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    }).then(j);
    return { ok: true, source: 'remote', meta: data };
  } catch (e) {
    // Fallback to legacy v1 route if 404/405
    if (/HTTP\s(404|405)/.test(String(e?.message || ''))) {
      const data = await fetch(v1Url(id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ wallets: Array.isArray(wallets) ? wallets : [] })
      }).then(j);
      return { ok: true, source: 'remote', meta: data };
    }
    throw e;
  }
}

// optional generator
export function generatePortfolioId(len = 8) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[(Math.random() * chars.length) | 0];
  return out;
}

// local id helpers (used by chip/modal)
const ID_KEY = 'kinko:sync:id';
export function getSyncId() {
  try { return localStorage.getItem(ID_KEY) || ''; } catch { return ''; }
}
export function setSyncId(id) {
  try { if (id) localStorage.setItem(ID_KEY, String(id).toUpperCase()); } catch {}
}
export function clearSyncId() {
  try { localStorage.removeItem(ID_KEY); } catch {}
}

// legacy aliases (kept so other files import without errors)
export const loadPortfolio   = loadById;
export const savePortfolio   = saveById;
export const createPortfolio = saveById;
