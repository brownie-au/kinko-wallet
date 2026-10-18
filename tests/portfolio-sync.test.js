import test from 'node:test';
import assert from 'node:assert/strict';
import { loadById, createPortfolio, isValidPid } from '../src/services/syncService.js';
const address = '0x' + 'a'.repeat(40);
test('Portfolio ID restore preserves all wallet fields and never falls back on missing or malformed data', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  const wallets = [{ address, name: 'Hidden wallet', hidden: true, networks: ['pulse'] }];
  try {
    globalThis.fetch = async () => {
      calls++;
      return new Response(JSON.stringify({ wallets }), { headers: { 'content-type': 'application/json' } });
    };
    assert.deepEqual((await loadById(' abcdefgh ')).wallets, wallets);
    assert.equal(isValidPid('ABCDEF'), true);
    await assert.rejects(loadById('invalid!'), /valid Portfolio ID/);
    assert.equal(calls, 1);
    globalThis.fetch = async () => {
      calls++;
      return new Response(JSON.stringify({ error: 'Portfolio not found' }), { status: 404 });
    };
    await assert.rejects(loadById('ABCDEFGH'), /Portfolio not found/);
    assert.equal(calls, 2, '404 must not trigger a second request to a SPA route');
    for (const body of ['{}', '{"wallets":[{"address":"broken"}]}']) {
      globalThis.fetch = async () => new Response(body, { headers: { 'content-type': 'application/json' } });
      await assert.rejects(loadById('ABCDEFGH'));
    }
    globalThis.fetch = async () => new Response('<html>App</html>', { headers: { 'content-type': 'text/html' } });
    await assert.rejects(loadById('ABCDEFGH'), /invalid response/);
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Portfolio sync unavailable' }), { status: 503 });
    await assert.rejects(createPortfolio(wallets), /Portfolio sync unavailable/);
  } finally {
    globalThis.fetch = original;
  }
});
