import test from 'node:test';
import assert from 'node:assert/strict';
import { generateAccessKey, deriveAccess, encryptWatchlist, decryptWatchlist, normalizeKey } from '../../src/reimagined/crypto.js';
import { blankWatchlist, validateWatchlist, saveVault, readVault } from '../../src/reimagined/vault.js';
const wallet = { address: '0x' + '1'.repeat(40), name: 'Private family holdings', networks: ['pulse', 'eth'] };
test('256-bit keys are unique, prefixed and reject raw cryptocurrency private keys and seed phrases', () => {
  const keys = new Set(Array.from({ length: 100 }, generateAccessKey));
  assert.equal(keys.size, 100);
  for (const key of keys) {
    assert.match(key, /^KINKO-(?:[0-9A-F]{8}-){7}[0-9A-F]{8}$/);
    assert.equal(key.replaceAll('-', '').slice(5).length, 64);
  }
  assert.throws(() => normalizeKey('a'.repeat(64)), /Never enter/);
  assert.throws(() => normalizeKey('apple '.repeat(12)), /Never enter/);
});
test('independent key derivation restores encrypted data, with domain-separated credentials', async () => {
  const key = generateAccessKey();
  const a = await deriveAccess(key),
    b = await deriveAccess(key.toLowerCase());
  assert.equal(a.id, b.id);
  assert.equal(a.auth, b.auth);
  assert.notEqual(a.id, a.auth);
  assert.equal(a.encryptionKey.extractable, false);
  const data = { ...blankWatchlist(), wallets: [wallet], currency: 'AUD', tokens: [{ chain: 'pulse', address: '0x' + '2'.repeat(40) }] };
  const one = await encryptWatchlist(a, data),
    two = await encryptWatchlist(a, data);
  assert.notEqual(one.iv, two.iv);
  assert.notEqual(one.ciphertext, two.ciphertext);
  assert.equal(Buffer.from(one.iv, 'base64').length, 12);
  assert.equal(JSON.stringify(one).includes(wallet.name), false);
  assert.equal(JSON.stringify(one).includes(wallet.address), false);
  assert.deepEqual(await decryptWatchlist(b, one), data);
  await assert.rejects(decryptWatchlist(await deriveAccess(generateAccessKey()), one), /cannot unlock/);
  const corrupt = { ...one, ciphertext: 'A' + one.ciphertext.slice(1) };
  if (corrupt.ciphertext !== one.ciphertext) await assert.rejects(decryptWatchlist(a, corrupt), /cannot unlock/);
  await assert.rejects(decryptWatchlist({ ...a, id: '0'.repeat(64) }, one), /cannot unlock/);
});
test('client network payload contains only ciphertext and separate auth, never raw key or watchlist', async () => {
  const original = globalThis.fetch;
  const key = generateAccessKey(),
    access = await deriveAccess(key);
  const data = validateWatchlist({ ...blankWatchlist(), wallets: [wallet] });
  let captured;
  try {
    globalThis.fetch = async (url, options) => {
      captured = { url, ...options };
      return { ok: true, json: async () => ({ revision: 2 }) };
    };
    await saveVault(access, data, 1);
    const wire = JSON.stringify(captured);
    assert.ok(!wire.includes(key));
    assert.ok(!wire.includes(wallet.address));
    assert.ok(!wire.includes(wallet.name));
    assert.equal(captured.headers.Authorization, `Bearer ${access.auth}`);
    assert.equal(captured.headers['X-Kinko-Account'], access.id);
    assert.equal(JSON.parse(captured.body).revision, 1);
    const env = await encryptWatchlist(access, data);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ revision: 2, envelope: env }) });
    assert.deepEqual((await readVault(await deriveAccess(key))).data, data);
  } finally {
    globalThis.fetch = original;
  }
});
test('watchlist schema validates tokens, network selection and imported wallet records', () => {
  const d = validateWatchlist({
    ...blankWatchlist(),
    wallets: [wallet, wallet],
    tokens: [{ chain: 'pulse', address: '0x' + 'a'.repeat(40) }]
  });
  assert.equal(d.wallets.length, 1);
  assert.equal(d.tokens.length, 1);
  assert.throws(() => validateWatchlist({ ...d, wallets: [{ address: 'bad' }] }), /invalid public/);
  assert.throws(() => validateWatchlist({ ...d, tokens: [{ chain: 'fake', address: wallet.address }] }), /Invalid custom/);
});
