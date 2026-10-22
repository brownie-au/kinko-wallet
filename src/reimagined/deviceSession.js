import { sealDeviceAccess, unsealDeviceAccess, decryptWatchlist } from './crypto.js';
import { readVault, validateWatchlist } from './vault.js';
export const SESSION_STORAGE_KEY = 'kinko:authentication:v1';
export const LOGOUT_STORAGE_KEY = 'kinko:logout:v1';
const DB_NAME = 'kinko-device-authentication';
const STORE = 'authentication';
const RECORD = 'device';

// IndexedDB structured-clones the CryptoKey without exporting its raw bytes.
function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onerror = () => reject(new Error('Secure browser storage is unavailable.'));
    request.onblocked = () => reject(new Error('Secure browser storage is blocked. Close other Kinko tabs and try again.'));
    request.onsuccess = () => resolve(request.result);
  });
}
async function recordOperation(action, value) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, action === 'get' ? 'readonly' : 'readwrite');
      const store = tx.objectStore(STORE);
      const request = action === 'get' ? store.get(RECORD) : action === 'put' ? store.put(value, RECORD) : store.delete(RECORD);
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () => reject(new Error('Secure browser storage could not be updated.'));
    });
  } finally {
    db.close();
  }
}
export const browserAuthStore = {
  get: () => recordOperation('get'),
  put: (value) => recordOperation('put', value),
  delete: () => recordOperation('delete')
};

// Resolve Web Storage lazily: a blocked getter must not prevent IndexedDB logout cleanup.
const storageFacade = (name) => ({
  getItem: (key) => globalThis[name].getItem(key),
  setItem: (key, value) => globalThis[name].setItem(key, value),
  removeItem: (key) => globalThis[name].removeItem(key)
});
// Dependencies are injectable for lifecycle tests; the production defaults use real browser APIs.
export function createDeviceSessions({
  store = browserAuthStore,
  session = storageFacade('sessionStorage'),
  local = storageFacade('localStorage')
} = {}) {
  const stamp = () => local.getItem(LOGOUT_STORAGE_KEY) || '';
  async function clear() {
    let revoked = false;
    try {
      local.setItem(LOGOUT_STORAGE_KEY, crypto.randomUUID());
      revoked = true;
    } catch {}
    try {
      session.removeItem(SESSION_STORAGE_KEY);
    } catch {}
    try {
      await store.delete();
      revoked = true;
    } catch {}
    if (!revoked) throw new Error('The browser blocked removal of saved authentication. Clear site data before leaving a shared device.');
  }
  return {
    async save(accessKey, remember, mode = 'cloud') {
      const startedAt = stamp();
      const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      const envelope = await sealDeviceAccess(accessKey, key, mode);
      if (stamp() !== startedAt)
        throw Object.assign(new Error('Sign-in was cancelled by a logout on this device.'), { code: 'SESSION_CANCELLED' });
      const generation = crypto.randomUUID();
      const record = { version: 1, key, generation, stamp: startedAt, ...(remember ? { envelope } : {}) };
      await store.put(record);
      if (stamp() !== startedAt) {
        await store.delete();
        throw Object.assign(new Error('Sign-in was cancelled by a logout on this device.'), { code: 'SESSION_CANCELLED' });
      }
      // A session-only capsule lives only in the current tab session, never IndexedDB.
      if (remember) session.removeItem(SESSION_STORAGE_KEY);
      else {
        try {
          session.setItem(SESSION_STORAGE_KEY, JSON.stringify({ version: 1, envelope, generation, stamp: startedAt }));
        } catch (error) {
          await store.delete();
          throw error;
        }
      }
    },
    async restore() {
      const startedAt = stamp();
      const record = await store.get();
      if (!record || record.version !== 1 || record.stamp !== startedAt) return null;
      const raw = session.getItem(SESSION_STORAGE_KEY);
      const tab = raw ? JSON.parse(raw) : null;
      const envelope = tab?.stamp === startedAt && tab?.generation === record.generation ? tab.envelope : record.envelope;
      if (!envelope) return null;
      const restored = await unsealDeviceAccess(envelope, record.key);
      if (stamp() !== startedAt) return null;
      return { ...restored, remembered: !!record.envelope };
    },
    clear
  };
}

// Used after account deletion as well as explicit logout. Never touches the vault backup.
export function forgetDeviceAccess() {
  return createDeviceSessions().clear();
}

export async function resumeWatchlist(saved, { read = readVault, local = globalThis.localStorage } = {}) {
  if (saved.mode === 'cloud') {
    try {
      return { ...(await read(saved.access)), mode: 'cloud' };
    } catch (error) {
      // Missing/rejected accounts must not silently restore a local copy.
      if (error.status === 401 || error.status === 404) throw error;
    }
  }
  const cached = JSON.parse(local.getItem(`kinko:vault:${saved.access.id}`) || 'null');
  if (!cached)
    throw new Error('Saved access is available, but your watchlist cannot be loaded. Try again online or enter your Access Key.');
  return { data: validateWatchlist(await decryptWatchlist(saved.access, cached.envelope)), revision: cached.revision, mode: 'local' };
}
