// api/tx.js
// Normalized, cached transaction history via Etherscan-compatible APIs
// Query: GET /api/tx?chain=eth&address=0x...
// Cache: 10 minutes via Upstash KV (if configured), else in-memory Map
// Returns: { items, cached, stale }

const crypto = require('crypto');

const TTL_SECONDS = 600; // 10 minutes
const FETCH_TIMEOUT_MS = 8000;

// In-memory fallback cache (dev)
const mem = globalThis.__KW_TX_MEM__ || new Map();
globalThis.__KW_TX_MEM__ = mem;

function isAddress(a) { return typeof a === 'string' && /^0x[a-fA-F0-9]{40}$/.test(a); }
function sha1(s) { return crypto.createHash('sha1').update(String(s)).digest('hex'); }

// Upstash helpers (optional)
function getKvCreds() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (url && token) return { url, token };
  return null;
}

async function kvGet(key) {
  const creds = getKvCreds();
  if (!creds) return null;
  const r = await fetch(`${creds.url}/get/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${creds.token}` } });
  if (!r.ok) return null;
  const j = await r.json();
  try { return j?.result ? JSON.parse(j.result) : null; } catch { return null; }
}

async function kvSetEx(key, value, ttlSec) {
  const creds = getKvCreds();
  if (!creds) return false;
  const r = await fetch(`${creds.url}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${creds.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: JSON.stringify(value), ex: ttlSec })
  });
  return r.ok;
}

function memGet(key) {
  const row = mem.get(key);
  if (!row) return null;
  if (Date.now() - row.t > TTL_SECONDS * 1000) return null;
  return row.v;
}
function memSet(key, value) { mem.set(key, { v: value, t: Date.now() }); }

function explorerBase(chain) {
  switch ((chain || '').toLowerCase()) {
    case 'eth':
    case 'ethereum': return 'https://etherscan.io';
    case 'bsc': return 'https://bscscan.com';
    case 'polygon': return 'https://polygonscan.com';
    case 'base': return 'https://basescan.org';
    case 'pulse':
    case 'pulsechain': return 'https://scan.pulsechain.com';
    default: return 'https://etherscan.io';
  }
}

function apiBase(chain) {
  switch ((chain || '').toLowerCase()) {
    case 'eth':
    case 'ethereum': return 'https://api.etherscan.io/api';
    case 'bsc': return 'https://api.bscscan.com/api';
    case 'polygon': return 'https://api.polygonscan.com/api';
    case 'base': return 'https://api.basescan.org/api';
    case 'pulse':
    case 'pulsechain': return process.env.PULSESCAN_BASE || 'https://api.scan.pulsechain.com/api';
    default: return null;
  }
}

function apiKeyFor(chain) {
  const c = (chain || '').toLowerCase();
  if (c === 'eth' || c === 'ethereum') return process.env.ETHERSCAN_KEY || process.env.VITE_ETHERSCAN_KEY || '';
  if (c === 'bsc') return process.env.BSCSCAN_KEY || process.env.VITE_BSCSCAN_KEY || '';
  if (c === 'polygon') return process.env.POLYGONSCAN_KEY || process.env.VITE_POLYGONSCAN_KEY || '';
  if (c === 'base') return process.env.BASESCAN_KEY || process.env.VITE_BASESCAN_KEY || '';
  if (c === 'pulse' || c === 'pulsechain') return process.env.PULSESCAN_KEY || process.env.VITE_PULSESCAN_KEY || '';
  return '';
}

function withTimeout(promise, ms) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  const run = async () => {
    try { return await promise(ctrl.signal); }
    finally { clearTimeout(id); }
  };
  return run();
}

async function fetchJson(url) {
  return withTimeout(async (signal) => {
    const r = await fetch(url, { signal });
    if (!r.ok) throw new Error(`upstream ${r.status}`);
    return r.json();
  }, FETCH_TIMEOUT_MS);
}

function toInt(x) { const n = Number(x); return Number.isFinite(n) ? Math.floor(n) : 0; }
function toISO(ts) { const n = toInt(ts); return new Date(n > 1e12 ? n : n * 1000).toISOString(); }

function fromWeiToUnit(nStr, decimals = 18) {
  try { const n = BigInt(String(nStr || '0')); return Number(n) / Math.pow(10, decimals); } catch { return 0; }
}

function normalizeNative(chain, rows) {
  return rows.map((r) => {
    // Some APIs return gasUsed, others require receipt; we keep fee optional
    const gasPrice = toInt(r.gasPrice);
    const gasUsed = toInt(r.gasUsed);
    const feeWei = (gasPrice && gasUsed) ? String(BigInt(gasPrice) * BigInt(gasUsed)) : undefined;
    return {
      chain,
      type: 'native',
      date: toISO(r.timeStamp || r.timestamp),
      hash: r.hash,
      from: r.from,
      to: r.to,
      amount: fromWeiToUnit(r.value, 18),
      token: null,
      fee: feeWei,
      link: `${explorerBase(chain)}/tx/${r.hash}`
    };
  });
}

function normalizeErc20(chain, rows) {
  return rows.map((r) => {
    const dec = toInt(r.tokenDecimal || r.decimals || 18);
    const amount = (() => {
      const v = String(r.value || r.amount || '0');
      try { return Number(BigInt(v)) / Math.pow(10, dec); } catch { return Number(v) / Math.pow(10, dec); }
    })();
    return {
      chain,
      type: 'erc20',
      date: toISO(r.timeStamp || r.timestamp),
      hash: r.hash,
      from: r.from,
      to: r.to,
      amount,
      token: {
        symbol: r.tokenSymbol || r.symbol || '',
        address: r.contractAddress || r.tokenAddress || '',
        name: r.tokenName || r.name || ''
      },
      link: `${explorerBase(chain)}/tx/${r.hash}`
    };
  });
}

async function fetchUpstream(chain, address) {
  const base = apiBase(chain);
  if (!base) throw new Error('unsupported chain');
  const key = apiKeyFor(chain);
  const common = `module=account&address=${address}&sort=desc&page=1&offset=100`;
  const txUrl = `${base}?action=txlist&${common}${key ? `&apikey=${encodeURIComponent(key)}` : ''}`;
  const tokUrl = `${base}?action=tokentx&${common}${key ? `&apikey=${encodeURIComponent(key)}` : ''}`;

  const [txJ, tokJ] = await Promise.all([
    fetchJson(txUrl).catch(() => ({ result: [] })),
    fetchJson(tokUrl).catch(() => ({ result: [] }))
  ]);

  const txRows = Array.isArray(txJ?.result) ? txJ.result : [];
  const tokRows = Array.isArray(tokJ?.result) ? tokJ.result : [];

  const items = [
    ...normalizeNative(chain, txRows),
    ...normalizeErc20(chain, tokRows)
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  return { items, ts: Date.now() };
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

    const chain = String(req.query.chain || '').toLowerCase();
    const address = String(req.query.address || '').toLowerCase();
    if (!chain) return res.status(400).json({ error: 'missing chain' });
    if (!isAddress(address)) return res.status(400).json({ error: 'invalid address' });

    const cacheKey = `kw:tx:v1:${chain}:${address}`;

    // Prefer KV cache
    const kv = getKvCreds();
    if (kv) {
      const cached = await kvGet(cacheKey);
      const fresh = cached && (Date.now() - (cached.ts || 0) < TTL_SECONDS * 1000);
      if (fresh) return res.status(200).json({ items: cached.items || [], cached: true, stale: false });

      // If expired, try to refresh once; on failure return stale cache
      try {
        const freshData = await fetchUpstream(chain, address);
        await kvSetEx(cacheKey, freshData, TTL_SECONDS);
        return res.status(200).json({ items: freshData.items, cached: false, stale: false });
      } catch (e) {
        if (cached) return res.status(200).json({ items: cached.items || [], cached: true, stale: true });
        return res.status(500).json({ error: e.message || 'upstream error' });
      }
    }

    // In-memory fallback (dev)
    const inMem = memGet(cacheKey);
    const freshMem = inMem && (Date.now() - (inMem.ts || 0) < TTL_SECONDS * 1000);
    if (freshMem) return res.status(200).json({ items: inMem.items || [], cached: true, stale: false });

    try {
      const freshData = await fetchUpstream(chain, address);
      memSet(cacheKey, freshData);
      return res.status(200).json({ items: freshData.items, cached: false, stale: false });
    } catch (e) {
      if (inMem) return res.status(200).json({ items: inMem.items || [], cached: true, stale: true });
      return res.status(500).json({ error: e.message || 'upstream error' });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message || 'server error' });
  }
};
