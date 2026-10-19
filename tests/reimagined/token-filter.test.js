import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spamReason, splitTokens } from '../../src/reimagined/tokenFilter.js';
import { portfolioDiscovery, indexedDiscovery } from '../../src/server/tokenDiscovery.js';
import { holdings } from '../../src/reimagined/blockchain.js';
import { validateWatchlist, blankWatchlist } from '../../src/reimagined/vault.js';
import { encryptWatchlist, decryptWatchlist, deriveAccess, generateAccessKey } from '../../src/reimagined/crypto.js';
const addr = (n) => `0x${n.toString(16).padStart(40, '0')}`;
const wallet = addr(1), contract = addr(2);
const ok = (data) => ({ ok: true, json: async () => data });
async function withFetch(mock, run) {
  const original = global.fetch; global.fetch = mock;
  try { await run(); } finally { global.fetch = original; }
}
test('claim-link and provider spam is filtered on every chain without classifying dust or unknown prices as spam', () => {
  for (const chain of ['eth', 'pulse', 'base', 'polygon', 'bsc']) {
    for (const name of ['Collect on: swap-based.com', 'Claim: toshi-thecat.com/?claim', 'USDC | t.me/s/US_CIRCLE | claim', 'Airdrop at: brett-tokenomics.com', 'Claim on: rewards.degen-gifts.com', 'Cl\u200baim: rewards.site']) {
      const result = splitTokens([{ chain, address: contract, name, priceUsd: null }]);
      assert.equal(result.visible.length, 0); assert.equal(result.filtered.length, 1);
    }
    const legit = [{ chain, address: contract, name: 'Unpriced community token', priceUsd: null }, { chain, address: addr(3), name: 'Crypto.com Coin', valueUsd: 0.00001 }, { chain, address: null, spam: true }];
    assert.equal(splitTokens(legit).visible.length, 3);
    assert.ok(spamReason({ is_spam: true }));
    assert.equal(splitTokens([{ ...legit[0], name: 'Claim rewards.site' }], [{ chain, address: contract }]).visible.length, 1);
    assert.equal(splitTokens(legit, [], [{ chain, address: contract }]).filtered.length, 1);
    assert.equal(splitTokens(legit, [], [{ chain: 'other', address: contract }]).filtered.length, 0);
  }
});
test('hidden contracts survive encrypted watchlist round trips with backward-compatible defaults', async () => {
  const data = validateWatchlist({ ...blankWatchlist(), hiddenTokens: [{ chain: 'base', address: contract }] });
  const access = await deriveAccess(generateAccessKey());
  const envelope = await encryptWatchlist(access, data);
  assert.ok(!JSON.stringify(envelope).includes(contract));
  assert.deepEqual(validateWatchlist(await decryptWatchlist(access, envelope)).hiddenTokens, data.hiddenTokens);
  assert.deepEqual(validateWatchlist({ version: 1, wallets: [] }).hiddenTokens, []);
  assert.throws(() => validateWatchlist({ ...data, hiddenTokens: [{ chain: 'wrong', address: contract }] }));
});
test('batched discovery filters hundreds of airdrops before individual metadata or pricing requests', async () => {
  let calls = 0;
  await withFetch(async (url, options) => {
    calls++; assert.match(url, /\/assets\/tokens\/by-address$/);
    const body = JSON.parse(options.body);
    assert.equal(body.withMetadata, true); assert.equal(body.withPrices, false);
    assert.equal(options.redirect, 'error');
    return ok({ data: { tokens: Array.from({ length: 101 }, (_, i) => ({ address: wallet, network: 'base-mainnet', tokenAddress: addr(i + 2), tokenBalance: '0x1', tokenMetadata: { name: i ? 'Claim at: scam.site' : 'Legitimate unpriced', symbol: 'TEST', decimals: 6 } })) } });
  }, async () => {
    const result = await portfolioDiscovery('base', wallet, 'test-only-key', AbortSignal.timeout(2000));
    assert.equal(calls, 1); assert.equal(result.tokens.length, 1); assert.equal(result.filtered.length, 100);
    assert.equal(result.tokens[0].amountExact, '0.000001'); assert.equal(result.status, 'complete');
    assert.equal(result.notices.length, 0); assert.ok(!JSON.stringify(result).includes('test-only-key'));
  });
});
test('Portfolio pages preserve partial reads and reject wrong-wallet, wrong-chain and invalid-precision records', async () => {
  let calls = 0;
  await withFetch(async () => ++calls === 1 ? ok({ data: { tokens: [
    { address: wallet, network: 'matic-mainnet', tokenAddress: contract, tokenBalance: '0x1', tokenMetadata: { decimals: 6, name: 'Real' } },
    { address: addr(99), network: 'matic-mainnet', tokenAddress: addr(3), tokenBalance: '0x1', tokenMetadata: { decimals: 6 } },
    { address: wallet, network: 'base-mainnet', tokenAddress: addr(4), tokenBalance: '0x1', tokenMetadata: { decimals: 6 } },
    { address: wallet, network: 'matic-mainnet', tokenAddress: addr(5), tokenBalance: '0x1', tokenMetadata: { decimals: null } }
  ], pageKey: 'next' } }) : { ok: false, status: 429 }, async () => {
    const result = await portfolioDiscovery('polygon', wallet, 'test', AbortSignal.timeout(2000));
    assert.equal(result.tokens.length, 1); assert.equal(result.status, 'partial');
    assert.ok(result.notices.some((n) => n.code === 'discovery-indexer'));
    assert.equal(result.notices.find((n) => n.code === 'discovery-metadata').skipped, 3);
  });
  await withFetch(async () => ok({ data: { tokens: [] }, error: { partialErrors: [{ network: 'bnb-mainnet' }] } }), async () => {
    assert.equal((await portfolioDiscovery('bsc', wallet, 'test', AbortSignal.timeout(1000))).status, 'partial');
  });
});
test('known spam and explicitly hidden contracts skip fallback metadata calls, without leaking between chains', async () => {
  let metadataCalls = 0;
  await withFetch(async (url, options) => {
    if (url.includes('/assets/')) return { ok: false, status: 403 };
    const req = JSON.parse(options.body);
    if (req.method === 'eth_chainId') return ok({ result: '0x38' });
    if (req.method === 'alchemy_getTokenBalances') return ok({ result: { address: wallet, tokenBalances: [{ contractAddress: addr(999), tokenBalance: '0x1' }, { contractAddress: addr(998), tokenBalance: '0x1' }] } });
    metadataCalls++; return ok({ result: { name: 'Claim: scam.site', symbol: 'SCAM', decimals: 18 } });
  }, async () => {
    const first = await indexedDiscovery('bsc', wallet, 'test', undefined, [addr(998)]);
    assert.equal(first.filtered.length, 2); assert.equal(metadataCalls, 1);
    const second = await indexedDiscovery('bsc', wallet, 'test', undefined, [addr(998)]);
    assert.equal(second.filtered.length, 2); assert.equal(metadataCalls, 1);
  });
});
test('explorer claim spam is quarantined before metadata repair and never sent to pricing', async () => {
  const urls = [];
  await withFetch(async (url, options) => {
    urls.push(url);
    if (options?.body) {
      const req = JSON.parse(options.body);
      return ok({ result: req.method === 'eth_chainId' ? '0x2105' : req.method === 'eth_blockNumber' ? '0x123' : '0x0' });
    }
    if (url.includes('/addresses/')) return ok({ items: [{ value: '1', token: { address_hash: contract, name: 'Claim: scam.site', decimals: null } }] });
    return ok({ coins: {} });
  }, async () => {
    const result = await holdings('base', wallet);
    assert.equal(result.filtered.length, 1); assert.equal(result.notices.length, 0);
    assert.equal(result.rows.some((r) => r.address === contract), false);
    assert.equal(urls.some((u) => u.includes(contract)), false);
  });
});
test('explicit contract tracking recovers an automatic false positive through a real contract read', async () => {
  const { Interface } = await import('ethers');
  const abi = new Interface(['function balanceOf(address) view returns(uint256)', 'function decimals() view returns(uint8)', 'function symbol() view returns(string)', 'function name() view returns(string)']);
  await withFetch(async (url, options) => {
    if (options?.body) {
      const req = JSON.parse(options.body);
      if (req.method === 'eth_chainId') return ok({ result: '0x2105' });
      if (req.method === 'eth_blockNumber') return ok({ result: '0x123' });
      if (req.method === 'eth_getBalance') return ok({ result: '0x0' });
      const call = abi.parseTransaction({ data: req.params[0].data });
      return ok({ result: abi.encodeFunctionResult(call.name, call.name === 'balanceOf' ? [1234] : call.name === 'decimals' ? [6] : call.name === 'symbol' ? ['REAL'] : ['Claim: real.site']) });
    }
    return ok({ coins: {} });
  }, async () => {
    const result = await holdings('base', wallet, [contract], { discover: async () => ({ tokens: [], filtered: [{ address: contract, reason: 'Promotional or claim link in token metadata' }], notices: [], issues: [], status: 'complete' }) });
    assert.equal(result.filtered.length, 0);
    assert.equal(result.rows.find((r) => r.address === contract).amountExact, '0.001234');
  });
});

