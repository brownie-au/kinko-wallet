// Ethereum balance + token discovery using free public APIs (no QuickNode, no Moralis)
// Now powered entirely by FreeCryptoAPI — clean, fast, and CORS-safe.

import { getEthTokensFromBlockscout, toUnits } from './ethBlockscoutService';
import { formatTokenUnits } from '../utils/tokenMath';
import { getEthNativeBalance } from './ethRpcService';
import { isTokenBlacklisted } from '../data/tokenBlocklist';
import axios from 'axios';
import { getEthUsdPrice as getEthUsdPriceFallback } from './ethPriceService';
import { enrichErc20Prices } from './ethErc20PriceService';
import { getCachedJSON, setCachedJSON } from '../utils/kinkoCache';

// ----------------- CONFIG -----------------
const PAPRIKA_BASE = 'https://api.coinpaprika.com/v1';
const PAPRIKA_ETH_ID = 'eth-ethereum';
const PRICE_CACHE_TTL_MS = Number(import.meta.env.VITE_PRICE_CACHE_TTL_SEC ?? 60) * 1000;
const CACHE_TTL_MS = Number(import.meta.env.VITE_WALLET_CACHE_TTL_MIN ?? 10) * 60000;

// Spam + blocklist
const ETH_HIDE_MIN_USD = Number(import.meta.env.VITE_ETH_HIDE_USD_MIN ?? 0);
const ENV_BLOCKLIST = new Set(
  (import.meta.env.VITE_ETH_BLOCKLIST || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);
const STATIC_BLOCKLIST = new Set([]);

// ---------- utils ----------
const toNum = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

const row = ({ address, symbol, name, decimals, balance }) => ({
  chain: 'eth',
  address: address ? String(address).toLowerCase() : 'native',
  symbol: symbol || '',
  name: name || '',
  decimals: Number(decimals ?? 18),
  balance: Number(balance ?? 0),
  priceUSD: 0,
  price: 0,
  usd: 0
});

// ---------- Known tokens ----------
const EHEX_CONTRACT = '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39';
const USDC_CONTRACT = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const KNOWN_TOKENS = {
  [EHEX_CONTRACT.toLowerCase()]: { symbol: 'eHEX', name: 'HEX (Ethereum)', decimals: 8 },
  [USDC_CONTRACT.toLowerCase()]: { symbol: 'USDC', name: 'USD Coin', decimals: 6 }
};
function applyKnownTokenFixes(list = []) {
  for (const t of list) {
    if (!t || t.address === 'native') continue;
    const fix = KNOWN_TOKENS[String(t.address || '').toLowerCase()];
    if (fix) Object.assign(t, fix);
  }
  return list;
}

// ---------- Spam filter ----------
function filterEthSpam(tokens) {
  const isBlocked = (addr) => {
    const a = (addr || '').toLowerCase();
    return a && (STATIC_BLOCKLIST.has(a) || ENV_BLOCKLIST.has(a));
  };
  return tokens.filter((t) => {
    if (t.address === 'native') return true;
    if (isBlocked(t.address)) return false;
    if (isTokenBlacklisted && isTokenBlacklisted({ address: t.address, symbol: t.symbol, name: t.name })) return false;
    if (ETH_HIDE_MIN_USD > 0 && Number(t.usd || 0) < ETH_HIDE_MIN_USD) return false;
    const hasPrice = Number(t.price || t.priceUSD || 0) > 0;
    const hasMeta = Boolean((t.symbol || '').trim()) || Boolean((t.name || '').trim());
    return hasPrice || hasMeta;
  });
}

// ---------- ETH price ----------
async function getEthUsdFromPaprika() {
  const cacheKey = 'price:eth:usd:paprika';
  const cachedObj = getCachedJSON(cacheKey, PRICE_CACHE_TTL_MS);
  const cached = cachedObj?.data;
  if (Number.isFinite(Number(cached)) && Number(cached) > 0) return Number(cached);
  try {
    const { data } = await axios.get(`${PAPRIKA_BASE}/tickers/${PAPRIKA_ETH_ID}`, { timeout: 8000 });
    const price = Number(data?.quotes?.USD?.price || 0);
    if (price > 0) {
      setCachedJSON(cacheKey, price);
      return price;
    }
  } catch {}
  return 0;
}
async function getEthUsdPricePrimary() {
  const p = await getEthUsdFromPaprika();
  if (p > 0) return p;
  try {
    const f = await getEthUsdPriceFallback();
    return Number(f) || 0;
  } catch {
    return 0;
  }
}
async function enrichEthPrice(tokens) {
  try {
    const ethUsd = await getEthUsdPricePrimary();
    if (!Array.isArray(tokens) || !(ethUsd > 0)) return tokens;
    const native = tokens.find((t) => t.address === 'native');
    if (native) {
      native.priceUSD = ethUsd;
      native.price = ethUsd;
      native.usd = toNum(native.balance, 0) * ethUsd;
    }
  } catch {}
  return tokens;
}
async function enrichAllPrices(tokens) {
  await enrichEthPrice(tokens);
  await enrichErc20Prices(tokens);
  return tokens;
}

// ---------- Native ETH ----------
export async function fetchNativeETH(address) {
  const balance = await getEthNativeBalance(address);
  return row({ address: 'native', symbol: 'ETH', name: 'Ether', decimals: 18, balance });
}

export async function fetchERC20Tokens(address, opts = {}) {
  const tokens = await getEthTokensFromBlockscout(address, opts);
  return tokens.map((t) => ({
    ...row({ ...t, balance: toUnits(t.balanceRaw, t.decimals) }),
    balanceRaw: t.balanceRaw,
    amountExact: formatTokenUnits(t.balanceRaw, t.decimals),
    possible_spam: t.possible_spam
  }));
}

// ---------- Public API ----------
export async function fetchEthereumTokens(address, { force = false } = {}) {
  const key = `eth:tokens:v2:${(address || '').toLowerCase()}`;
  let cachedArr = null;
  if (!force) {
    const cachedRaw = getCachedJSON(key, CACHE_TTL_MS)?.data;
    cachedArr = Array.isArray(cachedRaw) ? cachedRaw : Array.isArray(cachedRaw?.tokens) ? cachedRaw.tokens : null;
    if (cachedArr) {
      const fixed = applyKnownTokenFixes(cachedArr.slice());
      const priced = await enrichAllPrices(fixed);
      const cleaned = filterEthSpam(priced);
      setCachedJSON(key, cleaned);
      return cleaned;
    }
  }

  const [nativeRow, erc20] = await Promise.all([fetchNativeETH(address), fetchERC20Tokens(address, { force })]);
  const baseList = [nativeRow, ...erc20];
  applyKnownTokenFixes(baseList);
  const result = await enrichAllPrices(baseList);
  const cleaned = filterEthSpam(result);
  setCachedJSON(key, cleaned);
  return cleaned;
}

export async function refreshEthereumTokens(address) {
  const fresh = await fetchEthereumTokens(address, { force: true });
  setCachedJSON(`eth:tokens:v2:${(address || '').toLowerCase()}`, fresh);
  return fresh;
}
