import { holdings, stakes, activity, isAddress, json } from '../src/reimagined/blockchain.js';
import { configuredDiscovery } from '../src/server/tokenDiscovery.js';
import { historyProviders } from '../src/server/historyProviders.js';
import { HISTORY_RANGES } from '../src/reimagined/historyChart.js';
import { NETWORKS } from '../src/reimagined/networks.js';
const cache = new Map();
const limits = new Map();
let activeHistory = 0;
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
    if (!['holdings', 'stakes', 'activity', 'fx', 'history'].includes(action)) return reply(res, 400, { error: 'Unsupported action' });
    if (action !== 'fx' && (!NETWORKS[chain] || !isAddress(address)))
      return reply(res, 400, { error: 'Invalid network or public wallet address' });
    if (!Array.isArray(contracts) || contracts.length > 30 || contracts.some((c) => !isAddress(c)))
      return reply(res, 400, { error: 'Invalid token contracts' });
    if (!Array.isArray(excludedContracts) || excludedContracts.length > 100 || excludedContracts.some((c) => !isAddress(c)))
      return reply(res, 400, { error: 'Invalid hidden token contracts' });
    if (action === 'history') {
      rate.history = (rate.history || 0) + 1;
      if (rate.history > 12) return reply(res, 429, { error: 'Historical quota reached; saved history retained. Retry later.' });
      if (!Object.hasOwn(HISTORY_RANGES, body.range) || !Number.isSafeInteger(body.time) || body.time < 1438269988000 || body.time > now - 60000 || contracts.length > 12)
        return reply(res, 400, { error: 'Invalid historical time, range or contract limit' });
      // Promise only: coalesce concurrent private reads, then discard all wallet data.
      const privateKey = JSON.stringify(['history', chain, address.toLowerCase(), [...contracts].sort(), [...excludedContracts].sort(), body.time, body.range]);
      let pending = cache.get(privateKey)?.promise;
      if (!pending) {
        if (activeHistory >= 2) return reply(res, 429, { error: 'Historical providers busy; retry later.' });
        activeHistory++;
        pending = historyProviders.snapshot({ chain, address, contracts, excludedContracts, time: body.time, range: body.range }).finally(() => { activeHistory--; });
        cache.set(privateKey, { time: now, promise: pending });
      }
      try { return reply(res, 200, await pending); } finally { if (cache.get(privateKey)?.promise === pending) cache.delete(privateKey); }
    }
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
              discover: (network, wallet, signal) => configuredDiscovery(network, wallet, process.env.ALCHEMY_API_KEY, signal, excludedContracts)
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
