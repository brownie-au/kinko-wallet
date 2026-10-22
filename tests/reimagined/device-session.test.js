import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import {
  createDeviceSessions,
  browserAuthStore,
  SESSION_STORAGE_KEY,
  LOGOUT_STORAGE_KEY,
  resumeWatchlist
} from '../../src/reimagined/deviceSession.js';
import { generateAccessKey, deriveAccess, encryptWatchlist, decryptWatchlist } from '../../src/reimagined/crypto.js';
import { blankWatchlist } from '../../src/reimagined/vault.js';
const memoryStorage = () => {
  const values = new Map();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
};
const browser = () => {
  globalThis.indexedDB = new IDBFactory();
  const session = memoryStorage(),
    local = memoryStorage();
  return { session, local, sessions: createDeviceSessions({ session, local }) };
};
const savedData = () => ({
  ...blankWatchlist(),
  wallets: [{ address: '0x' + '1'.repeat(40), name: 'Private reserve', hidden: false, networks: ['pulse', 'eth'] }]
});

test('unchecked login survives refresh but a new browser session cannot restore it', async () => {
  const { sessions, session, local } = browser();
  const key = generateAccessKey();
  await sessions.save(key, false);
  const restored = await createDeviceSessions({ session, local }).restore();
  assert.equal(restored.remembered, false);
  assert.equal(restored.access.id, (await deriveAccess(key)).id);
  assert.equal(restored.access.encryptionKey.extractable, false);
  assert.ok(session.getItem(SESSION_STORAGE_KEY));
  assert.equal((await browserAuthStore.get()).envelope, undefined);
  assert.equal(await createDeviceSessions({ session: memoryStorage(), local }).restore(), null);
});

test('remembered login survives a new tab/browser session with no raw Access Key in storage', async () => {
  const { sessions, session, local } = browser();
  const key = generateAccessKey();
  const original = await deriveAccess(key);
  await sessions.save(key, true);
  assert.equal(session.getItem(SESSION_STORAGE_KEY), null);
  const stored = await browserAuthStore.get();
  assert.equal(stored.key.extractable, false);
  await assert.rejects(crypto.subtle.exportKey('raw', stored.key));
  const serialized = JSON.stringify(stored) + JSON.stringify([...session.values]) + JSON.stringify([...local.values]);
  for (const secret of [key, original.auth, original.id]) assert.ok(!serialized.includes(secret));
  const restored = await createDeviceSessions({ session: memoryStorage(), local }).restore();
  assert.equal(restored.remembered, true);
  const envelope = await encryptWatchlist(original, savedData());
  assert.deepEqual(await decryptWatchlist(restored.access, envelope), savedData());
});

test('an unchecked sign-in removes a previous remembered login', async () => {
  const { sessions, session, local } = browser();
  const first = generateAccessKey(),
    second = generateAccessKey();
  await sessions.save(first, true);
  await sessions.save(second, false);
  assert.equal((await sessions.restore()).access.id, (await deriveAccess(second)).id);
  assert.equal((await browserAuthStore.get()).envelope, undefined);
  assert.equal(await createDeviceSessions({ session: memoryStorage(), local }).restore(), null);
});

test('explicit logout clears session and durable authentication while retaining encrypted watchlist backups', async () => {
  const { sessions, session, local } = browser();
  const key = generateAccessKey();
  local.setItem('kinko:vault:backup', 'encrypted');
  for (const remember of [false, true]) {
    await sessions.save(key, remember);
    await sessions.clear();
    assert.equal(session.getItem(SESSION_STORAGE_KEY), null);
    assert.equal(await browserAuthStore.get(), undefined);
    assert.equal(await createDeviceSessions({ session: memoryStorage(), local }).restore(), null);
    assert.ok(local.getItem(LOGOUT_STORAGE_KEY));
  }
  assert.equal(local.getItem('kinko:vault:backup'), 'encrypted');
});

test('logout tombstone prevents future automatic login even when IndexedDB deletion is blocked', async () => {
  const { sessions, session, local } = browser();
  await sessions.save(generateAccessKey(), true);
  const blocked = createDeviceSessions({
    session,
    local,
    store: {
      ...browserAuthStore,
      delete: async () => {
        throw Error('blocked');
      }
    }
  });
  await blocked.clear();
  assert.ok(await browserAuthStore.get());
  assert.equal(await sessions.restore(), null);
});

