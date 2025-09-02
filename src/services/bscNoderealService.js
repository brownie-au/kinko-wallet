// src/services/bscNoderealService.js
// Binance Smart Chain token discovery via NodeReal Token APIs.
// Primary: NodeReal Open Platform (configurable base) with X-API-Key header.
// Fallback: BscScan-compatible tokenlist (if key supplied) or empty.

const NR_BASE = (import.meta.env.VITE_NODEREAL_BSC_BASE || '').replace(/\/+$/, '');
const NR_KEY = (import.meta.env.VITE_NODEREAL_BSC_API_KEY || '').trim();
const BSCSCAN_KEY = (import.meta.env.VITE_BSCSCAN_KEY || '').trim();

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const lsGet = (k, maxAgeMs) => {
  try {
    const raw = localStorage.getItem(k);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (maxAgeMs && Date.now() - (obj.ts || 0) > maxAgeMs) return null;
    return obj.data ?? null;
  } catch { return null; }
};
const lsSet = (k, data) => { try { localStorage.setItem(k, JSON.stringify({ ts: Date.now(), data })); } catch { } };

function normaliseItem(it) {
  // Attempt to normalise from a variety of shapes.
  // NodeReal variants we try to handle: {token:{address,symbol,name,decimals}, balance} or flat.
  const t = it?.token || it;
  const addr = (t?.address || t?.contract || t?.contract_address || t?.contractAddress || '').toLowerCase();
  const decimals = Number(t?.decimals ?? it?.decimals ?? 18);
  const balanceRaw = String(it?.balance ?? it?.value ?? it?.token_balance ?? '0');
  return {
    address: addr,
    symbol: t?.symbol || '',
    name: t?.name || '',
    decimals: Number.isFinite(decimals) ? decimals : 18,
    balanceRaw
  };
}

async function fetchFromNodeReal(address) {
  if (!NR_BASE || !NR_KEY) return [];
  const headers = { 'Accept': 'application/json', 'X-API-Key': NR_KEY };

  // Try a few common paths used by NodeReal products; stop on first success.
  const candidates = [
    `${NR_BASE}/addresses/${address}/token-balances`,
    `${NR_BASE}/addresses/${address}/tokens`,
    `${NR_BASE}/accounts/${address}/token-balances`,
    `${NR_BASE}/account/${address}/token-balances`
  ];

  for (const url of candidates) {
    try {
      const res = await fetch(url, { headers, credentials: 'omit' });
      if (!res.ok) continue;
      const j = await res.json();
      const items = Array.isArray(j?.items) ? j.items
        : Array.isArray(j?.result) ? j.result
        : Array.isArray(j?.data) ? j.data
        : Array.isArray(j) ? j : [];
      const out = items.map(normaliseItem).filter((r) => r.address && r.balanceRaw && r.balanceRaw !== '0');
      if (out.length) return out;
    } catch { /* try next */ }
  }
  return [];
}

async function fetchFromBscScan(address) {
  const key = BSCSCAN_KEY ? `&apikey=${encodeURIComponent(BSCSCAN_KEY)}` : '';
  const url = `https://api.bscscan.com/api?module=account&action=tokenlist&address=${address}${key}`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, credentials: 'omit' });
    if (!res.ok) return [];
    const j = await res.json();
    const list = Array.isArray(j?.result) ? j.result : [];
    return list.map((t) => normaliseItem({ token: { address: t.contractAddress, symbol: t.symbol, name: t.name, decimals: t.decimals }, balance: t.balance }));
  } catch { return []; }
}

/**
 * Public API: get ERC-20 balances for a BSC address via NodeReal.
 * Falls back to BscScan-compatible tokenlist if NodeReal fails to return anything.
 * Returns: [{ address, symbol, name, decimals, balanceRaw }]
 */
export async function getBscTokensFromNodereal(address) {
  const cacheKey = `kw:nr:bsc:tokens:${address.toLowerCase()}`;
  const cached = lsGet(cacheKey, CACHE_TTL);
  if (cached) return cached;

  let list = await fetchFromNodeReal(address);
  if (!list.length) {
    const fb = await fetchFromBscScan(address);
    if (fb.length) list = fb;
  }

  const filtered = list.filter((it) => it && it.address && it.balanceRaw && it.balanceRaw !== '0');
  lsSet(cacheKey, filtered);
  return filtered;
}

// Convenience: convert integer string -> number with N decimals
export function toUnitsBsc(balanceRaw, decimals = 18, precision = 6) {
  try {
    const bi = BigInt(balanceRaw);
    const base = 10n ** BigInt(decimals);
    const whole = bi / base;
    const frac = (bi % base).toString().padStart(decimals, '0').slice(0, precision);
    return Number(`${whole}.${frac}`);
  } catch { return 0; }
}

