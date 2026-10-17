import { randomInt } from 'node:crypto';
import { normalizeWallets } from '../src/utils/walletRecords.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ID_RE = /^[A-HJ-NP-Z2-9]{6,8}$/;
const MAX_BYTES = 500000;
const send = (res, status, data) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
};
async function redis(command) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REST_TOKEN;
  if (!url || !token) throw new Error('Portfolio sync is not configured');
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error('Portfolio sync unavailable');
  const data = await response.json();
  if (data.error) throw new Error('Portfolio sync unavailable');
  return data.result;
}
async function readBody(req) {
  if (Number(req.headers?.['content-length'] || 0) > MAX_BYTES) throw new Error('Request too large');
  if (req.body != null) {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (Buffer.byteLength(raw) > MAX_BYTES) throw new Error('Request too large');
    return JSON.parse(raw);
  }
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > MAX_BYTES) throw new Error('Request too large');
  }
  return JSON.parse(raw || '{}');
}
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method === 'POST') {
    let body, wallets;
    try {
      body = await readBody(req);
      wallets = normalizeWallets(body.wallets, { strict: true });
    } catch {
      return send(res, 400, { error: 'Invalid wallet list or request body' });
    }
    let id = String(body.id || '')
      .trim()
      .toUpperCase();
    if (id && !ID_RE.test(id)) return send(res, 400, { error: 'Invalid Portfolio ID' });
    try {
      if (id) {
        await redis(['SET', `kw:pf:${id}`, JSON.stringify({ wallets }), 'EX', 31536000]);
      } else {
        let saved = false;
        for (let attempt = 0; attempt < 5; attempt++) {
          id = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
          saved = await redis(['SET', `kw:pf:${id}`, JSON.stringify({ wallets }), 'EX', 31536000, 'NX']);
          if (saved) break;
        }
        if (!saved) throw new Error('Portfolio sync unavailable');
      }
      return send(res, 200, { id });
    } catch {
      return send(res, 503, { error: 'Portfolio sync unavailable. Local wallets and backups still work.' });
    }
  }
  if (req.method === 'GET') {
    const id = String(req.query?.id || '')
      .trim()
      .toUpperCase();
    if (!ID_RE.test(id)) return send(res, 400, { error: 'Invalid Portfolio ID' });
    try {
      const raw = await redis(['GET', `kw:pf:${id}`]);
      if (raw == null) return send(res, 404, { error: 'Portfolio not found' });
      const data = JSON.parse(raw);
      // Read the old {value: JSON-string, px: ...} format as well as the repaired schema.
      const record = typeof data.value === 'string' ? JSON.parse(data.value) : data;
      return send(res, 200, { wallets: normalizeWallets(record.wallets || []) });
    } catch {
      return send(res, 503, { error: 'Portfolio sync unavailable' });
    }
  }
  res.setHeader('Allow', 'GET,POST,OPTIONS');
  return send(res, 405, { error: 'Method not allowed' });
}
