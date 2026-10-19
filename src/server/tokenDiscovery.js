// Server-only: imported by api/data.js, never by the browser entry point.
import { setTimeout as sleep } from 'node:timers/promises';
import { json } from '../reimagined/blockchain.js';
import { NETWORKS } from '../reimagined/networks.js';
import { isAddress } from '../reimagined/validation.js';
import { formatTokenUnits } from '../utils/tokenMath.js';

const hosts = { base: 'base-mainnet', polygon: 'polygon-mainnet', bsc: 'bnb-mainnet' };
const metadata = new Map();

// Shared by all requests in this function process. This is deliberately below
// the free tier's throughput, but does not claim a distributed/account-wide cap.
export function createIndexerPacer({ interval = 125, now = Date.now, wait = (ms, signal) => sleep(ms, undefined, { signal }) } = {}) {
  let queue = Promise.resolve(), next = 0;
  return (signal) => {
    const ticket = queue.then(async () => {
      signal?.throwIfAborted();
      const delay = Math.max(0, next - now());
      if (delay) await wait(delay, signal);
      signal?.throwIfAborted();
      next = now() + interval;
    });
    queue = ticket.catch(() => {});
    return ticket;
  };
}
const pace = createIndexerPacer();
export async function indexedDiscovery(chain, address, apiKey, parentSignal) {
  // Reserve most of the holdings window for direct reads and market prices.
  const signal = parentSignal ? AbortSignal.any([parentSignal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000);
  const tokens = [], notices = [], seen = new Set(), cursors = new Set();
  let skipped = 0, unread = 0, rateLimited = false, pageKey;
  const result = (status) => {
    if (skipped) notices.push({ code: 'discovery-metadata', kind: 'warning', action: 'track-token', skipped, message: 'Some indexer token records have invalid balances or metadata. Valid records are retained; add a missing contract to read it directly.' });
    if (signal.aborted) notices.push({ code: 'discovery-timeout', kind: 'warning', action: 'retry', message: 'Token discovery reached its time limit. Some tokens may be missing; successful balances and prices are retained. Retry later to check the remaining tokens.' });
    if (unread && !signal.aborted) notices.push({ code: 'discovery-metadata-unavailable', kind: 'warning', action: 'retry', message: rateLimited
      ? 'Some token metadata could not be read within the provider rate limit. Valid balances are retained; retry later.'
      : 'Some token metadata could not be read before the request ended. Valid balances are retained; retry later.' });
    return { tokens, notices, issues: notices.map((n) => n.message), status: status === 'complete' && notices.length ? 'partial' : status, recoverable: [] };
  };
  const rpc = async (method, params) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await pace(signal);
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
      } catch (error) {
        if (error.status !== 429 || attempt) throw error;
        await sleep(1000, undefined, { signal });
      }
    }
  };
  const failure = (error) => {
    if (signal.aborted) return result(tokens.length ? 'partial' : 'unavailable');
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
          metadata.delete(key);
          const error = new Error('Invalid token decimals'); error.code = 'invalid-metadata'; throw error;
        }
        return { address: contract, symbol: String(info.symbol || 'TOKEN').slice(0, 30), name: String(info.name || 'Token').slice(0, 100), decimals, amountExact: formatTokenUnits(BigInt(raw), decimals) };
      }));
      for (const item of batch) {
        if (item.status === 'fulfilled') tokens.push(item.value);
        else if (item.reason?.code === 'invalid-metadata') skipped++;
        else { unread++; if (item.reason?.status === 429) rateLimited = true; }
      }
    }
    if (!data.pageKey) {
      return result('complete');
    }
    if (typeof data.pageKey !== 'string' || data.pageKey.length > 4000 || cursors.has(data.pageKey)) break;
    cursors.add(data.pageKey); pageKey = data.pageKey;
  }
  notices.push({ code: 'discovery-limit', kind: 'warning', action: 'track-token', message: 'Token discovery reached its page limit. Some tokens may be missing; add a missing contract to check it directly.' });
  return result('partial');
}
