import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../api/data.js';
import { indexedDiscovery } from '../../src/server/tokenDiscovery.js';
const address = n => `0x${n.toString(16).padStart(40, '0')}`;
const ok = data => ({ ok: true, json: async () => data });

test('API discovery routing on Base, Polygon and BNB distinguishes configuration, access failure and successful discovery', async () => {
  const originalFetch = global.fetch, originalKey = process.env.ALCHEMY_API_KEY;
  try {
    let id = 5000;
    for (const [chain, chainId, host] of [['base', '0x2105', 'base-mainnet'], ['polygon', '0x89', 'polygon-mainnet'], ['bsc', '0x38', 'bnb-mainnet']]) {
      for (const mode of ['missing', 'blank', 'http403', 'rpc403', 'success']) {
        const wallet = address(id++), contract = address(id++), calls = [];
        if (mode === 'missing') delete process.env.ALCHEMY_API_KEY;
        else process.env.ALCHEMY_API_KEY = mode === 'blank' ? '  ' : '  routing-test-secret  ';
        global.fetch = async (url, opts) => {
          assert.ok(!url.includes('blockscout'), 'must not switch to an explorer on these networks');
          if (url.includes('alchemy.com')) {
            assert.equal(url, `https://${host}.g.alchemy.com/v2/routing-test-secret`);
            assert.equal(opts.redirect, 'error');
            const req = JSON.parse(opts.body); calls.push(req.method);
            if (mode === 'http403') return { ok: false, status: 403 };
            if (mode === 'rpc403') return ok({ error: { code: 403, message: 'DO NOT FORWARD routing-test-secret' } });
            return ok({ result: req.method === 'eth_chainId' ? chainId : req.method === 'alchemy_getTokenMetadata'
              ? { name: 'Test', symbol: 'TEST', decimals: 6 }
              : { address: wallet, tokenBalances: [{ contractAddress: contract, tokenBalance: '0x12d687' }] } });
          }
          if (opts?.body) {
            const req = JSON.parse(opts.body);
            return ok({ result: req.method === 'eth_chainId' ? chainId : req.method === 'eth_blockNumber' ? '0x123' : '0xde0b6b3a7640000' });
          }
          return ok(url.includes('dexscreener') ? [] : { coins: {} });
        };
        let body;
        const res = { setHeader() {}, end(raw) { body = JSON.parse(raw); } };
        await handler({ method: 'POST', headers: { 'x-forwarded-for': 'routing-test' }, body: { action: 'holdings', chain, address: wallet } }, res);
        assert.equal(res.statusCode, 200);
        assert.equal(body.rows.find(r => r.address === null).amountExact, '1');
        assert.ok(!JSON.stringify(body).includes('routing-test-secret'));
        assert.ok(!JSON.stringify(body).includes('alchemy.com'));
        if (mode === 'missing' || mode === 'blank') {
          assert.equal(calls.length, 0);
          assert.equal(body.discoveryProvider, 'unconfigured');
          assert.equal(body.discovery, 'unavailable');
          assert.equal(body.notices[0].code, 'discovery-configuration');
        } else {
          assert.equal(body.discoveryProvider, 'alchemy-token-api');
          if (mode === 'success') {
            assert.equal(body.discovery, 'complete');
            assert.equal(body.notices.length, 0);
            assert.equal(body.rows.find(r => r.address === contract).amountExact, '1.234567');
            assert.equal(body.rows.find(r => r.address === contract).wallet, wallet);
            assert.equal(body.rows.find(r => r.address === contract).chain, chain);
          } else {
            assert.equal(calls.length, 1, 'access rejection must not retry endlessly');
            assert.equal(body.discovery, 'unavailable');
            assert.match(body.notices[0].message, /rejected access/);
          }
        }
      }
    }
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.ALCHEMY_API_KEY;
    else process.env.ALCHEMY_API_KEY = originalKey;
  }
});

test('failed Portfolio network under HTTP 200 falls back to the working Token API without stale failure notices', async () => {
  const originalFetch = global.fetch, wallet = address(6000);
  let portfolioCalls = 0;
  global.fetch = async (url, opts) => {
    if (url.includes('/assets/tokens/by-address')) {
      portfolioCalls++;
      return ok({ data: { tokens: [] }, error: { partialErrors: [{ network: 'base-mainnet', message: 'upstream failure' }] } });
    }
    const req = JSON.parse(opts.body);
    return ok({ result: req.method === 'eth_chainId' ? '0x2105' : req.method === 'alchemy_getTokenMetadata'
      ? { decimals: 6, symbol: 'GOOD', name: 'Good token' }
      : { address: wallet, tokenBalances: Array.from({ length: 30 }, (_, i) => ({ contractAddress: address(6100 + i), tokenBalance: '0x12d687' })) } });
  };
  try {
    const result = await indexedDiscovery('base', wallet, 'test-only-key');
    assert.equal(portfolioCalls, 1);
    assert.equal(result.provider, 'alchemy-token-api');
    assert.equal(result.status, 'complete');
    assert.equal(result.tokens.length, 30);
    assert.ok(result.tokens.every(t => t.amountExact === '1.234567'));
    assert.deepEqual(result.notices, []);
  } finally { global.fetch = originalFetch; }
});
