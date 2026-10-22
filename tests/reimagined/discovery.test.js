import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discover, holdings } from '../../src/reimagined/blockchain.js';
import { Interface } from 'ethers';
const wallet = '0x' + '1'.repeat(40),
  contract = '0x' + '2'.repeat(40);
const token = (address = contract, decimals = '18') => ({
  value: '1230000000000000000',
  token: { type: 'ERC-20', address_hash: address, symbol: 'TEST', name: 'Test', decimals }
});
const ok = (data) => ({ ok: true, json: async () => data });
async function withFetch(fetch, task) {
  const previous = global.fetch;
  global.fetch = fetch;
  try {
    await task();
  } finally {
    global.fetch = previous;
  }
}

test('discovery uses the filtered paginated endpoint and retains valid tokens with missing metadata', async () => {
  const urls = [];
  await withFetch(
    async (url) => {
      urls.push(url);
      return ok({
        items: [
          token(),
          token('0x' + '3'.repeat(40), null),
          null,
          { ...token('0x' + '4'.repeat(40)), token: { ...token().token, is_spam: true } }
        ],
        next_page_params: null
      });
    },
    async () => {
      const d = await discover('eth', wallet);
      assert.match(urls[0], /\/tokens\?type=ERC-20$/);
      assert.equal(d.tokens.length, 1);
      assert.equal(d.tokens[0].amountExact, '1.23');
      assert.equal(d.status, 'partial');
      assert.equal(d.notices[0].skipped, 2);
      assert.equal(d.notices[0].code, 'discovery-metadata');
    }
  );
});
test('legacy fallback never sends the rejected type parameter to token-balances', async () => {
  const urls = [];
  await withFetch(
    async (url) => {
      urls.push(url);
      return urls.length === 1 ? { ok: false, status: 422 } : ok([token()]);
    },
    async () => {
      const d = await discover('eth', wallet);
      assert.equal(d.status, 'complete');
      assert.equal(d.tokens.length, 1);
      assert.match(urls[1], /\/token-balances$/);
      assert.ok(!urls[1].includes('?'));
    }
  );
});
test('a failed later page preserves earlier tokens and reports the HTTP failure', async () => {
  let calls = 0;
  await withFetch(
    async () => (++calls === 1 ? ok({ items: [token()], next_page_params: { value: '1', items_count: 50 } }) : { ok: false, status: 429 }),
    async () => {
      const d = await discover('pulse', wallet);
      assert.equal(d.tokens.length, 1);
      assert.equal(d.status, 'partial');
      assert.match(d.issues[0], /retained/);
      assert.match(d.issues[0], /rate limiting/);
    }
  );
});
test('blocked discovery is a visible read failure, with no zero-balance claim', async () => {
  await withFetch(
    async () => ({ ok: false, status: 403 }),
    async () => {
      const d = await discover('base', wallet);
      assert.equal(d.status, 'unavailable');
      assert.equal(d.tokens.length, 0);
      assert.match(d.issues[0], /HTTP 403/);
      assert.equal(d.notices[0].kind, 'warning');
    }
  );
});
test('BNB discovery is an explicit manual coverage limit, not a failed provider request', async () => {
  await withFetch(
    async () => {
      throw Error('must not request an indexer');
    },
    async () => {
      const d = await discover('bsc', wallet);
      assert.equal(d.status, 'manual');
      assert.equal(d.notices[0].kind, 'limitation');
      assert.equal(d.notices[0].action, 'track-token');
      assert.match(d.issues[0], /Refreshing does not enable/);
    }
  );
});
test('page limits remain explicit and duplicate contracts are not counted twice', async () => {
  await withFetch(
    async () => ok({ items: [token()], next_page_params: { value: '1', items_count: 50 } }),
    async () => {
      const d = await discover('eth', wallet);
      assert.equal(d.tokens.length, 1);
      assert.equal(d.status, 'partial');
      assert.equal(d.notices[0].code, 'discovery-limit');
    }
  );
});
test('successful native balances survive blocked discovery and are not marked stale', async () => {
  await withFetch(
    async (url, options) => {
      if (options?.body) {
        const req = JSON.parse(options.body);
        return ok({ result: req.method === 'eth_chainId' ? '0x2105' : req.method === 'eth_blockNumber' ? '0x123' : '0xde0b6b3a7640000' });
      }
      if (String(url).includes('blockscout')) return { ok: false, status: 403 };
      return ok({ coins: { 'coingecko:ethereum': { price: 2000, timestamp: Date.now() / 1000 } } });
    },
    async () => {
      const d = await holdings('base', wallet);
      assert.equal(d.rows.length, 1);
      assert.equal(d.rows[0].amountExact, '1');
      assert.equal(d.rows[0].valueUsd, 2000);
      assert.equal(d.discovery, 'unavailable');
      assert.equal(d.notices[0].code, 'discovery-unavailable');
      assert.notEqual(d.rows[0].stale, true);
    }
  );
});

test('tracked tokens retain verified quantities when optional name/symbol calls fail', async () => {
  const abi = new Interface([
    'function balanceOf(address) view returns(uint256)',
    'function decimals() view returns(uint8)',
    'function symbol() view returns(string)',
    'function name() view returns(string)'
  ]);
  await withFetch(
    async (url, options) => {
      if (!options?.body) return ok({ coins: {} });
      const req = JSON.parse(options.body);
      if (req.method === 'eth_chainId') return ok({ result: '0x38' });
      if (req.method === 'eth_blockNumber') return ok({ result: '0x123' });
      if (req.method === 'eth_getBalance') return ok({ result: '0x0' });
      const call = abi.parseTransaction({ data: req.params[0].data });
      if (['name', 'symbol'].includes(call.name)) throw Error('optional metadata unavailable');
      return ok({ result: abi.encodeFunctionResult(call.name, call.name === 'decimals' ? [6] : [1234567]) });
    },
    async () => {
      const d = await holdings('bsc', wallet, [contract]);
      const tracked = d.rows.find((r) => r.address === contract);
      assert.equal(tracked.amountExact, '1.234567');
      assert.equal(tracked.symbol, 'TOKEN');
      assert.equal(tracked.name, 'Tracked token');
      assert.equal(
        d.notices.some((n) => n.code.startsWith('contract-')),
        false
      );
    }
  );
});
