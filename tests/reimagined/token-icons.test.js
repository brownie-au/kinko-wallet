import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tokenIconUrl, tokenInitials } from '../../src/reimagined/tokenIcons.js';
import { tokenIconSource, readTokenIcon } from '../../src/server/tokenIconSource.js';
import handler from '../../api/token-icon.js';
import { HEX_ADDRESS } from '../../src/reimagined/networks.js';

const unknown = '0x1111111111111111111111111111111111111111';
test('icons distinguish native assets, contracts, networks and ticker impersonation', () => {
  for (const chain of ['eth', 'pulse', 'base', 'bsc', 'polygon']) {
    assert.match(tokenIconUrl(chain, null), /^\/assets\/tokens\/.*\.png$/);
    assert.equal(tokenIconUrl(chain, undefined), null);
    assert.equal(tokenIconUrl(chain, ''), null);
    assert.equal(tokenIconUrl(chain, 'https://evil.test/icon.png'), null);
    assert.match(tokenIconUrl(chain, unknown), new RegExp(`chain=${chain}&address=${unknown}$`));
  }
  assert.equal(tokenIconUrl('base', null), tokenIconUrl('eth', null));
  assert.equal(tokenIconUrl('eth', HEX_ADDRESS.toUpperCase().replace('0X', '0x')), '/assets/tokens/hex.png');
  assert.equal(tokenIconUrl('pulse', HEX_ADDRESS), '/assets/tokens/hex.png');
  assert.match(tokenIconUrl('base', HEX_ADDRESS), /^\/api\/token-icon/);
  assert.equal(tokenIconUrl('__proto__', null), null);
  assert.equal(tokenIconUrl('solana', unknown), null);
  assert.equal(tokenInitials('HEX'), 'HE');
  assert.equal(tokenInitials(''), '?');
});

test('upstream URLs are restricted and use case-sensitive checksum folders', () => {
  assert.equal(tokenIconSource('pulse', HEX_ADDRESS), 'https://raw.githubusercontent.com/PLS369/pulsechain-assets/main/blockchain/pulsechain/assets/0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39/logo.png');
  assert.match(tokenIconSource('bsc', unknown), /\/smartchain\/assets\//);
  for (const chain of ['eth', 'base', 'polygon']) assert.match(tokenIconSource(chain, unknown), /trustwallet\/assets/);
  assert.equal(tokenIconSource('__proto__', unknown), null);
  assert.equal(tokenIconSource('eth', '../logo.png'), null);
});

test('bundled source images are valid bounded PNGs', async () => {
  for (const name of ['ethereum', 'bnb', 'polygon', 'pulsechain', 'hex', 'pulsex', 'inc', 'usdc']) {
    const bytes = await readFile(new URL(`../../public/assets/tokens/${name}.png`, import.meta.url));
    assert.deepEqual(await readTokenIcon(new Response(bytes, { headers: { 'content-type': 'image/png' } })), bytes);
  }
});

const request = (chain, address = unknown, method = 'GET') => ({ method, url: `/api/token-icon?chain=${chain}&address=${address}` });
async function invoke(req) {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(body) { this.body = body; } };
  await handler(req, res);
  return res;
}
test('image endpoint caches/coalesces successful and missing lookups, rejects unsafe input, and handles provider failures', async () => {
  const original = global.fetch;
  let reads = 0;
  const bytes = await readFile(new URL('../../public/assets/tokens/ethereum.png', import.meta.url));
  global.fetch = async () => { reads++; return new Response(bytes, { headers: { 'content-type': 'image/png' } }); };
  try {
    const [a, b] = await Promise.all([invoke(request('eth')), invoke(request('eth'))]);
    assert.equal(reads, 1);
    assert.equal(a.statusCode, 200);
    assert.deepEqual(a.body, bytes);
    assert.equal(b.headers['Content-Type'], 'image/png');
    assert.match(a.headers['Cache-Control'], /s-maxage=604800/);
    assert.equal((await invoke(request('eth', unknown, 'HEAD'))).body, undefined);
    assert.equal((await invoke(request('eth', unknown, 'POST'))).statusCode, 405);
    assert.equal((await invoke(request('bad'))).statusCode, 400);
    assert.equal((await invoke(request('eth', 'https://evil.test'))).statusCode, 400);
    global.fetch = async () => { reads++; return new Response(null, { status: 404 }); };
    await invoke(request('base')); await invoke(request('base'));
    assert.equal(reads, 2, 'missing icons should be cached');
    assert.equal((await invoke(request('base'))).statusCode, 404);
    global.fetch = async () => new Response('<html>Error</html>', { headers: { 'content-type': 'image/png' } });
    const invalid = await invoke(request('polygon'));
    assert.equal(invalid.statusCode, 503);
    assert.equal(invalid.headers['Cache-Control'], 'no-store');
    global.fetch = async () => { throw new Error('timeout'); };
    assert.equal((await invoke(request('bsc'))).statusCode, 503);
    await assert.rejects(readTokenIcon(new Response(new Uint8Array(524289), { headers: { 'content-type': 'image/png' } })), /too large/);
  } finally { global.fetch = original; }
});