test('corrupted remembered credentials fail closed and no plaintext fallback is used', async () => {
  const { sessions } = browser();
  await sessions.save(generateAccessKey(), true);
  const record = await browserAuthStore.get();
  record.envelope.ciphertext = 'AAAA';
  await browserAuthStore.put(record);
  await assert.rejects(sessions.restore(), /could not be unlocked/);
});

test('a logout during restore prevents a stale restore from completing', async () => {
  const { sessions, session, local } = browser();
  await sessions.save(generateAccessKey(), true);
  const record = await browserAuthStore.get();
  let release;
  const slow = createDeviceSessions({
    session,
    local,
    store: {
      ...browserAuthStore,
      get: () =>
        new Promise((resolve) => {
          release = () => resolve(record);
        })
    }
  });
  const restoring = slow.restore();
  await sessions.clear();
  release();
  assert.equal(await restoring, null);
});

test('a logout during credential storage cancels sign-in and removes the pending record', async () => {
  const { session, local } = browser();
  let release, entered;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const slow = createDeviceSessions({
    session,
    local,
    store: {
      ...browserAuthStore,
      put: async (r) => {
        await browserAuthStore.put(r);
        entered();
        await new Promise((resolve) => {
          release = resolve;
        });
      }
    }
  });
  const saving = slow.save(generateAccessKey(), true);
  await started;
  local.setItem(LOGOUT_STORAGE_KEY, crypto.randomUUID());
  release();
  await assert.rejects(saving, (error) => error.code === 'SESSION_CANCELLED');
  assert.equal(await browserAuthStore.get(), undefined);
});

test('blocked session storage rejects saving and does not leave persistent access behind', async () => {
  const { local } = browser();
  const session = {
    ...memoryStorage(),
    setItem: () => {
      throw Error('blocked');
    }
  };
  await assert.rejects(createDeviceSessions({ session, local }).save(generateAccessKey(), false), /blocked/);
  assert.equal(await browserAuthStore.get(), undefined);
});

test('automatic restore fetches current cloud state and handles offline/rejected accounts separately', async () => {
  const access = await deriveAccess(generateAccessKey()),
    local = memoryStorage();
  const data = savedData();
  local.setItem(`kinko:vault:${access.id}`, JSON.stringify({ revision: 2, envelope: await encryptWatchlist(access, data) }));
  const saved = { access, mode: 'cloud' };
  const latest = { ...data, currency: 'AUD' };
  const online = await resumeWatchlist(saved, { local, read: async () => ({ data: latest, revision: 3 }) });
  assert.equal(online.revision, 3);
  assert.equal(online.data.currency, 'AUD');
  assert.equal(online.mode, 'cloud');
  const offline = await resumeWatchlist(saved, {
    local,
    read: async () => {
      throw Object.assign(Error('offline'), { status: 503 });
    }
  });
  assert.equal(offline.mode, 'local');
  assert.deepEqual(offline.data, data);
  for (const status of [401, 404])
    await assert.rejects(
      resumeWatchlist(saved, {
        local,
        read: async () => {
          throw Object.assign(Error('rejected'), { status });
        }
      }),
      /rejected/
    );
});

test('a stale tab capsule cannot clear or replace a newer remembered login', async () => {
  const { sessions, session, local } = browser();
  await sessions.save(generateAccessKey(), false);
  const stale = session.getItem(SESSION_STORAGE_KEY);
  const secondKey = generateAccessKey();
  await sessions.save(secondKey, true);
  const oldTab = memoryStorage();
  oldTab.setItem(SESSION_STORAGE_KEY, stale);
  const restored = await createDeviceSessions({ session: oldTab, local }).restore();
  assert.equal(restored.access.id, (await deriveAccess(secondKey)).id);
  assert.equal(restored.remembered, true);
});

test('IndexedDB authentication is still deleted when Web Storage blocks logout writes', async () => {
  const { sessions } = browser();
  await sessions.save(generateAccessKey(), true);
  const blocked = {
    getItem() {
      throw Error('blocked');
    },
    setItem() {
      throw Error('blocked');
    },
    removeItem() {
      throw Error('blocked');
    }
  };
  await createDeviceSessions({ session: blocked, local: blocked }).clear();
  assert.equal(await browserAuthStore.get(), undefined);
});
