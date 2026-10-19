import { Interface } from 'ethers';
import { isAddress } from './validation.js';
export { isAddress };
import { NETWORKS, HEX_ADDRESS, stakeMetrics } from './networks.js';
import { formatTokenUnits, multiplyDecimal } from '../utils/tokenMath.js';
const ABI = new Interface([
  'function balanceOf(address) view returns(uint256)',
  'function symbol() view returns(string)',
  'function name() view returns(string)',
  'function decimals() view returns(uint8)',
  'function currentDay() view returns(uint256)',
  'function stakeCount(address) view returns(uint256)',
  'function stakeLists(address,uint256) view returns(uint40,uint72,uint72,uint16,uint16,uint16,bool)'
]);
export async function json(url, options = {}) {
  const r = await fetch(url, { ...options, signal: AbortSignal.timeout(9000) });
  if (!r.ok) {
    const error = new Error(`Provider unavailable (${r.status})`);
    error.status = r.status;
    throw error;
  }
  return r.json();
}
async function rawRpc(url, method, params) {
  const data = await json(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  if (data.error || data.result == null) throw new Error('RPC request failed');
  return data.result;
}
export async function reader(chain) {
  const network = NETWORKS[chain];
  if (!network) throw new Error('Unsupported network');
  const verified = new Set();
  let primary, block;
  for (const url of network.rpc) {
    try {
      if (Number(BigInt(await rawRpc(url, 'eth_chainId', []))) !== network.id) continue;
      verified.add(url);
      block = await rawRpc(url, 'eth_blockNumber', []);
      primary = url;
      break;
    } catch {
      /* Try a known fallback, never accept a different chain. */
    }
  }
  if (!primary) throw new Error(`${network.name} RPC unavailable. Try refreshing later.`);
  const invoke = async (method, params) => {
    for (const url of [primary, ...network.rpc.filter((u) => u !== primary)]) {
      try {
        if (!verified.has(url)) {
          if (Number(BigInt(await rawRpc(url, 'eth_chainId', []))) !== network.id) continue;
          verified.add(url);
        }
        return await rawRpc(url, method, params);
      } catch {
        /* A provider can fail after chain identification, too. */
      }
    }
    throw new Error(`${network.name} contract or balance read unavailable.`);
  };
  return {
    block,
    rpc: invoke,
    call: async (contract, name, args = []) => {
      const raw = await invoke('eth_call', [{ to: contract, data: ABI.encodeFunctionData(name, args) }, block]);
      return ABI.decodeFunctionResult(name, raw);
    }
  };
}
export async function discover(chain, address) {
  const base = NETWORKS[chain].scan;
  if (!base)
    return discoveryResult(
      [],
      [
        {
          code: 'discovery-manual',
          kind: 'limitation',
          action: 'track-token',
          message:
            'Automatic token discovery is not configured. Native BNB and added token contracts are still checked. Refreshing does not enable discovery.'
        }
      ],
      'manual'
    );
  const root = `${base}/addresses/${address}`;
  // /tokens supports filtering/pagination. /token-balances does not accept type on strict instances.
  let url = `${root}/tokens?type=ERC-20`;
  const tokens = [];
  const seen = new Set();
  const notices = [];
  let skipped = 0;
  for (let page = 0; page < 5; page++) {
    let data;
    try {
      try {
        data = await json(url);
      } catch (error) {
        if (page !== 0 || ![404, 422].includes(error.status)) throw error;
        data = await json(`${root}/token-balances`);
      }
    } catch (error) {
      notices.push(discoveryFailure(error, tokens.length > 0));
      return discoveryResult(tokens, notices, tokens.length ? 'partial' : 'unavailable', skipped);
    }
    const items = Array.isArray(data) ? data : data?.items;
    if (!Array.isArray(items)) {
      notices.push(discoveryFailure(new Error('Invalid explorer response'), tokens.length > 0));
      return discoveryResult(tokens, notices, tokens.length ? 'partial' : 'unavailable', skipped);
    }
    for (const item of items) {
      if (!item || typeof item !== 'object') {
        skipped++;
        continue;
      }
      const t = item.token || item;
      const contract = String(t.address_hash || t.address || '').toLowerCase();
      const raw = String(item.value ?? '');
      const decimals = Number(t.decimals);
      if ((t.type && t.type !== 'ERC-20') || t.is_spam === true || raw === '0') continue;
      if (
        !isAddress(contract) ||
        !/^\d+$/.test(raw) ||
        t.decimals == null ||
        !Number.isInteger(decimals) ||
        decimals < 0 ||
        decimals > 255
      ) {
        skipped++;
        continue;
      }
      if (BigInt(raw) === 0n) continue;
      if (seen.has(contract)) continue;
      seen.add(contract);
      tokens.push({
        address: contract,
        symbol: String(t.symbol || 'TOKEN').slice(0, 30),
        name: String(t.name || 'Token').slice(0, 100),
        decimals,
        amountExact: formatTokenUnits(raw, decimals),
        spam: t.is_spam === true
      });
    }
    if (!data.next_page_params) return discoveryResult(tokens, notices, skipped ? 'partial' : 'complete', skipped);
    url = `${root}/tokens?${new URLSearchParams({ ...data.next_page_params, type: 'ERC-20' })}`;
  }
  notices.push({
    code: 'discovery-limit',
    kind: 'warning',
    action: 'track-token',
    message: 'Token discovery reached its page limit. Some tokens may be missing; add a missing contract to check it directly.'
  });
  return discoveryResult(tokens, notices, 'partial', skipped);
}
function discoveryResult(tokens, notices, status, skipped = 0) {
  if (skipped)
    notices.push({
      code: 'discovery-metadata',
      kind: 'warning',
      action: 'track-token',
      skipped,
      message:
        'Some token records could not be interpreted safely. Valid balances are retained; add a missing token contract to read it directly.'
    });
  return { tokens, notices, issues: notices.map((n) => n.message), status };
}
function discoveryFailure(error, partial) {
  const reason =
    error.status === 429
      ? 'The explorer is rate limiting requests. Wait a minute before retrying.'
      : error.status === 403
        ? 'The explorer blocked the request (HTTP 403). Native balances and added token contracts are checked separately.'
        : error.status
          ? `The explorer returned HTTP ${error.status}. Native balances and added token contracts are checked separately.`
          : 'The explorer did not return usable data. Native balances and added token contracts are checked separately.';
  return {
    code: 'discovery-unavailable',
    kind: 'warning',
    action: error.status === 403 ? 'track-token' : 'retry',
    message: `${partial ? 'Some discovered tokens were retained, but later pages could not be read.' : 'Automatic token discovery could not be read.'} ${reason}`
  };
}
async function tokenFromContract(r, address, wallet) {
  const [amount, decimals] = await Promise.all([r.call(address, 'balanceOf', [wallet]), r.call(address, 'decimals')]);
  const precision = Number(decimals[0]);
  if (!Number.isInteger(precision) || precision < 0 || precision > 255) throw new Error('Invalid token decimals');
  const [symbol, name] = await Promise.allSettled([r.call(address, 'symbol'), r.call(address, 'name')]);
  return {
    address: address.toLowerCase(),
    symbol: symbol.status === 'fulfilled' ? String(symbol.value[0]).slice(0, 30) : 'TOKEN',
    name: name.status === 'fulfilled' ? String(name.value[0]).slice(0, 100) : 'Tracked token',
    decimals: precision,
    amountExact: formatTokenUnits(amount[0].toString(), precision)
  };
}
export async function addPrices(chain, tokens) {
  const n = NETWORKS[chain];
  const keys = tokens.map((t) => (t.address ? `${n.llama}:${t.address}` : n.nativePrice));
  const prices = {};
  for (let i = 0; i < keys.length; i += 30) {
    try {
      Object.assign(
        prices,
        (await json(`https://coins.llama.fi/prices/current/${encodeURIComponent(keys.slice(i, i + 30).join(','))}`)).coins || {}
      );
    } catch {
      /* Unknown prices remain null. */
    }
  }
  if (chain === 'pulse') {
    const unknown = tokens.filter((t, i) => !prices[keys[i]]).slice(0, 30);
    // The documented chain-specific endpoint prevents mixing identically addressed tokens on other networks.
    const contracts = unknown.map((t) => t.address || '0xa1077a294dde1b09bb078844df40758a5d0f9a27');
    if (contracts.length)
      try {
        const pairs = await json(`https://api.dexscreener.com/tokens/v1/pulsechain/${contracts.join(',')}`);
        for (const t of unknown) {
          const address = t.address || '0xa1077a294dde1b09bb078844df40758a5d0f9a27';
          const best = (Array.isArray(pairs) ? pairs : [])
            .filter(
              (p) => p.chainId === 'pulsechain' && p.baseToken?.address?.toLowerCase() === address && Number(p.liquidity?.usd) > 10000
            )
            .sort((a, b) => Number(b.liquidity.usd) - Number(a.liquidity.usd))[0];
          if (best && Number(best.priceUsd) > 0)
            prices[t.address ? `${n.llama}:${t.address}` : n.nativePrice] = {
              price: Number(best.priceUsd),
              timestamp: Date.now() / 1000,
              source: 'dexscreener'
            };
        }
      } catch {
        /* Quantity stays visible without a price. */
      }
  }
  return tokens.map((t, i) => {
    const meta = prices[keys[i]];
    const recent = meta?.timestamp && Math.abs(Date.now() / 1000 - meta.timestamp) < 21600;
    const priceUsd = recent && Number(meta.price) > 0 && Number.isFinite(Number(meta.price)) ? Number(meta.price) : null;
    const valueExact = priceUsd == null ? null : multiplyDecimal(t.amountExact, String(priceUsd));
    return {
      ...t,
      chain,
      priceUsd,
      valueExact,
      valueUsd: valueExact == null ? null : Number(valueExact),
      priceSource: priceUsd == null ? null : meta.source || 'DefiLlama',
      priceTime: meta?.timestamp ? meta.timestamp * 1000 : null
    };
  });
}
export async function holdings(chain, address, contracts = []) {
  const issues = [];
  const notices = [];
  const rows = [];
  const [rpcResult, scanResult] = await Promise.allSettled([reader(chain), discover(chain, address)]);
  if (scanResult.status === 'fulfilled') {
    rows.push(...scanResult.value.tokens);
    issues.push(...scanResult.value.issues);
    notices.push(...scanResult.value.notices);
  } else {
    const notice = discoveryFailure(scanResult.reason, false);
    notices.push(notice);
    issues.push(notice.message);
  }
  const addIssue = (code, message) => {
    issues.push(message);
    notices.push({ code, kind: 'warning', action: 'retry', message });
  };
  if (rpcResult.status === 'fulfilled') {
    const r = rpcResult.value;
    try {
      const raw = await r.rpc('eth_getBalance', [address, r.block]);
      rows.unshift({
        address: null,
        symbol: NETWORKS[chain].symbol,
        name: NETWORKS[chain].name,
        decimals: 18,
        amountExact: formatTokenUnits(BigInt(raw), 18)
      });
    } catch {
      addIssue('native-unavailable', 'Native balance unavailable. Retry this network; token balances may still be available.');
    }
    const required = [
      ...new Set([...(chain === 'eth' || chain === 'pulse' ? [HEX_ADDRESS] : []), ...contracts.map((c) => c.toLowerCase())])
    ].filter((c) => !rows.some((t) => t.address === c));
    const extra = await Promise.allSettled(required.map((c) => tokenFromContract(r, c, address)));
    extra.forEach((v, i) => {
      if (v.status === 'fulfilled') {
        if (Number(v.value.amountExact) > 0) rows.push(v.value);
      } else
        addIssue(
          'contract-' + required[i],
          `Contract balance unavailable: ${required[i].slice(0, 10)}… Retry this network or check that the contract belongs to it.`
        );
    });
  } else addIssue('rpc-unavailable', 'Native RPC unavailable; explorer token balances may still be shown. Retry this network later.');
  if (!rows.length && issues.length) throw new Error(issues.join(' '));
  return {
    rows: (await addPrices(chain, rows)).map((t) => ({ ...t, wallet: address.toLowerCase() })),
    issues,
    notices,
    discovery: scanResult.status === 'fulfilled' ? scanResult.value.status : 'unavailable',
    asOf: Date.now()
  };
}
export async function stakes(chain, address) {
  if (chain !== 'eth' && chain !== 'pulse') throw new Error('HEX staking supports Ethereum and PulseChain.');
  const r = await reader(chain);
  const [day, count] = await Promise.all([r.call(HEX_ADDRESS, 'currentDay'), r.call(HEX_ADDRESS, 'stakeCount', [address])]);
  const currentDay = Number(day[0]);
  const total = Number(count[0]);
  if (!Number.isSafeInteger(total) || total > 500) throw new Error('Stake list exceeds the safe read limit (500).');
  const out = [];
  for (let start = 0; start < total; start += 12) {
    const page = await Promise.all(
      Array.from({ length: Math.min(12, total - start) }, (_, i) => r.call(HEX_ADDRESS, 'stakeLists', [address, start + i]))
    );
    for (const s of page)
      out.push(
        stakeMetrics(
          {
            chain,
            wallet: address.toLowerCase(),
            id: s[0].toString(),
            principal: formatTokenUnits(s[1].toString(), 8),
            shares: s[2].toString(),
            tShares: formatTokenUnits(s[2].toString(), 12),
            lockedDay: Number(s[3]),
            stakedDays: Number(s[4]),
            unlockedDay: Number(s[5]),
            auto: s[6]
          },
          currentDay
        )
      );
  }
  return { stakes: out, currentDay, block: r.block, asOf: Date.now() };
}
export async function activity(chain, address) {
  const base = NETWORKS[chain].scan;
  if (!base) throw new Error('Activity indexing is unavailable on this network. Open its explorer.');
  const d = await json(`${base}/addresses/${address}/transactions`);
  if (!Array.isArray(d.items)) throw new Error('Activity unavailable');
  return {
    items: d.items.slice(0, 25).map((t) => ({
      hash: t.hash,
      time: t.timestamp,
      from: t.from?.hash,
      to: t.to?.hash,
      value: formatTokenUnits(t.value || '0', 18),
      status: t.status,
      method: t.method || 'Transfer',
      chain,
      wallet: address
    })),
    asOf: Date.now()
  };
}
