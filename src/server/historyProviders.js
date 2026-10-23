import { Interface } from 'ethers';
import { spamReason } from '../reimagined/tokenFilter.js';
import { NETWORKS } from '../reimagined/networks.js';
import { PRICE_TOLERANCE } from '../reimagined/historyChart.js';
import { formatTokenUnits, multiplyDecimal, addDecimal } from '../utils/tokenMath.js';
const ABI = new Interface(['function balanceOf(address) view returns(uint256)', 'function decimals() view returns(uint8)']);
const inFlight = new Map();
export function coalesce(key, task, map = inFlight) {
  if (map.has(key)) return map.get(key);
  const promise = Promise.resolve().then(task).finally(() => { if (map.get(key) === promise) map.delete(key); });
  map.set(key, promise); return promise;
}
export async function boundedMap(items, limit, task) {
  const result = new Array(items.length); let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) { const index = cursor++; result[index] = await task(items[index], index); }
  })); return result;
}
// Native identity changes are explicit, never selected by ticker. Polygon migration day
// has no exact activation block configured, so native pricing is withheld that day.
export function historicalPriceKey(chain, asset, time) {
  if (asset !== 'native') return `${NETWORKS[chain].llama}:${asset.toLowerCase()}`;
  if (chain === 'polygon') {
    if (time < Date.parse('2024-09-04T00:00:00Z')) return 'coingecko:matic-network';
    if (time < Date.parse('2024-09-05T00:00:00Z')) return null;
  }
  return NETWORKS[chain].nativePrice;
}
export function createHistoryProviders({ fetcher = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now() } = {}) {
  const market = new Map(), verifiedRPC = new Map(), publicPending = new Map(); // No wallet balances
  async function request(url, options = {}) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await fetcher(url, { ...options, signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(6500)]) : AbortSignal.timeout(6500) });
      if ((r.status === 429 || r.status === 503) && attempt === 0) {
        const wait = Number(r.headers.get('retry-after')) * 1000 || 500;
        if (wait > 2000) throw Error('Provider rate limited; retry later.');
        await sleep(Math.max(500, wait)); continue;
      }
      if (!r.ok) throw Error(`Historical provider HTTP ${r.status}`);
      return r.json();
    }
  }
  async function publicData(url, signal) {
    const old = market.get(url);
    if (old && now() - old.at < 86400000) return old.data;
    return coalesce(url, async () => {
      const data = await request(url, { signal });
      // Empty historical price responses are often transient; do not freeze a miss for a day.
      if (!data.coins || Object.keys(data.coins).length) market.set(url, { data, at: now() });
      if (market.size > 1000) market.delete(market.keys().next().value);
      return data;
    }, publicPending);
  }
  async function rpc(chain, method, params, signal) {
    for (const url of NETWORKS[chain].rpc) {
      try {
        const call = async (m, p) => {
          const d = await request(url, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: m, params: p }) });
          if (d.error || d.result == null) throw Error('Historical RPC state unavailable');
          return d.result;
        };
        const identity = `${chain}:${url}`;
        if (verifiedRPC.has(identity) && now() - verifiedRPC.get(identity) > 3600000) verifiedRPC.delete(identity);
        if (!verifiedRPC.has(identity)) {
          if (Number(BigInt(await call('eth_chainId', []))) !== NETWORKS[chain].id) continue;
          verifiedRPC.set(identity, now());
        }
        return { value: await call(method, params), source: url };
      } catch { if (signal?.aborted) throw Error('Historical request timed out'); }
    }
    throw Error(`${NETWORKS[chain].name} archive state unavailable`);
  }
  async function block(chain, time, signal) {
    let d;
    if (chain === 'pulse') {
      const scan = await publicData(`https://api.scan.pulsechain.com/api?module=block&action=getblocknobytime&timestamp=${Math.floor(time / 1000)}&closest=before`, signal);
      const height = scan.result?.blockNumber ?? scan.result;
      d = { height: (typeof height === 'string' || typeof height === 'number') && /^\d+$/.test(String(height)) ? Number(height) : NaN };
    } else d = await publicData(`https://coins.llama.fi/block/${NETWORKS[chain].llama}/${Math.floor(time / 1000)}`, signal);
    if (!Number.isSafeInteger(d.height) || d.height < 0) throw Error('No historical block');
    let tag = '0x' + d.height.toString(16);
    let read = await rpc(chain, 'eth_getBlockByNumber', [tag, false], signal);
    if (Number(BigInt(read.value.number)) !== d.height) throw Error('Historical block mismatch');
    if (Number(BigInt(read.value.timestamp)) * 1000 > time) { tag = '0x' + (d.height - 1).toString(16); read = await rpc(chain, 'eth_getBlockByNumber', [tag, false], signal); }
    const at = Number(BigInt(read.value.timestamp)) * 1000;
    if (Number(BigInt(read.value.number)) !== Number(BigInt(tag)) || at > time || time - at > 120000) throw Error('Historical block outside 2-minute tolerance');
    return { tag, time: at, source: read.source };
  }
  async function prices(chain, addresses, time, range) {
    const keys = addresses.map((a) => historicalPriceKey(chain, a, time));
    const tolerance = PRICE_TOLERANCE[range];
    if (!keys.some(Boolean)) return Object.fromEntries(addresses.map(a => [a, null]));
    const d = await publicData(`https://coins.llama.fi/prices/historical/${Math.floor(time / 1000)}/${encodeURIComponent([...new Set(keys.filter(Boolean))].join(','))}?searchWidth=${Math.max(1, Math.ceil(tolerance / 3600000))}h`);
    return Object.fromEntries(addresses.map((address, i) => {
      const p = keys[i] && d.coins?.[keys[i]], stamp = Number(p?.timestamp) * 1000;
      const valid = typeof p?.price === 'number' && Number.isFinite(p.price) && p.price > 0 && Number.isFinite(stamp) && Math.abs(stamp - time) <= tolerance && Number(p.confidence) >= .8;
      return [address, valid ? { price: p.price, time: stamp, source: 'DefiLlama', key: keys[i] } : null];
    }));
  }
  // Explorer transfer records are discovery seeds only, never reconstructed balances.
  // A bounded page cannot prove complete sold-asset discovery; return the limitation.
  async function soldSeeds(chain, address, signal) {
    if (!NETWORKS[chain].scan) return [];
    const d = await request(`${NETWORKS[chain].scan}/addresses/${address}/token-transfers?type=ERC-20`, { signal });
    return [...new Set((d.items || []).filter((i) => i.token?.type === 'ERC-20' && !spamReason(i.token))
      .map((i) => String(i.token.address_hash || '').toLowerCase()).filter((a) => /^0x[a-f0-9]{40}$/.test(a)))].slice(0, 6);
  }
  async function snapshot({ chain, address, contracts = [], excludedContracts = [], time, range = '1M' }) {
    const signal = AbortSignal.timeout(45000);
    const [at, sold] = await Promise.all([block(chain, time, signal), soldSeeds(chain, address, signal).catch(() => [])]);
    const tokens = [...new Set([...contracts.map((a) => a.toLowerCase()), ...sold])].filter((a) => !excludedContracts.includes(a)).slice(0, 12);
    const candidates = ['native', ...tokens];
    const quotesPending = prices(chain, candidates, time, range).catch(() => ({}));
    const positions = await boundedMap(candidates, 2, async (asset) => {
      try {
        if (asset === 'native') {
          const balance = await rpc(chain, 'eth_getBalance', [address, at.tag], signal);
          return { asset, amount: formatTokenUnits(BigInt(balance.value), 18), balanceSource: balance.source };
        }
        const read = async (name, args) => rpc(chain, 'eth_call', [{ to: asset, data: ABI.encodeFunctionData(name, args) }, at.tag], signal);
        const decimals = await read('decimals', []), balance = await read('balanceOf', [address]);
        return { asset, amount: formatTokenUnits(ABI.decodeFunctionResult('balanceOf', balance.value)[0], Number(ABI.decodeFunctionResult('decimals', decimals.value)[0])), balanceSource: balance.source };
      } catch { return { asset, amount: null, issue: 'Historical balance unavailable' }; }
    });
    const pricesAtTime = await quotesPending;
    let valueExact = '0', valued = 0, excluded = 0;
    for (const p of positions) {
      const quote = pricesAtTime[p.asset];
      Object.assign(p, { chainId: NETWORKS[chain].id, block: at.tag, balanceTime: at.time, ...quote });
      if (p.amount === '0') { p.valueExact = '0'; valued++; }
      else if (p.amount != null && quote) { p.valueExact = multiplyDecimal(p.amount, String(quote.price)); valueExact = addDecimal(valueExact, p.valueExact); valued++; }
      else { p.valueExact = null; excluded++; }
    }
    return { time, chain, address: address.toLowerCase(), value: valued ? Number(valueExact) : null, valueExact: valued ? valueExact : null,
      partial: true, excluded, positions, discovery: 'bounded-seeds-only', method: 'archive-liquid-v2',
      limitations: ['Previously sold asset discovery is incomplete', 'HEX stakes, NFTs and protocol positions excluded'],
      block: at.tag, balanceTime: at.time, blockSource: at.source };
  }
  return { snapshot, block, prices, soldSeeds, request };
}
export const historyProviders = createHistoryProviders();
