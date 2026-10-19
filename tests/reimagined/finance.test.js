import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTokenUnits, multiplyDecimal } from '../../src/utils/tokenMath.js';
import { aggregateHoldings } from '../../src/services/portfolioAggregation.js';
import { NETWORKS, HEX_ADDRESS, HEX_EPOCH, stakeMetrics } from '../../src/reimagined/networks.js';
import { holdings, stakes, reader, addPrices } from '../../src/reimagined/blockchain.js';
import { Interface } from 'ethers';
test('exact amounts survive token decimals and portfolio aggregation across contracts and networks', () => {
  assert.equal(formatTokenUnits('123456789012345678901234567890', 18), '123456789012.34567890123456789');
  assert.equal(formatTokenUnits('100000000', 8), '1');
  assert.equal(multiplyDecimal('0.000000000000000001', '2'), '0.000000000000000002');
  const common = {
    wallet: '0xabc',
    address: HEX_ADDRESS,
    symbol: 'HEX',
    amountExact: '100000000000.12345678',
    priceUsd: 0.00012345,
    chain: 'pulse'
  };
  const d = aggregateHoldings([
    common,
    common,
    { ...common, chain: 'eth' },
    { ...common, wallet: '0xdef', priceUsd: null, amountExact: '5' }
  ]);
  assert.equal(d.tokens.length, 2);
  assert.equal(d.tokens.find((t) => t.chain === 'pulse').amountExact, '100000000005.12345678');
  assert.equal(d.totalExact, '24690000.000030481478982');
});
test('HEX currentDay and maturity boundaries, T-Share units and good accounting are distinct', () => {
  assert.equal(HEX_EPOCH, 1575331200);
  assert.equal(NETWORKS.pulse.id, 369);
  assert.equal(NETWORKS.eth.id, 1);
  assert.equal(HEX_ADDRESS, '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39');
  const s = { lockedDay: 100, stakedDays: 365, unlockedDay: 0 };
  assert.equal(stakeMetrics(s, 99).status, 'Pending');
  assert.equal(stakeMetrics(s, 100).progress, 0);
  assert.equal(stakeMetrics(s, 434).status, 'Active');
  assert.equal(stakeMetrics(s, 435).status, 'Due soon');
  assert.equal(stakeMetrics(s, 465).status, 'Matured');
  assert.equal(stakeMetrics(s, 465).remaining, 0);
  assert.equal(stakeMetrics(s, 465).progress, 100);
  assert.equal(stakeMetrics({ ...s, unlockedDay: 465 }, 500).status, 'Accounted');
  assert.equal(new Date(stakeMetrics(s, 465).endTime).toISOString(), '2021-03-12T00:00:00.000Z');
  assert.equal(formatTokenUnits('1000000000000', 12), '1');
});
test('wrong network never yields a trusted reader and provider failure never becomes zero balances', async () => {
  const old = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ result: '0x38' }) });
  try {
    await assert.rejects(reader('pulse'), /RPC unavailable/);
  } finally {
    global.fetch = old;
  }
  global.fetch = async () => {
    throw Error('offline');
  };
  try {
    await assert.rejects(holdings('eth', '0x' + '1'.repeat(40)), /unavailable/);
    await assert.rejects(stakes('pulse', '0x' + '1'.repeat(40)), /unavailable/);
  } finally {
    global.fetch = old;
  }
});
test('prices without recent timestamps are excluded instead of fabricated', async () => {
  const old = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ coins: {} }) });
  try {
    const [row] = await addPrices('eth', [{ address: HEX_ADDRESS, amountExact: '123.456' }]);
    assert.equal(row.priceUsd, null);
    assert.equal(row.valueUsd, null);
    assert.equal(row.amountExact, '123.456');
  } finally {
    global.fetch = old;
  }
});
test('on-chain stake decoding pins all reads to a checked chain and block', async () => {
  const old = global.fetch;
  const iface = new Interface([
    'function currentDay() view returns(uint256)',
    'function stakeCount(address) view returns(uint256)',
    'function stakeLists(address,uint256) view returns(uint40,uint72,uint72,uint16,uint16,uint16,bool)'
  ]);
  const calls = [];
  global.fetch = async (url, opts) => {
    const b = JSON.parse(opts.body);
    calls.push(b);
    let result;
    if (b.method === 'eth_chainId') result = '0x171';
    else if (b.method === 'eth_blockNumber') result = '0x123';
    else {
      const call = iface.parseTransaction({ data: b.params[0].data });
      result = iface.encodeFunctionResult(
        call.name,
        call.name === 'currentDay' ? [1000] : call.name === 'stakeCount' ? [1] : [42, '123456789', '1000000000000', 900, 365, 0, false]
      );
    }
    return { ok: true, json: async () => ({ result }) };
  };
  try {
    const d = await stakes('pulse', '0x' + '1'.repeat(40));
    assert.equal(d.stakes[0].principal, '1.23456789');
    assert.equal(d.stakes[0].tShares, '1');
    assert.equal(d.stakes[0].id, '42');
    assert.equal(d.stakes[0].remaining, 265);
    for (const c of calls.filter((c) => c.method === 'eth_call')) {
      assert.equal(c.params[1], '0x123');
      assert.equal(c.params[0].to, HEX_ADDRESS);
    }
  } finally {
    global.fetch = old;
  }
});

test('a provider that fails mid-read falls back only after the alternate chain is checked', async () => {
  const old = global.fetch;
  const requests = [];
  global.fetch = async (url, options) => {
    const b = JSON.parse(options.body);
    requests.push({ url, method: b.method });
    if (url.includes('ethereum-rpc.publicnode') && b.method === 'eth_getBalance') throw new Error('rate limited');
    const result = b.method === 'eth_chainId' ? '0x1' : b.method === 'eth_blockNumber' ? '0x999' : '0x123';
    return { ok: true, json: async () => ({ result }) };
  };
  try {
    const r = await reader('eth');
    assert.equal(await r.rpc('eth_getBalance', ['0x' + '1'.repeat(40), r.block]), '0x123');
    const fallback = requests.filter((r) => r.url.includes('eth.drpc.org'));
    assert.deepEqual(
      fallback.map((r) => r.method),
      ['eth_chainId', 'eth_getBalance']
    );
  } finally {
    global.fetch = old;
  }
});
