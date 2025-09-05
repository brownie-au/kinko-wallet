// src/services/polygonRpcService.js
// Lightweight native balance fetch for Polygon via Blockscout compat API.
// No RPC key required.

const BS_V1 = (import.meta.env.VITE_POLYGON_BLOCKSCOUT_V1 || 'https://polygon.blockscout.com/api').replace(/\/+$/, '');

export async function getPolygonNativeBalance(address) {
  try {
    const url = `${BS_V1}?module=account&action=balance&address=${address}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const wei = String(json?.result ?? '0');
    // convert to 1e18 (MATIC units)
    const whole = BigInt(wei) / (10n ** 18n);
    const frac = BigInt(wei) % (10n ** 18n);
    const fracStr = frac.toString().padStart(18, '0').slice(0, 6); // 6dp for UI
    return Number(`${whole}.${fracStr}`);
  } catch {
    return 0;
  }
}

