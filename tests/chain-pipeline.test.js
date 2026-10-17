import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);

test('balance pipeline retains exact native amounts, prices Base as ETH, preserves stale data and excludes non-selected chains', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kinko-pipeline-'));
  const originalFetch = globalThis.fetch,
    originalStorage = globalThis.localStorage;
  const memory = new Map();
  globalThis.localStorage = {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => memory.set(k, String(v)),
    removeItem: (k) => memory.delete(k),
    key: (i) => [...memory.keys()][i],
    get length() {
      return memory.size;
    }
  };
  const address = '0x' + 'a'.repeat(40),
    contract = '0x' + 'b'.repeat(40);
  let fail = false;
  const urls = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    urls.push(url);
    if (fail) throw new Error('Offline');
    let body;
    if (url.includes('token-balances'))
      body = [{ value: '1000001', token: { address_hash: contract, type: 'ERC-20', decimals: '6', symbol: 'USDC' } }];
    else if (url.includes('action=balance')) body = { status: '1', result: '1000000000000000001' };
    else body = { coins: { 'coingecko:ethereum': { price: 2000 }, ['base:' + contract]: { price: 1 } } };
    return { ok: true, json: async () => body };
  };
  try {
    const output = join(dir, 'portfolio.cjs');
    await build({
      entryPoints: ['src/services/portfolioAggService.js'],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      outfile: output,
      define: { 'import.meta.env': '{}' },
      logLevel: 'silent'
    });
    const { buildPortfolioDetailed } = require(output);
    const fresh = await buildPortfolioDetailed([{ address, networks: ['base'] }], { force: true });
    assert.equal(fresh.tokens.length, 2);
    assert.equal(fresh.issues.length, 0);
    assert.equal(fresh.totalExact, '2001.000001000000002');
    assert.equal(fresh.tokens.find((t) => !t.address).amountExact, '1.000000000000000001');
    assert.ok(urls.every((url) => !url.includes('coingecko%3Abase')));
    const count = urls.length;
    const cached = await buildPortfolioDetailed([{ address, networks: ['base'] }]);
    assert.equal(urls.length, count);
    assert.equal(cached.totalExact, fresh.totalExact);
    fail = true;
    const stale = await buildPortfolioDetailed([{ address, networks: ['base'] }], { force: true });
    assert.equal(stale.totalExact, fresh.totalExact);
    assert.ok(stale.partial);
    assert.ok(stale.tokens.every((t) => t.stale));
    assert.ok(stale.asOf <= fresh.asOf);
    const empty = await buildPortfolioDetailed([{ address, networks: ['pulse'] }], { only: 'base' });
    assert.equal(empty.tokens.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.localStorage = originalStorage;
    await rm(dir, { recursive: true, force: true });
  }
});
