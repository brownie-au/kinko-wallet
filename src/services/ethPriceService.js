// src/services/ethPriceService.js
// Standalone ETH→USD price with localStorage caching.
// Order: Dexscreener (WETH, best-liquidity) → Coinbase → Coingecko.

import axios from 'axios';

const DS = 'https://api.dexscreener.com/latest/dex/tokens';
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const CB  = 'https://api.coinbase.com/v2/prices/ETH-USD/spot';
const CG  = 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd';

const PRICE_CACHE_KEY = 'kw:eth:usd';
const PRICE_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

const num = (x, d = 0) => (Number.isFinite(Number(x)) ? Number(x) : d);

function bestPriceFromPairs(pairs) {
  if (!Array.isArray(pairs)) return 0;
  let best = 0, bestLiq = -1;
  for (const p of pairs) {
    const price = num(p?.priceUsd, 0);
    const liq = num(p?.liquidity?.usd, 0);
    if (price > 0 && liq >= bestLiq) { best = price; bestLiq = liq; }
  }
  return best;
}

function getCached() {
  try {
    const raw = localStorage.getItem(PRICE_CACHE_KEY);
    if (!raw) return null;
    const { v, t } = JSON.parse(raw);
    if (Date.now() - t < PRICE_CACHE_TTL_MS) return Number(v) || 0;
  } catch {}
  return null;
}

function setCached(v) {
  try { localStorage.setItem(PRICE_CACHE_KEY, JSON.stringify({ v, t: Date.now() })); } catch {}
}

export async function getEthUsdPrice() {
  const cached = getCached();
  if (cached) return cached;

  // 1) Dexscreener (WETH, best-liquidity)
  try {
    const { data } = await axios.get(`${DS}/${WETH}`, { timeout: 8000 });
    const p = bestPriceFromPairs(data?.pairs || []);
    if (p > 0) { setCached(p); return p; }
  } catch {}

  // 2) Coinbase
  try {
    const { data } = await axios.get(CB, { timeout: 8000 });
    const p = num(data?.data?.amount, 0);
    if (p > 0) { setCached(p); return p; }
  } catch {}

  // 3) Coingecko
  try {
    const { data } = await axios.get(CG, { timeout: 8000 });
    const p = num(data?.ethereum?.usd, 0);
    if (p > 0) { setCached(p); return p; }
  } catch {}

  return cached || 0;
}
