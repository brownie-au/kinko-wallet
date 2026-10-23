// Public fixture from the repository's earlier provider checks; no owner/watchlist claim.
import { writeFile, mkdir } from 'node:fs/promises';
import { NETWORKS } from '../src/reimagined/networks.js';
import { createHistoryProviders, boundedMap } from '../src/server/historyProviders.js';
const address = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';
const target = Date.parse('2024-07-28T00:00:00Z');
const traces = [];
const fetcher = async (url, options) => {
  const started = Date.now();
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(7000) });
    const copy = response.clone();
    let payload; try { payload = await copy.json(); } catch { payload = { nonJSON: true }; }
    if (payload?.result?.number) payload.result = Object.fromEntries(['number', 'timestamp', 'hash', 'stateRoot'].map(k => [k, payload.result[k]]));
    if (Array.isArray(payload?.items)) payload.items = payload.items.map(i => ({ token: i.token, timestamp: i.timestamp, block_number: i.block_number }));
    traces.push({ url, request: options?.body ? JSON.parse(options.body) : undefined, status: response.status, ms: Date.now() - started, response: payload });
    return response;
  } catch (e) { traces.push({ url, error: e.name, ms: Date.now() - started }); throw e; }
};
const providers = createHistoryProviders({ fetcher });
const results = await boundedMap(Object.keys(NETWORKS), 2, async (chain) => {
  const result = { chain, chainId: NETWORKS[chain].id, target: new Date(target).toISOString() };
  try { result.block = await providers.block(chain, target); } catch (e) { result.blockError = e.message; }
  try { result.prices = await providers.prices(chain, ['native', NETWORKS[chain].wrappedNative], target, 'MAX'); } catch (e) { result.priceError = e.message; }
  try { result.soldSeeds = await providers.soldSeeds(chain, address, AbortSignal.timeout(7000)); } catch (e) { result.soldDiscoveryError = e.message; }
  if (result.block) {
    for (const method of ['eth_getBalance', 'eth_call']) {
      const params = method === 'eth_getBalance' ? [address, result.block.tag] : [{ to: NETWORKS[chain].wrappedNative, data: '0x70a08231' + address.slice(2).padStart(64, '0') }, result.block.tag];
      try { result[method] = await (await fetcher(result.block.source, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })).json(); } catch (e) { result[method] = { error: e.name }; }
    }
  }
  return result;
});
const geckoUrl = 'https://api.geckoterminal.com/api/v2/networks/eth/pools/0x60594a405d53811d3bc4766596efd80fd545a270/ohlcv/day?aggregate=1&limit=2&before_timestamp=' + Math.floor((Date.now()-31*86400000)/1000);
try { await fetcher(geckoUrl); } catch {}
try { await fetcher('https://api.zerion.io/v1/wallets/' + address + '/charts/day?currency=usd'); } catch {}
await mkdir('docs/history', { recursive: true });
await writeFile('docs/history/live-evidence.json', JSON.stringify({ runAt: new Date().toISOString(), address, identity: 'repository public fixture; not owner holdings', target, results, traces }, null, 2));
console.log(JSON.stringify(results, null, 2));
