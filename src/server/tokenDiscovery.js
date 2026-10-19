// Server-only: imported by api/data.js, never by the browser entry point.
import { json } from '../reimagined/blockchain.js';
import { NETWORKS } from '../reimagined/networks.js';
import { isAddress } from '../reimagined/validation.js';
import { formatTokenUnits } from '../utils/tokenMath.js';

const hosts = { base: 'base-mainnet', polygon: 'polygon-mainnet', bsc: 'bnb-mainnet' };
const metadata = new Map();
export async function indexedDiscovery(chain, address, apiKey, signal) {
  const tokens = [], notices = [], seen = new Set(), cursors = new Set();
  let skipped = 0, pageKey;
  const result = (status) => ({ tokens, notices, issues: notices.map((n) => n.message), status, recoverable: [] });
  const rpc = async (method, params) => {
    const data = await json(`https://${hosts[chain]}.g.alchemy.com/v2/${encodeURIComponent(apiKey)}`, {
      signal, method: 'POST', headers: { 'Content-Type': 'application/json' }, redirect: 'error',
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
    });
    if (data.error || data.result == null) {
      const error = new Error('Indexer request failed');
      if (data.error?.code === 429) error.status = 429;
      throw error;
    }
    return data.result;
  };
  const failure = (error) => {
    notices.push({ code: 'discovery-indexer', kind: 'warning', action: 'retry', message:
      [401, 403].includes(error.status)
        ? 'The configured token indexer rejected access. The site owner needs to check its provider key and enabled networks. Native balances and added contracts are still checked.'
        : error.status === 429
          ? 'The token indexer reached its rate or usage limit. Retained tokens, native balances and added contracts remain visible; retry later.'
          : 'The token indexer is unavailable or returned invalid data. Any successfully discovered tokens are retained; native balances and added contracts are checked separately.' });
    return result(tokens.length ? 'partial' : 'unavailable');
  };
  try {
    if (!hosts[chain] || Number(BigInt(await rpc('eth_chainId', []))) !== NETWORKS[chain].id) throw new Error('Wrong chain');
  } catch (error) { return failure(error); }
  for (let page = 0; page < 5; page++) {
    let data;
    try {
      data = await rpc('alchemy_getTokenBalances', [address, 'erc20', { maxCount: 100, ...(pageKey ? { pageKey } : {}) }]);
      if (!Array.isArray(data?.tokenBalances) || data.address?.toLowerCase() !== address.toLowerCase()) throw new Error('Invalid indexer response');
    } catch (error) { return failure(error); }
    const candidates = [];
    for (const item of data.tokenBalances) {
      const contract = String(item?.contractAddress || '').toLowerCase(), raw = item?.tokenBalance;
      if (!isAddress(contract) || typeof raw !== 'string' || !/^0x[0-9a-f]{1,64}$/i.test(raw) || item.error) { skipped++; continue; }
      if (BigInt(raw) === 0n || seen.has(contract)) continue;
      seen.add(contract);
      candidates.push({ contract, raw });
    }
    // Bounded metadata concurrency; successful metadata is shared, balances are always re-read.
    for (let start = 0; start < candidates.length; start += 4) {
      const batch = await Promise.allSettled(candidates.slice(start, start + 4).map(async ({contract, raw}) => {
        const key = `${chain}:${contract}`;
        let prior = metadata.get(key);
        if (!prior || Date.now() - prior.time > 86400000) {
          const promise = rpc('alchemy_getTokenMetadata', [contract]);
          prior = { promise, time: Date.now() }; metadata.set(key, prior);
          if (metadata.size > 2000) metadata.delete(metadata.keys().next().value);
          promise.catch(() => { if (metadata.get(key) === prior) metadata.delete(key); });
        }
        const info = await prior.promise, decimals = Number(info?.decimals);
        if (info?.decimals == null || !Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
          metadata.delete(key); throw new Error('Invalid token decimals');
        }
        return { address: contract, symbol: String(info.symbol || 'TOKEN').slice(0, 30), name: String(info.name || 'Token').slice(0, 100), decimals, amountExact: formatTokenUnits(BigInt(raw), decimals) };
      }));
      for (const item of batch) {
        if (item.status === 'fulfilled') tokens.push(item.value);
        else skipped++;
      }
    }
    if (!data.pageKey) {
      if (skipped) notices.push({ code: 'discovery-metadata', kind: 'warning', action: 'track-token', skipped, message: 'Some indexer token records have invalid balances or metadata. Valid records are retained; add a missing contract to read it directly.' });
      return result(skipped ? 'partial' : 'complete');
    }
    if (typeof data.pageKey !== 'string' || data.pageKey.length > 4000 || cursors.has(data.pageKey)) break;
    cursors.add(data.pageKey); pageKey = data.pageKey;
  }
  notices.push({ code: 'discovery-limit', kind: 'warning', action: 'track-token', message: 'Token discovery reached its page limit. Some tokens may be missing; add a missing contract to check it directly.' });
  return result('partial');
}
