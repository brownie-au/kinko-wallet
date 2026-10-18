import { formatTokenUnits } from '../utils/tokenMath.js';
const BASE = import.meta.env.VITE_POLYGON_BLOCKSCOUT_V1 || 'https://polygon.blockscout.com/api';
export async function getPolygonNativeBalanceExact(address) {
  const res = await fetch(`${BASE}?module=account&action=balance&address=${address}`, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error('Native balance unavailable');
  const data = await res.json();
  if (data.status !== '1' || !/^\d+$/.test(String(data.result))) throw new Error('Invalid native balance response');
  return formatTokenUnits(data.result, 18);
}

export async function getPolygonNativeBalance(address) {
  return Number(await getPolygonNativeBalanceExact(address));
}
