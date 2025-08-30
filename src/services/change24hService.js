// src/services/change24hService.js
/* eslint-disable import/no-relative-parent-imports */

// Build a canonical “key” that matches Portfolio/TopTokens usage
export const tokenKey = (t) =>
  `${String(t?.chain || '').toLowerCase()}:${(
    t?.address ||
    t?.contract ||
    (String(t?.symbol).toUpperCase() === 'PLS' ? 'native' : '') ||
    ''
  ).toLowerCase()}:${(t?.symbol || '').toUpperCase()}`;

/**
 * Fetch 24h % change for a batch of tokens that HAVE an on‑chain contract address
 * via DexScreener. Returns Map<tokenKey, number|null>.
 *
 * We batch addresses (DexScreener supports comma‑separated list, ~30 per call is safe).
 */
export async function fetchChange24hFromDexScreener(tokens) {
  // keep only tokens with a contract address
  const withAddr = (tokens || []).filter((t) => t?.address || t?.contract);
  const addrList = withAddr.map((t) => (t.address || t.contract).toLowerCase());

  const out = new Map();
  if (addrList.length === 0) return out;

  const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, (i + 1) * n));

  // DexScreener: https://api.dexscreener.com/latest/dex/tokens/0x...,0x...
  for (const group of chunk(addrList, 30)) {
    try {
      const url = `https://api.dexscreener.com/latest/dex/tokens/${group.join(',')}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();

      // data.pairs[]; pick the pair with the best liquidity or first entry.
      // Each pair has: priceChange: { h24: number }
      const byAddr = new Map();
      for (const p of data?.pairs || []) {
        const addr = (p?.baseToken?.address || '').toLowerCase();
        // prefer pair with highest liquidity if multiple
        const prev = byAddr.get(addr);
        const liq = Number(p?.liquidity?.usd || 0);
        if (!prev || liq > prev._liq) byAddr.set(addr, { _liq: liq, h24: Number(p?.priceChange?.h24 ?? NaN) });
      }

      // write back mapped by tokenKey
      for (const t of withAddr) {
        const addr = (t.address || t.contract).toLowerCase();
        const k = tokenKey(t);
        const hit = byAddr.get(addr);
        if (hit && Number.isFinite(hit.h24)) out.set(k, hit.h24);
      }
    } catch {
      // ignore batch errors, continue
    }
  }
  return out;
}
