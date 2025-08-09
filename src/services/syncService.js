// src/services/syncService.js
// Works with a backend if VITE_SYNC_API_BASE is set,
// otherwise falls back to localStorage-only (great for dev/incognito tests).

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
  localStorage.setItem("kinko:sync:id", String(id || ""));
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
  return r.json(); // { id, wallets }
}
async function apiPut(id, wallets) {
  const url = `${API.replace(/\/$/, "")}/portfolios/${encodeURIComponent(id)}`;
  const r = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallets }),
  });
  if (!r.ok) throw new Error(`API ${r.status} ${r.statusText}`);
  return r.json(); // { id, wallets }
}
async function apiCreate(wallets) {
  const url = `${API.replace(/\/$/, "")}/portfolios`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallets }),
  });
  if (!r.ok) throw new Error(`API ${r.status} ${r.statusText}`);
  return r.json(); // { id, wallets }
}

/* -------------------------- public: core ops -------------------------- */
/** Export current local wallets to existing/new ID. Returns { ok, id, count, backend } */
export async function exportPortfolio() {
  const wallets = readLocalWallets();

  if (!API) {
    const store = readLocalSyncStore();
    let id = getSyncId() || genId();
    store[id] = { wallets, updatedAt: Date.now() };
    writeLocalSyncStore(store);
    saveSyncId(id);
    return { ok: true, id, count: wallets.length, backend: false };
  }

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

/** Import wallets by ID, persist locally, set sync id. Returns { ok, id, count, backend } */
export async function importPortfolio(id) {
  if (!id || typeof id !== "string") throw new Error("importPortfolio: invalid ID");

  if (!API) {
    const store = readLocalSyncStore();
    const entry = store[id];
    if (!entry || !Array.isArray(entry.wallets))
      throw new Error("No data found for that ID (local dev store).");
    writeLocalWallets(entry.wallets);
    saveSyncId(id);
    return { ok: true, id, count: entry.wallets.length, backend: false };
  }

  const res = await apiGet(id); // { wallets }
  const wallets = Array.isArray(res.wallets) ? res.wallets : [];
  writeLocalWallets(wallets);
  saveSyncId(id);
  return { ok: true, id, count: wallets.length, backend: true };
}

/* -------------------------- public: UI-friendly wrappers -------------------------- */
/** Create a brand-new portfolio ID for current local wallets. Returns { id, wallets } */
export async function createPortfolio() {
  const wallets = readLocalWallets();

  if (!API) {
    const store = readLocalSyncStore();
    const id = genId();
    store[id] = { wallets, updatedAt: Date.now() };
    writeLocalSyncStore(store);
    saveSyncId(id);
    return { id, wallets };
  }

  const res = await apiCreate(wallets); // { id, wallets? }
  const id = res.id || genId();
  saveSyncId(id);
  return { id, wallets };
}

/** Save (update) the given portfolio ID with current local wallets. Returns { id, wallets } */
export async function savePortfolio(id) {
  if (!id) throw new Error("savePortfolio: missing id");
  const wallets = readLocalWallets();

  if (!API) {
    const store = readLocalSyncStore();
    store[id] = { wallets, updatedAt: Date.now() };
    writeLocalSyncStore(store);
    saveSyncId(id);
    return { id, wallets };
  }

  const res = await apiPut(id, wallets); // { id, wallets? }
  saveSyncId(id);
  return { id, wallets: wallets.length ? wallets : res.wallets || [] };
}

/** Load portfolio by ID but DO NOT auto-write local wallets (UI may decide). Returns { id, wallets } */
export async function loadPortfolio(id) {
  if (!id) throw new Error("loadPortfolio: missing id");

  if (!API) {
    const entry = readLocalSyncStore()[id];
    if (!entry || !Array.isArray(entry.wallets))
      throw new Error("No data found for that ID (local dev store).");
    return { id, wallets: entry.wallets };
  }

  const res = await apiGet(id); // { id?, wallets }
  return { id, wallets: Array.isArray(res.wallets) ? res.wallets : [] };
}

/* -------------------------- (optional) handy global for console tests -------------------------- */
if (typeof window !== "undefined") {
  // Call __sync.importPortfolio('YOURID') from DevTools anywhere
  window.__sync = {
    readLocalWallets,
    writeLocalWallets,
    saveSyncId,
    getSyncId,
    clearSyncId,
    exportPortfolio,
    importPortfolio,
    createPortfolio,
    savePortfolio,
    loadPortfolio
  };
}
