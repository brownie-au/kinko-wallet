// src/utils/txCache.js
// Lightweight IndexedDB cache for transaction snapshots and metadata.
// Uses the existing idb wrapper for consistency with the app cache.

import { idbGet, idbSet } from '../data/idb';

const SNAP_VER = 'v1';
const PRICE_VER = 'v1';

function normChain(chain) { return String(chain || '').toLowerCase(); }
function normAddr(addr) { return String(addr || '').toLowerCase(); }

function snapshotKey(chain, wallet, windowDays = 180) {
  const c = normChain(chain);
  const a = normAddr(wallet);
  const d = Number(windowDays || 180);
  return `kinko:tx:${SNAP_VER}:${c}:${a}:${d}d`;
}

function metaKey(chain, wallet) {
  const c = normChain(chain);
  const a = normAddr(wallet);
  return `kinko:txmeta:${SNAP_VER}:${c}:${a}`;
}

function priceKey(chain, tokenKey) {
  // tokenKey is 'native' or lowercased contract address
  return `kinko:price:${PRICE_VER}:${normChain(chain)}:${String(tokenKey || 'native').toLowerCase()}`;
}

export async function getSnapshot(chain, wallet, windowDays = 180) {
  try {
    const rec = await idbGet(snapshotKey(chain, wallet, windowDays));
    const rows = Array.isArray(rec?.payload?.rows) ? rec.payload.rows : [];
    return rows;
  } catch { return []; }
}

export async function putSnapshot(chain, wallet, rows, meta = null, windowDays = 180) {
  try {
    const key = snapshotKey(chain, wallet, windowDays);
    // persist rows only; TTL is not applied to snapshots (history data)
    await idbSet(key, { payload: { rows: Array.isArray(rows) ? rows : [] }, version: 1, ttlMs: 365 * 24 * 60 * 60 * 1000 });
    if (meta) await putMeta(chain, wallet, meta);
  } catch {}
}

export async function getMeta(chain, wallet) {
  try {
    const rec = await idbGet(metaKey(chain, wallet));
    const m = rec?.payload || null;
    return m ? { ...m } : null;
  } catch { return null; }
}

export async function putMeta(chain, wallet, meta) {
  try {
    const now = Date.now();
    const m = { ...(meta || {}), updatedAt: Number(meta?.updatedAt || now) };
    await idbSet(metaKey(chain, wallet), { payload: m, version: 1, ttlMs: 365 * 24 * 60 * 60 * 1000 });
    return m;
  } catch { return null; }
}

// Merge and normalize rows: dedupe by hash, newest first, keep within windowDays
export function mergeRows(existing, incoming, { windowDays = 180 } = {}) {
  const list = [];
  const seen = new Set();
  const add = (arr) => {
    for (const r of Array.isArray(arr) ? arr : []) {
      const h = String(r?.hash || '').toLowerCase();
      if (!h || seen.has(h)) continue;
      // ensure timestamp field
      let ts = Number(r?.timeStamp || 0);
      if (!ts && r?.date) {
        const t = Date.parse(r.date);
        ts = Number.isFinite(t) ? Math.floor(t / 1000) : 0;
      }
      const norm = { ...r, timeStamp: ts };
      seen.add(h);
      list.push(norm);
    }
  };
  add(incoming);
  add(existing);

  // sort desc by timeStamp
  list.sort((a, b) => (Number(b.timeStamp || 0) - Number(a.timeStamp || 0)) || (String(b.hash || '').localeCompare(String(a.hash || ''))));

  // prune to window
  const minMs = Date.now() - Number(windowDays || 180) * 24 * 60 * 60 * 1000;
  const pruned = list.filter((r) => {
    const ms = Number(r?.timeStamp || 0) * 1000;
    return Number.isFinite(ms) ? ms >= minMs : true;
  });

  return pruned;
}

// Lightweight price memo (in-memory + IDB TTL 10 min) for tokens/native
const MEM_TTL = 10 * 60 * 1000;
const memPrice = new Map(); // key -> { usd, t }

export async function getPriceCached(chain, tokenKey = 'native') {
  const k = priceKey(chain, tokenKey);
  const now = Date.now();
  const m = memPrice.get(k);
  if (m && (now - m.t) < MEM_TTL) return m.usd;
  try {
    const rec = await idbGet(k);
    const usd = Number(rec?.payload?.usd || 0);
    const at = Number(rec?.payload?.t || 0);
    if (usd > 0 && (now - at) < MEM_TTL) {
      memPrice.set(k, { usd, t: at });
      return usd;
    }
  } catch {}
  return 0;
}

export async function putPriceCached(chain, tokenKey = 'native', usd) {
  const k = priceKey(chain, tokenKey);
  const now = Date.now();
  const v = { usd: Number(usd || 0), t: now };
  memPrice.set(k, { usd: v.usd, t: now });
  try { await idbSet(k, { payload: v, version: 1, ttlMs: MEM_TTL }); } catch {}
}

