// src/data/idb.js
// Tiny IndexedDB wrapper using `idb` for persistent SWR cache
import { openDB } from 'idb';

const DB_NAME = 'kinko-cache-v1';
const STORE = 'kv';

let dbPromise;
function db() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE)) {
          const s = d.createObjectStore(STORE, { keyPath: 'key' });
          s.createIndex('key', 'key', { unique: true });
          s.createIndex('updatedAt', 'updatedAt');
        }
      }
    });
  }
  return dbPromise;
}

export async function idbGet(key) {
  try {
    const d = await db();
    return (await d.get(STORE, key)) || null;
  } catch {
    return null;
  }
}

export async function idbSet(key, value) {
  try {
    const d = await db();
    const rec = { key, ...value, updatedAt: Date.now() };
    await d.put(STORE, rec);
    return rec;
  } catch {
    return null;
  }
}

export async function idbDel(key) {
  try {
    const d = await db();
    await d.delete(STORE, key);
  } catch { /* ignore */ }
}

export async function idbKeys(prefix = '') {
  const out = [];
  try {
    const d = await db();
    let cursor = await d.transaction(STORE).store.openCursor();
    while (cursor) {
      const k = String(cursor.key || '');
      if (!prefix || k.startsWith(prefix)) out.push(k);
      cursor = await cursor.continue();
    }
  } catch { /* ignore */ }
  return out;
}

