import { discoverBlockscoutTokens } from './blockscoutDiscovery.js';
export { toUnits } from '../utils/tokenMath.js';
const base = import.meta.env.VITE_POLYGON_BLOCKSCOUT_V2 || 'https://polygon.blockscout.com/api/v2';
const inflight = new Map();
const cache = new Map();
export async function getPolygonTokensFromBlockscout(address, opts = {}) {
  const key = address.toLowerCase();
  const hit = cache.get(key);
  if (!opts.force && hit && Date.now() - hit.at < (opts.cacheMs ?? 300000)) return hit.rows;
  if (inflight.has(key)) return inflight.get(key);
  const job = discoverBlockscoutTokens(base, address)
    .then((rows) => {
      cache.set(key, { rows, at: Date.now() });
      return rows;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}
