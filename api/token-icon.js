import { tokenIconSource, readTokenIcon } from '../src/server/tokenIconSource.js';

// Only fixed upstream repositories are reachable; no arbitrary URL proxying.
const cache = new Map();
async function lookup(url) {
  const prior = cache.get(url);
  if (prior && prior.expires > Date.now()) return prior.promise;
  const entry = { expires: Date.now() + 3600000 };
  entry.promise = (async () => {
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(6000) });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('Icon provider unavailable');
    return readTokenIcon(response);
  })().catch((error) => { cache.delete(url); throw error; });
  cache.set(url, entry);
  if (cache.size > 256) cache.delete(cache.keys().next().value);
  return entry.promise;
}

export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.setHeader('Allow', 'GET, HEAD');
    res.statusCode = 405;
    return res.end();
  }
  const params = new URL(req.url, 'https://kinko.invalid').searchParams;
  const source = tokenIconSource(params.get('chain'), params.get('address'));
  if (!source) { res.statusCode = 400; return res.end(); }
  try {
    const bytes = await lookup(source);
    res.setHeader('Cache-Control', bytes
      ? 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400'
      : 'public, max-age=300, s-maxage=3600');
    res.statusCode = bytes ? 200 : 404;
    if (bytes) {
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Length', bytes.length);
    }
    return res.end(req.method === 'HEAD' ? undefined : bytes || undefined);
  } catch {
    res.statusCode = 503;
    return res.end();
  }
}
