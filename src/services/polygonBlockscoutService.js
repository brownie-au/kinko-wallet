// src/services/polygonBlockscoutService.js
// Polygon (PoS) token discovery via Blockscout (no API key required).
// - Env overrides supported: VITE_POLYGON_BLOCKSCOUT_V2 / VITE_POLYGON_BLOCKSCOUT_V1
// - Defaults to https://polygon.blockscout.com
// - Returns: [{ address, symbol, name, decimals, balanceRaw }]

/* ---------- Endpoint setup from .env ---------- */
const BS_V2 = (import.meta.env.VITE_POLYGON_BLOCKSCOUT_V2 || 'https://polygon.blockscout.com/api/v2').replace(/\/+$/, '');
const BS_V1 = (import.meta.env.VITE_POLYGON_BLOCKSCOUT_V1 || 'https://polygon.blockscout.com/api').replace(/\/+$/, '');
// Host root (e.g., https://polygon.blockscout.com)
const BS_HOST =
  (BS_V2 && BS_V2.replace(/\/api\/v2.*/i, '')) ||
  (BS_V1 && BS_V1.replace(/\/api.*/i, '')) ||
  'https://polygon.blockscout.com';

/* ---------- tiny cache helpers ---------- */
const lsGet = (k, maxAgeMs) => {
  try {
    const raw = localStorage.getItem(k);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (maxAgeMs && Date.now() - (obj.ts || 0) > maxAgeMs) return null;
    return obj.data ?? null;
  } catch { return null; }
};
const lsSet = (k, data) => {
  try { localStorage.setItem(k, JSON.stringify({ ts: Date.now(), data })); } catch { }
};

/* ---------- normaliser ---------- */
function normaliseItem(it) {
  const t = it.token || it;
  const addr = (t?.address || t?.contract_address || t?.contractAddress || '').toLowerCase();
  const dec = Number(t?.decimals ?? it?.decimals ?? 18);
  const bal = String(it?.value ?? it?.token_balance ?? it?.balance ?? '0');
  return {
    address: addr,
    symbol: t?.symbol || '',
    name: t?.name || '',
    decimals: Number.isFinite(dec) ? dec : 18,
    balanceRaw: bal
  };
}

/* ---------- v2: /api/v2/addresses/{addr}/token-balances (preferred) ---------- */
async function fetchV2TokenBalances(address) {
  const base = `${BS_V2}/addresses/${address}/token-balances`;
  const out = [];
  let url = `${base}?type=ERC-20&filter=positive&page_size=200`;

  for (let guard = 0; guard < 25; guard++) {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Blockscout v2 HTTP ${res.status}`);
    const json = await res.json();

    const items = Array.isArray(json?.items) ? json.items
      : Array.isArray(json?.token_balances) ? json.token_balances
        : Array.isArray(json) ? json
          : [];
    for (const it of items) out.push(normaliseItem(it));

    const next = json?.next_page_params || json?.next_page_path || null;
    if (!next) break;
    url = typeof next === 'string'
      ? (next.startsWith('http') ? next : `${BS_HOST}${next}`)
      : `${base}?` + new URLSearchParams(next);
  }
  return out;
}

/* ---------- fallback: Etherscan-compatible /api?module=account&action=tokenlist ---------- */
async function fetchCompatTokenList(address) {
  const url = `${BS_V1}?module=account&action=tokenlist&address=${address}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Blockscout compat HTTP ${res.status}`);
  const json = await res.json();
  if (json?.status !== '1') return [];
  return (json.result || []).map((t) =>
    normaliseItem({
      token: {
        address: t.contractAddress,
        symbol: t.symbol,
        name: t.name,
        decimals: t.decimals
      },
      balance: t.balance
    })
  );
}

/**
 * Public API: get all ERC-20 balances for a Polygon address from Blockscout.
 */
export async function getPolygonTokensFromBlockscout(address, opts = {}) {
  const cacheKey = `kw:bs:polygon:tokens:${address.toLowerCase()}`;
  const cacheMs = opts.cacheMs ?? 5 * 60 * 1000; // 5 min default
  const cached = lsGet(cacheKey, cacheMs);
  if (cached) return cached;

  let list = [];
  try {
    list = await fetchV2TokenBalances(address);
  } catch {
    try { list = await fetchCompatTokenList(address); } catch { list = []; }
  }

  const filtered = list.filter(it => it && it.address && it.balanceRaw && it.balanceRaw !== '0');
  lsSet(cacheKey, filtered);
  return filtered;
}

// Re-export toUnits from the ETH helper to avoid duplication
export { toUnits } from './ethBlockscoutService';

