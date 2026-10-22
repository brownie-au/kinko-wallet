import test from 'node:test';
import assert from 'node:assert/strict';
import { createVaultHandler, UPDATE_SCRIPT, DELETE_SCRIPT } from '../../api/vault.js';
import { deriveAccess, generateAccessKey, encryptWatchlist, decryptWatchlist } from '../../src/reimagined/crypto.js';
const memory = () => {
  const map = new Map();
  const commands = [];
  return {
    map,
    commands,
    store: async (a) => {
      commands.push(a);
      const [cmd, key, ...args] = a;
      if (cmd === 'INCR') {
        const n = (map.get(key) || 0) + 1;
        map.set(key, n);
        return n;
      }
      if (cmd === 'EXPIRE') return 1;
      if (cmd === 'GET') return map.get(key) || null;
      if (cmd === 'SET') {
        if (args.includes('NX') && map.has(key)) return null;
        map.set(key, args[0]);
        return 'OK';
      }
      if (cmd === 'EVAL') {
        const [script, , recordKey, verifier, revision, next] = a.slice(1);
        const raw = map.get(recordKey);
        if (!raw) return -1;
        const r = JSON.parse(raw);
        if (r.verifier !== verifier) return -2;
        if (r.revision !== Number(revision)) return -3;
        if (script === DELETE_SCRIPT) map.delete(recordKey);
        else {
          assert.equal(script, UPDATE_SCRIPT);
          map.set(recordKey, next);
        }
        return 1;
      }
      throw new Error('unsupported');
    }
  };
};
const invoke = async (h, method, access, body, headers = {}) => {
  let output;
  const res = {
    setHeader() {},
    end(raw) {
      output = JSON.parse(raw);
    }
  };
  await h(
    { method, headers: { host: 'kinko.test', 'x-kinko-account': access.id, authorization: `Bearer ${access.auth}`, ...headers }, body },
    res
  );
  return { status: res.statusCode, data: output };
};
test('independent clients create, restore, update, conflict, and delete an encrypted cloud record', async () => {
  const db = memory(),
    h = createVaultHandler(db.store);
  const key = generateAccessKey();
  const a = await deriveAccess(key),
    b = await deriveAccess(key);
  const data = { version: 1, wallets: [{ address: '0x' + '1'.repeat(40), name: 'Saved on desktop', networks: ['pulse'] }] };
  let r = await invoke(h, 'POST', a, { envelope: await encryptWatchlist(a, data) });
  assert.equal(r.status, 201);
  assert.equal(r.data.revision, 1);
  assert.equal((await invoke(h, 'POST', a, { envelope: await encryptWatchlist(a, data) })).status, 409);
  r = await invoke(h, 'GET', b);
  assert.equal(r.status, 200);
  assert.deepEqual(await decryptWatchlist(b, r.data.envelope), data);
  const changed = { ...data, wallets: [{ ...data.wallets[0], name: 'Renamed on phone' }] };
  assert.equal((await invoke(h, 'PUT', b, { revision: 1, envelope: await encryptWatchlist(b, changed) })).status, 200);
  assert.equal((await invoke(h, 'PUT', a, { revision: 1, envelope: await encryptWatchlist(a, data) })).status, 409);
  r = await invoke(h, 'GET', a);
  assert.deepEqual(await decryptWatchlist(a, r.data.envelope), changed);
  const record = db.map.get(`kinko:vault:v1:${a.id}`);
  assert.ok(!record.includes(changed.wallets[0].address));
  assert.ok(!record.includes('Renamed'));
  assert.ok(!record.includes(a.auth));
  assert.ok(!record.includes(key));
  assert.equal((await invoke(h, 'DELETE', a, { revision: 1 })).status, 409);
  assert.equal((await invoke(h, 'DELETE', a, { revision: 2 })).status, 200);
  assert.equal((await invoke(h, 'GET', a)).status, 404);
});
test('knowing the public identifier does not authorize reads, writes or deletion', async () => {
  const db = memory(),
    h = createVaultHandler(db.store),
    a = await deriveAccess(generateAccessKey());
  const envelope = await encryptWatchlist(a, { wallets: [] });
  await invoke(h, 'POST', a, { envelope });
  const wrong = { id: a.id, auth: '0'.repeat(64) };
  assert.equal((await invoke(h, 'GET', wrong)).status, 401);
  assert.equal((await invoke(h, 'PUT', wrong, { revision: 1, envelope })).status, 401);
  assert.equal((await invoke(h, 'DELETE', wrong, { revision: 1 })).status, 401);
  assert.equal((await invoke(h, 'PUT', a, { revision: 1, envelope }, { origin: 'https://attacker.test' })).status, 403);
  assert.equal((await invoke(h, 'POST', a, { envelope: { version: 1, iv: 'bad', ciphertext: 'plaintext' } })).status, 400);
});
test('storage outage fails closed and malformed requests never write', async () => {
  const a = await deriveAccess(generateAccessKey());
  const h = createVaultHandler(async () => {
    throw Error('secret credential must not leak');
  });
  const r = await invoke(h, 'GET', a);
  assert.equal(r.status, 503);
  assert.ok(!JSON.stringify(r).includes('secret credential'));
  assert.equal((await invoke(h, 'GET', { id: 'bad', auth: a.auth })).status, 401);
});
