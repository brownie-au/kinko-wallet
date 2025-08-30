// src/services/globalMarketService.js
/* Free & open: CoinGecko global market cap + 24h volume history.
   Docs: https://docs.coingecko.com/reference/global-market-cap-chart */

const COINGECKO_URL = 'https://api.coingecko.com/api/v3/global/market_cap_chart?vs_currency=usd&days=';

/** Get ~1y of daily points (market cap + volume), then map into rows */
export async function fetchGlobalDaily(days = 370) {
  const res = await fetch(`${COINGECKO_URL}${days}`);
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
  const json = await res.json();
  const mc = json?.market_cap_chart?.market_cap ?? [];
  const vol = json?.market_cap_chart?.volume ?? [];

  // timestamp → volume lookup
  const volMap = new Map(vol.map(([t, v]) => [t, v]));

  // rows: { t: ms, marketCap: number, volume: number }
  return mc.map(([t, cap]) => ({
    t,
    marketCap: cap,
    volume: volMap.get(t) ?? null
  }));
}

/** Downsample daily rows to exactly 52 weekly points (ISO week, avg per week) */
export function toWeekly52(rows) {
  const byWeek = new Map();
  for (const r of rows) {
    const d = new Date(r.t);
    // ISO week start (Mon): convert Sun(0)…Sat(6) to Mon(0)…Sun(6)
    const day = (d.getUTCDay() + 6) % 7;
    const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
    const k = monday.toISOString().slice(0, 10); // YYYY-MM-DD
    const acc = byWeek.get(k) || { t: monday.getTime(), cap: 0, vol: 0, n: 0 };
    acc.cap += r.marketCap;
    acc.vol += r.volume ?? 0;
    acc.n += 1;
    byWeek.set(k, acc);
  }
  const weekly = [...byWeek.values()].sort((a, b) => a.t - b.t).map((w) => ({ t: w.t, marketCap: w.cap / w.n, volume: w.vol / w.n }));

  return weekly.slice(-52); // last 52 weeks only
}
