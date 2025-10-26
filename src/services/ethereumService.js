// src/services/ethereumService.js
// Ethereum balances via backend proxy to QuickNode.
// Keeps API keys private (no VITE_QUICKNODE_HTTP in client bundle).
// Same behaviour as before, but routes all RPCs through /api/ethproxy.

import { isTokenBlacklisted } from '../data/tokenBlocklist';
import axios from 'axios';
import { getEthUsdPrice as getEthUsdPriceFallback } from './ethPriceService';
import { enrichErc20Prices } from './ethErc20PriceService';
import { getCachedJSON, setCachedJSON } from '../utils/kinkoCache';

// ----------------- CONFIG -----------------
const ETHPLORER = 'https://api.ethplorer.io';
const ETHPLORER_KEY = import.meta.env.VITE_ETHPLORER_KEY || 'freekey';
const ETHERSCAN_BASE = 'https://api.etherscan.io/api';
const ETHERSCAN_KEY = import.meta.env.VITE_ETHERSCAN_KEY || '';
const MORALIS_BASE = import.meta.env.VITE_MORALIS_API_BASE || 'https://deep-index.moralis.io/api/v2';
const MORALIS_KEY = import.meta.env.VITE_MORALIS_API_KEY || '';

const PAPRIKA_BASE = 'https://api.coinpaprika.com/v1';
const PAPRIKA_ETH_ID = 'eth-ethereum';
const PRICE_CACHE_TTL_MS = Number(import.meta.env.VITE_PRICE_CACHE_TTL_SEC ?? 60) * 1000;

const CACHE_TTL_MS = Number(import.meta.env.VITE_WALLET_CACHE_TTL_MIN ?? 10) * 60_000;
const DEBUG = !!import.meta.env.DEV;
const log = (...a) => DEBUG && console.log('%c[ETH]', 'color:#9cf', ...a);

const QUICKNODE_PROXY = import.meta.env.VITE_ETH_PROXY_URL || '/api/ethproxy';
const QUICKNODE_WARNING_REASON = 'QuickNode RPC proxy missing (set VITE_ETH_PROXY_URL) - using public RPC/API fallbacks for Ethereum.';

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
const toBN = (hex) => {
  if (!hex) return 0n;
  const s = String(hex);
  return s.startsWith('0x') ? BigInt(s) : BigInt(`0x${s}`);
};
const POW10N = (d) => 10n ** BigInt(d);
function bigIntToDecimal(bi, decimals) {
  try {
    const base = POW10N(decimals);
    const whole = bi / base;
    const frac = bi % base;
    const keep = Math.min(9, Math.max(0, decimals));
    const scale = POW10N(decimals - keep);
    const fracScaled = Number(frac / scale);
    return Number(whole) + fracScaled / 10 ** keep;
  } catch { return 0; }
}
function toDecimal(raw, decimals = 18) {
  try {
    if (raw == null) return 0;
    if (typeof raw === 'bigint') return bigIntToDecimal(raw, decimals);
    const s = String(raw);
    if (/^\d+$/.test(s)) return bigIntToDecimal(BigInt(s), decimals);
    const n = Number(raw);
    return Number.isFinite(n) ? (decimals ? n / 10 ** decimals : n) : 0;
  } catch { return 0; }
}
const weiToEth = (weiBig) => {
  try {
    const w = typeof weiBig === 'bigint' ? weiBig : BigInt(weiBig ?? 0);
    return bigIntToDecimal(w, 18);
  } catch { return 0; }
};
const toNum = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

