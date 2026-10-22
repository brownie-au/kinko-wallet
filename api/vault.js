import { createHash, timingSafeEqual } from 'node:crypto';
const HEX = /^[a-f0-9]{64}$/;
const MAX_BYTES = 180000;
const digest = (s) => createHash('sha256').update(s).digest('hex');
const eq = (a, b) =>
  typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export async function redis(command) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REST_TOKEN;
  if (!url || !token) throw new Error('Storage unavailable');
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(10000)
  });
  if (!r.ok) throw new Error('Storage unavailable');
  const data = await r.json();
  if (data.error) throw new Error('Storage unavailable');
  return data.result;
}
const send = (res, status, data) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
};
async function bodyOf(req) {
  if (Number(req.headers['content-length'] || 0) > MAX_BYTES) throw new Error('too large');
  let raw = req.body != null ? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body)) : '';
  if (req.body == null)
    for await (const chunk of req) {
      raw += chunk;
      if (Buffer.byteLength(raw) > MAX_BYTES) throw new Error('too large');
    }
  if (Buffer.byteLength(raw) > MAX_BYTES) throw new Error('too large');
  return JSON.parse(raw || '{}');
}
export function validEnvelope(e) {
  return (
    e?.version === 1 &&
    typeof e.iv === 'string' &&
    /^[A-Za-z0-9+/]{16}$/.test(e.iv) &&
    typeof e.ciphertext === 'string' &&
    e.ciphertext.length >= 24 &&
    e.ciphertext.length <= 170000 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(e.ciphertext)
  );
}
// Atomic compare-and-swap prevents last-writer-wins data loss across devices.
export const UPDATE_SCRIPT = `local raw=redis.call('GET',KEYS[1]); if not raw then return -1 end; local r=cjson.decode(raw); if r.verifier~=ARGV[1] then return -2 end; if r.revision~=tonumber(ARGV[2]) then return -3 end; redis.call('SET',KEYS[1],ARGV[3]); return 1`;
export const DELETE_SCRIPT = `local raw=redis.call('GET',KEYS[1]); if not raw then return -1 end; local r=cjson.decode(raw); if r.verifier~=ARGV[1] then return -2 end; if r.revision~=tonumber(ARGV[2]) then return -3 end; redis.call('DEL',KEYS[1]); return 1`;
export function createVaultHandler(store = redis) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Authorization, X-Kinko-Account');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'POST', 'PUT', 'DELETE'].includes(req.method)) return send(res, 405, { error: 'Method not allowed' });
    const origin = req.headers.origin;
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    if (origin) {
      try {
        if (new URL(origin).host !== host) return send(res, 403, { error: 'Origin rejected' });
      } catch {
        return send(res, 403, { error: 'Origin rejected' });
      }
    }
    const id = req.headers['x-kinko-account'];
    const auth = String(req.headers.authorization || '').replace(/^Bearer /, '');
    if (!HEX.test(id || '') || !HEX.test(auth)) return send(res, 401, { error: 'Invalid Kinko credentials' });
    const verifier = digest(auth);
    const key = `kinko:vault:v1:${id}`;
    try {
      // Rate limits use a one-way account/IP digest, no raw credential in keys or logs.
      const ip = String(req.headers['x-forwarded-for'] || 'local').split(',')[0];
      const rate = `kinko:rate:${digest(ip)}:${Math.floor(Date.now() / 60000)}`;
      const hits = await store(['INCR', rate]);
      if (hits === 1) await store(['EXPIRE', rate, 90]);
      if (hits > 90) return send(res, 429, { error: 'Too many requests. Please wait a minute.' });
      if (req.method === 'GET') {
        const raw = await store(['GET', key]);
        if (!raw) return send(res, 404, { error: 'No saved watchlist for this Kinko Access Key.' });
        const record = JSON.parse(raw);
        if (!eq(record.verifier, verifier)) return send(res, 401, { error: 'Invalid Kinko credentials' });
        return send(res, 200, { envelope: record.envelope, revision: record.revision });
      }
      let body;
      try {
        body = await bodyOf(req);
      } catch {
        return send(res, 400, { error: 'Invalid request body' });
      }
      if (req.method !== 'DELETE' && !validEnvelope(body.envelope)) return send(res, 400, { error: 'Invalid encrypted watchlist' });
      if (req.method === 'POST') {
        const record = { verifier, envelope: body.envelope, revision: 1 };
        const result = await store(['SET', key, JSON.stringify(record), 'NX']);
        return result ? send(res, 201, { revision: 1 }) : send(res, 409, { error: 'This watchlist already exists. Restore it instead.' });
      }
      if (!Number.isSafeInteger(body.revision) || body.revision < 1) return send(res, 400, { error: 'Invalid watchlist revision' });
      const record = { verifier, envelope: body.envelope, revision: body.revision + 1 };
      const result = await store([
        'EVAL',
        req.method === 'DELETE' ? DELETE_SCRIPT : UPDATE_SCRIPT,
        1,
        key,
        verifier,
        String(body.revision),
        JSON.stringify(record)
      ]);
      if (result === -1) return send(res, 404, { error: 'Watchlist not found' });
      if (result === -2) return send(res, 401, { error: 'Invalid Kinko credentials' });
      if (result === -3)
        return send(res, 409, { error: 'Another device changed this watchlist. Export your pending changes, then reload the saved copy.' });
      if (result !== 1) throw new Error('Storage unavailable');
      return send(res, 200, { revision: body.revision + 1, deleted: req.method === 'DELETE' });
    } catch {
      return send(res, 503, {
        error: 'Encrypted sync is unavailable. Keep your key and export an encrypted backup. Nothing has been overwritten.'
      });
    }
  };
}
export default createVaultHandler();
