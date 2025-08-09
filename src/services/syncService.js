// src/services/syncService.js
// Works with a backend if VITE_SYNC_API_BASE is set,
// otherwise falls back to localStorage-only (good for dev).

const API = import.meta.env.VITE_SYNC_API_BASE || "";

/* ------------ local wallet helpers (your existing 'wallets' key) ------------ */
export function readLocalWallets() {
  try {
    return JSON.parse(localStorage.getItem("wallets") || "[]");
  } catch {
    return [];
  }
}

export function writeLocalWallets(wallets) {
  localStorage.setItem("wallets", JSON.stringify(wallets || []));
}

/* -------------------------- sync id helpers -------------------------- */
export function saveSyncId(id) {
  localStorage.setItem("kinko:sync:id", id);
}
export function getSyncId() {
  return localStorage.getItem("kinko:sync:id") || "";
}
export function clearSyncId() {
  localStorage.removeItem("kinko:sync:id");
}

/* -------------------------- local-only sync store -------------------------- */
// For no-backend dev, we keep a map of { [id]: { wallets, updatedAt } }
const LOCAL_SYNC_KEY = "kinko:sync:store";

function readLocalSyncStore() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_SYNC_KEY) || "{}");
  } catch {
    return {};
  }
}
function writeLocalSyncStore(store) {
  localStorage.setItem(LOCAL_SYNC_KEY, JSON.stringify(store || {}));
}

function genId(len = 8) {
  // 8-char, readable, uppercase base36
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => (b % 36).toString(36))
    .join("")
    .toUpperCase();
}

/* -------------------------- API helpers -------------------------- */
async function apiGet(id) {
  const url = `${API.replace(/\/$/, "")}/portfolios/${encodeURIComponent(id)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`API ${r.status} ${r.statusText}`);
  return r.json();
}
async function apiPut(id, wallets) {
  const url = `${API.replace(/\/$/, "")}/portfolios/${encodeURIComponent(id)}`;
  const r = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallets }),
  });
  if (!r.ok) throw new Error(`API ${r.status} ${r.statusText}`);
  return r.json();
}
async function apiCreate(wallets) {
  const url = `${API.replace(/\/$/, "")}/portfolios`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallets }),
  });
  if (!r.ok) throw new Error(`API ${r.status} ${r.statusText}`);
  return r.json(); // expect { id, wallets }
}

/* -------------------------- public: export/import -------------------------- */
/**
 * Export current wallets to sync store.
 * If an ID already exists, update it; otherwise create a new one.
 * Returns { ok, id, count }
 */
export async function exportPortfolio() {
  const wallets = readLocalWallets();
  if (!API) {
    // Local-only
    const store = readLocalSyncStore();
    let id = getSyncId() || genId();
    store[id] = { wallets, updatedAt: Date.now() };
    writeLocalSyncStore(store);
    saveSyncId(id);
    return { ok: true, id, count: wallets.length, backend: false };
  }

  // Backend mode
  const existing = getSyncId();
  if (existing) {
    await apiPut(existing, wallets);
    return { ok: true, id: existing, count: wallets.length, backend: true };
  } else {
    const res = await apiCreate(wallets); // expect { id }
    const id = res.id || genId();
    saveSyncId(id);
    return { ok: true, id, count: wallets.length, backend: true };
  }
}

/**
 * Import wallets by ID and persist locally + set sync id.
 * Returns { ok, id, count }
 */
export async function importPortfolio(id) {
  if (!id || typeof id !== "string") {
    throw new Error("importPortfolio: invalid ID");
  }

  if (!API) {
    // Local-only restore
    const store = readLocalSyncStore();
    const entry = store[id];
    if (!entry || !Array.isArray(entry.wallets)) {
      throw new Error("No data found for that ID (local dev store).");
    }
    writeLocalWallets(entry.wallets);
    saveSyncId(id);
    return { ok: true, id, count: entry.wallets.length, backend: false };
  }

  // Backend mode
  const res = await apiGet(id); // expect { wallets: [...] }
  const wallets = Array.isArray(res.wallets) ? res.wallets : [];
  writeLocalWallets(wallets);
  saveSyncId(id);
  return { ok: true, id, count: wallets.length, backend: true };
}
