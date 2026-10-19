import { holdings, stakes, activity, isAddress, json } from '../src/reimagined/blockchain.js';
import { indexedDiscovery } from '../src/server/tokenDiscovery.js';
import { NETWORKS } from '../src/reimagined/networks.js';
const cache = new Map();
const limits = new Map();
const reply = (res, status, data) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
};
export default async function handler(req, res) {
  if (req.method !== 'POST') return reply(res, 405, { error: 'Method not allowed' });
  try {
    const ip = String(req.headers['x-forwarded-for'] || 'local').split(',')[0];
    const now = Date.now();
    let rate = limits.get(ip);
    if (!rate || now - rate.time > 60000) {
      rate = { time: now, count: 0 };
      limits.set(ip, rate);
    }
    if (++rate.count > 120) return reply(res, 429, { error: 'Too many requests. Please wait a minute.' });
    if (limits.size > 10000) limits.clear();
    if (Number(req.headers['content-length'] || 0) > 12000) return reply(res, 413, { error: 'Request too large' });
    let body = req.body;
    if (body == null) {
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 12000) return reply(res, 413, { error: 'Request too large' });
      }
      body = JSON.parse(raw);
    }
    if (typeof body === 'string') body = JSON.parse(body);
    const { action, chain, address, contracts = [], excludedContracts = [] } = body || {};
    if (!['holdings', 'stakes', 'activity', 'fx'].includes(action)) return reply(res, 400, { error: 'Unsupported action' });
    if (action !== 'fx' && (!NETWORKS[chain] || !isAddress(address)))
      return reply(res, 400, { error: 'Invalid network or public wallet address' });
    if (!Array.isArray(contracts) || contracts.length > 30 || contracts.some((c) => !isAddress(c)))
      return reply(res, 400, { error: 'Invalid token contracts' });
    if (!Array.isArray(excludedContracts) || excludedContracts.length > 100 || excludedContracts.some((c) => !isAddress(c)))
      return reply(res, 400, { error: 'Invalid hidden token contracts' });
    const key = JSON.stringify([action, chain, address?.toLowerCase(), contracts.map((c) => c.toLowerCase()).sort(), excludedContracts.map((c) => c.toLowerCase()).sort()]);
    const prior = cache.get(key);
    if (prior && now - prior.time < (action === 'fx' ? 3600000 : 60000)) return reply(res, 200, await prior.promise);
    const promise =
      action === 'fx'
        ? json('https://api.frankfurter.dev/v1/latest?base=USD&symbols=AUD').then((d) => ({
            rate: d.rates.AUD,
            date: d.date,
            source: 'ECB reference rate via Frankfurter'
          }))
        : action === 'holdings'
          ? holdings(chain, address, contracts, {
              excludedContracts,
              discover: process.env.ALCHEMY_API_KEY && ['base', 'polygon', 'bsc'].includes(chain)
                ? (network, wallet, signal) => indexedDiscovery(network, wallet, process.env.ALCHEMY_API_KEY, signal, excludedContracts)
                : undefined
            })
          : { stakes, activity }[action](chain, address, contracts);
    cache.set(key, { time: now, promise });
    if (cache.size > 1000) cache.delete(cache.keys().next().value);
    try {
      return reply(res, 200, await promise);
    } catch (e) {
      cache.delete(key);
      throw e;
    }
  } catch (e) {
    return reply(res, 503, { error: e.message || 'Public data provider unavailable' });
  }
}
