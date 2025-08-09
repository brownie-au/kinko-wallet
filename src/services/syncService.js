// src/services/syncService.js
// Works with a backend if VITE_SYNC_API_BASE is set,
// otherwise falls back to localStorage-only (great for prod if API is down).

const API = (import.meta.env.VITE_SYNC_API_BASE || "").trim();

/* ------------ local wallet helpers ------------ */
export function readLocalWallets() {
  try { return JSON.parse(localStorage.getItem("wallets") || "[]"); }
  catch { return []; }
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
const LOCAL_SYNC_KEY = "kinko:sync:store";
function readLocalSyncStore() {
  try { return JSON.parse(localStorage.getItem(LOCAL_SYNC_KEY) || "{}"); }
  catch { return {}; }
}
function writeLocalSyncStore(store) {
  localStorage.setItem(LOCAL_SYNC_KEY, JSON.stringify(store || {}));
}
function genId(len = 8) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => (b % 36).toString(36)).join("").toUpperCase();
}

/* -------------------------- API helpers -------------------------- */
function ensureJsonResponse(r) {
  const ct = (r.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("application/json")) {
    throw new Error(`API non-JSON (${r.status})`);
  }
}
async function apiGet(id) {
  const url = `${API.replace(/\/$/, "")}/portfolios/${encodeURIComponent(id)}`;
  const r = await fetch(url, { method: "GET" });
  if (!r.ok) throw new Error(`API ${r.status}`);
  ensureJsonResponse(r);
  return r.json(); // { id, wallets }
}
async function apiPut(id, wallets) {
  const url = `${API.replace(/\/$/, "")}/portfolios/${encodeURIComponent(id)}`;
  const r = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallets })
  });
  if (!r.ok) throw new Error(`API ${r.status}`);
  ensureJsonResponse(r);
  return r.json(); // { id, wallets }
}
async function apiCreate(wallets) {
  const url = `${API.replace(/\/$/, "")}/portfolios`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallets })
  });
  if (!r.ok) throw new Error(`API ${r.status}`);
  ensureJsonResponse(r);
  return r.json(); // { id, wallets }
}

/* -------------------------- local ops -------------------------- */
function localExport(existingId = "") {
  const wallets = readLocalWallets();
  const store = readLocalSyncStore();
  const id = existingId || genId();
  store[id] = { wallets, updatedAt: Date.now() };
  writeLocalSyncStore(store);
  saveSyncId(id);
  return { id, wallets, count: wallets.length };
}
function localImport(id) {
  const store = readLocalSyncStore();
  const entry = store[id];
  if (!entry || !Array.isArray(entry.wallets)) {
    throw new Error("No data found for that ID (local store).");
  }
  writeLocalWallets(entry.wallets);
  saveSyncId(id);
  return { id, wallets: entry.wallets, count: entry.wallets.length };
}

/* -------------------------- public: core ops -------------------------- */
export async function exportPortfolio() {
  const wallets = readLocalWallets();

  if (!API) {
    const res = localExport(getSyncId());
    return { ok: true, id: res.id, count: res.count, backend: false };
  }

  try {
    const existing = getSyncId();
    if (existing) {
      await apiPut(existing, wallets);
      return { ok: true, id: existing, count: wallets.length, backend: true };
    }
    const res = await apiCreate(wallets);
    const id = res.id || genId();
    saveSyncId(id);
    return { ok: true, id, count: wallets.length, backend: true };
  } catch {
    const res = localExport(getSyncId());
    return { ok: true, id: res.id, count: res.count, backend: false };
  }
}

export async function importPortfolio(id) {
  if (!id || typeof id !== "string") throw new Error("importPortfolio: invalid ID");

  if (!API) {
    const res = localImport(id);
    return { ok: true, id: res.id, count: res.count, backend: false };
  }

  try {
    const res = await apiGet(id);
    const wallets = Array.isArray(res.wallets) ? res.wallets : [];
    writeLocalWallets(wallets);
    saveSyncId(id);
    return { ok: true, id, count: wallets.length, backend: true };
  } catch {
    const res = localImport(id);
    return { ok: true, id: res.id, count: res.count, backend: false };
  }
}

/* -------------------------- public: UI-friendly wrappers -------------------------- */
export async function createPortfolio() {
  const wallets = readLocalWallets();

  if (!API) {
    const { id } = localExport("");
    return { id, wallets };
  }

  try {
    const res = await apiCreate(wallets);
    const id = res.id || genId();
    saveSyncId(id);
    return { id, wallets };
  } catch {
    const { id } = localExport("");
    return { id, wallets };
  }
}

export async function savePortfolio(id) {
  if (!id) throw new Error("savePortfolio: missing id");
  const wallets = readLocalWallets();

  if (!API) {
    const { id: saved } = localExport(id);
    return { id: saved, wallets };
  }

  try {
    await apiPut(id, wallets);
    saveSyncId(id);
    return { id, wallets };
  } catch {
    const { id: saved } = localExport(id);
    return { id: saved, wallets };
  }
}

export async function loadPortfolio(id) {
  if (!id) throw new Error("loadPortfolio: missing id");

  if (!API) {
    const store = readLocalSyncStore();
    const entry = store[id];
    if (!entry || !Array.isArray(entry.wallets)) throw new Error("No data found for that ID (local store).");
    return { id, wallets: entry.wallets };
  }

  try {
    const res = await apiGet(id);
    return { id, wallets: Array.isArray(res.wallets) ? res.wallets : [] };
  } catch {
    const store = readLocalSyncStore();
    const entry = store[id];
    if (!entry || !Array.isArray(entry.wallets)) throw new Error("No data found for that ID (local store).");
    return { id, wallets: entry.wallets };
  }
}

/* -------------------------- debug console -------------------------- */
if (typeof window !== "undefined") {
  window.__sync = {
    readLocalWallets, writeLocalWallets,
    saveSyncId, getSyncId, clearSyncId,
    exportPortfolio, importPortfolio, createPortfolio, savePortfolio, loadPortfolio
  };
}
