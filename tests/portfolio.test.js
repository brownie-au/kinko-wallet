import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTokenUnits, multiplyDecimal, addDecimal } from '../src/utils/tokenMath.js';
import { normalizeWallets, parseWalletBackup } from '../src/utils/walletRecords.js';
import { aggregateHoldings } from '../src/services/portfolioAggregation.js';
import { discoverBlockscoutTokens } from '../src/services/blockscoutDiscovery.js';
const address = '0x' + 'a'.repeat(40),
  contract = '0x' + 'b'.repeat(40);

test('integer conversion retains 18 decimals, huge balances and zero-decimal tokens', () => {
  assert.equal(formatTokenUnits('1', 18), '0.000000000000000001');
  assert.equal(formatTokenUnits('1000000000000000001', 18), '1.000000000000000001');
  assert.equal(formatTokenUnits('9007199254740993000000000000000001', 18), '9007199254740993.000000000000000001');
  assert.equal(formatTokenUnits('100', 0), '100');
  assert.equal(formatTokenUnits('0', 18), '0');
  assert.throws(() => formatTokenUnits('1', -1));
  assert.throws(() => formatTokenUnits('1', 256));
});
test('decimal financial arithmetic is exact, including exponent notation', () => {
  assert.equal(addDecimal('0.1', '0.2'), '0.3');
  assert.equal(multiplyDecimal('9007199254740993.00000001', '0.00000001'), '90071992.5474099300000001');
  assert.equal(multiplyDecimal('1e-18', '1e+8'), '0.0000000001');
});
test('wallet migration preserves labels, hidden state and merges case-insensitive duplicates', () => {
  const result = normalizeWallets([
    { address, name: 'Main', networks: ['pulse'], hidden: true },
    { address: address.toUpperCase().replace('0X', '0x'), networks: ['eth'] }
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].hidden, true);
  assert.deepEqual(result[0].networks, ['pulse', 'eth']);
  assert.equal(normalizeWallets([{ address }])[0].networks.length, 5);
  assert.throws(() => parseWalletBackup(JSON.stringify([{ address: 'not-a-wallet' }])));
  assert.throws(() => parseWalletBackup(JSON.stringify({ wallets: [{ address }] })));
  assert.deepEqual(parseWalletBackup(JSON.stringify({ app: 'Kinko Wallet', version: 1, wallets: [{ address }] }))[0].address, address);
});
test('portfolio dedupes wallet/network/contract; tickers never identify assets', () => {
  const row = { wallet: address, chain: 'eth', address: contract, symbol: 'HEX', amountExact: '0.1', priceUsd: 3 };
  const result = aggregateHoldings([
    row,
    { ...row, symbol: 'BAD METADATA' },
    { ...row, wallet: '0x' + 'c'.repeat(40), amountExact: '0.2' },
    { ...row, chain: 'pulse' },
    { ...row, address: '0x' + 'd'.repeat(40) }
  ]);
  assert.equal(result.tokens.length, 3);
  assert.equal(result.totalExact, '1.5');
  assert.equal(result.tokens[0].amountExact, '0.3');
  assert.equal(result.breakdown.get('eth:' + contract + ':HEX').length, 2);
});
test('missing prices stay unavailable and never erase genuine quantities', () => {
  const result = aggregateHoldings([
    { wallet: address, chain: 'pulse', address: contract, symbol: 'TOKEN', amountExact: '1000000', priceUsd: null }
  ]);
  assert.equal(result.tokens[0].priceUsd, null);
  assert.equal(result.tokens[0].valueUsd, null);
  assert.equal(result.totalExact, '0');
});
test('discovery uses the supplied wallet, supports pagination and address_hash metadata', async () => {
  const old = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(url);
    return {
      ok: true,
      json: async () => ({
        items: [
          { value: urls.length === 1 ? '100' : '200', token: { type: 'ERC-20', address_hash: contract, decimals: '0', symbol: 'TEST' } }
        ],
        next_page_params: urls.length === 1 ? { index: 2 } : null
      })
    };
  };
  try {
    const result = await discoverBlockscoutTokens('https://example.org/api/v2', address);
    assert.equal(urls.length, 2);
    assert.ok(urls[0].includes(address));
    assert.ok(urls[1].includes('index=2'));
    assert.equal(result[0].balanceRaw, '200');
  } finally {
    globalThis.fetch = old;
  }
});
test('provider errors and incomplete discovery throw instead of returning an empty portfolio', async () => {
  const old = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: false, status: 429 });
    await assert.rejects(() => discoverBlockscoutTokens('https://example.org/api/v2', address), /429/);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ error: 'unavailable' }) });
    await assert.rejects(() => discoverBlockscoutTokens('https://example.org/api/v2', address), /Invalid/);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ items: [], next_page_params: { index: 1 } }) });
    await assert.rejects(() => discoverBlockscoutTokens('https://example.org/api/v2', address, { maxPages: 1 }), /incomplete/);
  } finally {
    globalThis.fetch = old;
  }
});