const SIG = {
  balanceOf: '0x70a08231',
  decimals: '0x313ce567',
  symbol: '0x95d89b41',
  name: '0x06fdde03'
};
function encodeBalanceOfData(address) {
  const a = address.toLowerCase().replace(/^0x/, '');
  const padded = a.padStart(64, '0');
  return SIG.balanceOf + padded;
}
function tryDecodeString(hex) {
  if (!hex || hex === '0x') return '';
  try {
    const data = hex.replace(/^0x/, '');
    const offset = parseInt(data.slice(0, 64), 16);
    if (offset >= 64 && data.length >= offset + 64) {
      const len = parseInt(data.slice(offset, offset + 64), 16);
      const strHex = data.slice(offset + 64, offset + 64 + len * 2);
      const bytes = strHex.match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) || [];
      return new TextDecoder().decode(new Uint8Array(bytes)).replace(/\u0000/g, '').trim();
    }
  } catch { }
  return '';
}
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
  [EHEX_CONTRACT]: { symbol: 'eHEX', name: 'HEX (Ethereum)', decimals: 8 },
  [USDC_CONTRACT]: { symbol: 'USDC', name: 'USD Coin', decimals: 6 }
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
    if (!hasPrice && !hasMeta) return false;
    return true;
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
  } catch { }
  return 0;
}
async function getEthUsdPricePrimary() {
  const p = await getEthUsdFromPaprika();
  if (p > 0) return p;
  try {
    const f = await getEthUsdPriceFallback();
    return Number(f) || 0;
  } catch { return 0; }
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
  } catch { }
  return tokens;
}
async function enrichAllPrices(tokens) {
  await enrichEthPrice(tokens);
  await enrichErc20Prices(tokens);
  return tokens;
}

// ---------- Backend Proxy ----------
async function rpcProxy(method, params, id = 1) {
  const body = { jsonrpc: '2.0', id, method, params };
  const r = await fetch(QUICKNODE_PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error('Proxy RPC failed');
  const data = await r.json();
  if (data?.error) throw new Error(data.error?.message || 'RPC error');
  return data?.result;
}
async function ethCall(to, data) {
  return rpcProxy('eth_call', [{ to, data }, 'latest']);
}

// ---------- Native ETH ----------
async function fetchNativeETH(address) {
  try {
    const hex = await rpcProxy('eth_getBalance', [address, 'latest']);
    const eth = weiToEth(toBN(hex));
    return row({ address: 'native', symbol: 'ETH', name: 'Ether', decimals: 18, balance: eth });
  } catch (e) {
    console.error('[ETH] native balance error:', e?.message);
    return row({ address: 'native', symbol: 'ETH', name: 'Ether', decimals: 18, balance: 0 });
  }
}

// ---------- ERC-20 discovery ----------
async function fetchERC20sFromQuickNode(address) {
  try {
    const res = await rpcProxy('qn_getTokenBalances', [address]);
    const arr = res?.assets || res || [];
    return arr.map((t) =>
      row({
        address: t?.contractAddress,
        symbol: t?.symbol,
        name: t?.name,
        decimals: Number(t?.decimals ?? 18),
        balance: toDecimal(t?.balance ?? 0, Number(t?.decimals ?? 18))
      })
    ).filter((t) => t.balance > 0);
  } catch {
    return [];
  }
}

// ---------- Public API ----------
export async function fetchEthereumTokens(address, { force = false } = {}) {
  const key = `eth:tokens:${(address || '').toLowerCase()}`;
  let cachedArr = null;
  if (!force) {
    const cachedRaw = getCachedJSON(key, CACHE_TTL_MS)?.data;
    cachedArr = Array.isArray(cachedRaw)
      ? cachedRaw
      : Array.isArray(cachedRaw?.tokens)
        ? cachedRaw.tokens
        : null;
    if (cachedArr) {
      const fixed = applyKnownTokenFixes(cachedArr.slice());
      const priced = await enrichAllPrices(fixed);
      const cleaned = filterEthSpam(priced);
      setCachedJSON(key, cleaned);
      return cleaned;
    }
  }

  const [nativeRow, qnErc20] = await Promise.all([
    fetchNativeETH(address),
    fetchERC20sFromQuickNode(address)
  ]);

  let erc20 = qnErc20;
  if (!erc20.length) erc20 = await fetchERC20sFromQuickNode(address); // retry proxy

  const baseList = [nativeRow, ...erc20];
  applyKnownTokenFixes(baseList);
  const result = await enrichAllPrices(baseList);
  const cleaned = filterEthSpam(result);
  setCachedJSON(key, cleaned);
  return cleaned;
}

export async function refreshEthereumTokens(address) {
  const fresh = await fetchEthereumTokens(address, { force: true });
  setCachedJSON(`eth:tokens:${(address || '').toLowerCase()}`, fresh);
  return fresh;
}