test('large cold wallets select batch metadata while small wallets keep the cheaper Token API', async () => {
  let batches = 0, perToken = 0;
  await withFetch(async (url, options) => {
    const req = JSON.parse(options.body);
    if (url.includes('/assets/')) {
      batches++;
      return ok({ data: { tokens: Array.from({ length: 35 }, (_, i) => ({ address: wallet, network: 'base-mainnet', tokenAddress: addr(2000 + i), tokenBalance: '0x1', tokenMetadata: { name: 'Claim at scam.site', decimals: 18 } })) } });
    }
    if (req.method === 'eth_chainId') return ok({ result: '0x2105' });
    if (req.method === 'alchemy_getTokenBalances') return ok({ result: { address: wallet, tokenBalances: Array.from({ length: 35 }, (_, i) => ({ contractAddress: addr(2000 + i), tokenBalance: '0x1' })) } });
    perToken++; throw Error('individual metadata must not run');
  }, async () => {
    const result = await indexedDiscovery('base', wallet, 'test');
    assert.equal(result.filtered.length, 35); assert.equal(result.status, 'complete');
    assert.equal(batches, 1); assert.equal(perToken, 0);
    await indexedDiscovery('base', wallet, 'test');
    assert.equal(batches, 1); assert.equal(perToken, 0);
  });
});
