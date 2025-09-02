// src/services/ethereumService.js
// Ethereum balances via QuickNode RPC (native ETH + token methods)
// with Moralis → Etherscan+on-chain → Ethplorer fallbacks for ERC-20s.
// SAFE pricing: native ETH (CoinPaprika primary → ethPriceService fallback) + ERC-20s (Dexscreener best-liquidity).
// Includes spam filtering: blocklist + "no price & no metadata" + optional min USD.

import { isTokenBlacklisted } from '../data/tokenBlocklist';
import axios from 'axios';
import { getEthUsdPrice as getEthUsdPriceFallback } from './ethPriceService';
import { enrichErc20Prices } from './ethErc20PriceService';
import { getCachedJSON, setCachedJSON } from '../utils/kinkoCache';

const QN_URL = import.meta.env.VITE_QUICKNODE_HTTP || '';
const ETHPLORER = 'https://api.ethplorer.io';
const ETHPLORER_KEY = import.meta.env.VITE_ETHPLORER_KEY || 'freekey';
const ETHERSCAN_BASE = 'https://api.etherscan.io/api';
const ETHERSCAN_KEY = import.meta.env.VITE_ETHERSCAN_KEY || '';
const MORALIS_BASE = import.meta.env.VITE_MORALIS_API_BASE || 'https://deep-index.moralis.io/api/v2';
const MORALIS_KEY = import.meta.env.VITE_MORALIS_API_KEY || '';

// ---- CoinPaprika (PRIMARY ETH PRICE) ----
const PAPRIKA_BASE = 'https://api.coinpaprika.com/v1';
const PAPRIKA_ETH_ID = 'eth-ethereum';
const PRICE_CACHE_TTL_MS = Number(import.meta.env.VITE_PRICE_CACHE_TTL_SEC ?? 60) * 1000;

const CACHE_TTL_MS = Number(import.meta.env.VITE_WALLET_CACHE_TTL_MIN ?? 10) * 60_000;
const DEBUG = !!import.meta.env.DEV;
const log = (...a) => DEBUG && console.log('%c[ETH]', 'color:#9cf', ...a);

// ---- spam controls (edit via .env without code changes) ----
const ETH_HIDE_MIN_USD = Number(import.meta.env.VITE_ETH_HIDE_USD_MIN ?? 0); // e.g. 0.01
const ENV_BLOCKLIST = new Set(
  (import.meta.env.VITE_ETH_BLOCKLIST || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);
// You can hardcode known-bad contracts here if you want:
const STATIC_BLOCKLIST = new Set([
  // '0xdead...beef'
]);

// Limits for Etherscan discovery to avoid huge wallets hammering RPC
const MAX_DISCOVERED = 60;
const READ_TIMEOUT = 12_000;

// ---------- utils ----------
const toBN = (hex) => {
  if (!hex) return 0n;
  const s = String(hex);
  return s.startsWith('0x') ? BigInt(s) : BigInt(`0x${s}`);
};

// PRECISION-SAFE BigInt → decimal helpers (avoid float overflow/rounding)
const POW10N = (d) => 10n ** BigInt(d);

/** Convert a bigint integer representing base-10^decimals units to a JS Number safely. */
function bigIntToDecimal(bi, decimals) {
  try {
    const base = POW10N(decimals);
    const whole = bi / base;
    const frac = bi % base;

    // keep up to 9 fractional digits to limit FP error
    const keep = Math.min(9, Math.max(0, decimals));
    const scale = POW10N(decimals - keep);
    const fracScaled = Number(frac / scale); // now fits into Number safely
    return Number(whole) + fracScaled / 10 ** keep;
  } catch {
    return 0;
  }
}

/** Accepts bigint | decimal string | number and converts using decimals. */
function toDecimal(raw, decimals = 18) {
  try {
    if (raw == null) return 0;
    if (typeof raw === 'bigint') return bigIntToDecimal(raw, decimals);
    const s = String(raw);
    if (/^\d+$/.test(s)) return bigIntToDecimal(BigInt(s), decimals);
    // last resort
    const n = Number(raw);
    return Number.isFinite(n) ? (decimals ? n / 10 ** decimals : n) : 0;
  } catch {
    return 0;
  }
}

// ETH wei → ETH using precision-safe conversion
const weiToEth = (weiBig) => {
  try {
    const w = typeof weiBig === 'bigint' ? weiBig : BigInt(weiBig ?? 0);
    return bigIntToDecimal(w, 18);
  } catch {
    return 0;
  }
};

const toNum = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

// Encode ERC-20 calls
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
  try {
    const bytes = hex.replace(/^0x/, '').slice(0, 64);
    const buf = bytes.match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) || [];
    return new TextDecoder().decode(new Uint8Array(buf)).replace(/\u0000/g, '').trim();
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

// ---------- Known token overrides ----------
const EHEX_CONTRACT = '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39'; // eHEX
const USDC_CONTRACT = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'; // USDC

const KNOWN_TOKENS = {
  [EHEX_CONTRACT]: { symbol: 'eHEX', name: 'HEX (Ethereum)', decimals: 8 },
  [USDC_CONTRACT]: { symbol: 'USDC', name: 'USD Coin', decimals: 6 }
};

function applyKnownTokenFixes(list = []) {
  for (const t of list) {
    if (!t || t.address === 'native') continue;
    const addr = String(t.address || '').toLowerCase();
    const fix = KNOWN_TOKENS[addr];
    if (fix) {
      t.symbol = fix.symbol;
      t.name = fix.name;
      t.decimals = Number.isFinite(fix.decimals) ? fix.decimals : t.decimals;
      if (Number.isFinite(t.priceUSD) && Number.isFinite(t.balance)) {
        const unit = Number(t.priceUSD) || Number(t.price) || 0;
        t.usd = unit * Number(t.balance || 0);
      }
    }
  }
  return list;
}

// ---------- spam filter ----------
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

// ---------- ETH price (Paprika primary → fallback) ----------
async function getEthUsdFromPaprika() {
  const cacheKey = 'price:eth:usd:paprika';
  const cached = getCachedJSON(cacheKey, PRICE_CACHE_TTL_MS);
  if (cached) return Number(cached);

  try {
    const { data } = await axios.get(`${PAPRIKA_BASE}/tickers/${PAPRIKA_ETH_ID}`, { timeout: 8000 });
    const price = Number(data?.quotes?.USD?.price || 0);
    if (price > 0) {
      setCachedJSON(cacheKey, price);
      return price;
    }
  } catch (e) {
    log('Paprika price failed:', e?.message || e);
  }
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

// ---------- pricing enrichers ----------
async function enrichEthPrice(tokens) {
  try {
    const ethUsd = await getEthUsdPricePrimary();
    if (!Array.isArray(tokens) || !(ethUsd > 0)) return tokens;
    const native = tokens.find(
      (t) => t.chain === 'eth' && (t.address === 'native' || (t.symbol || '').toUpperCase() === 'ETH')
    );
    if (native) {
      native.priceUSD = ethUsd;
      native.price = ethUsd;
      native.usd = toNum(native.balance, 0) * ethUsd;
    }
  } catch (e) {
    console.warn('[ETH] price enrich failed:', e?.message || e);
  }
  return tokens;
}
async function enrichAllPrices(tokens) {
  await enrichEthPrice(tokens);
  await enrichErc20Prices(tokens);
  return tokens;
}

// ---------- RPC ----------
async function rpc(method, params, id = 1) {
  if (!QN_URL) throw new Error('QuickNode URL missing');
  const { data } = await axios.post(
    QN_URL,
    { jsonrpc: '2.0', id, method, params },
    { headers: { 'Content-Type': 'application/json' }, timeout: READ_TIMEOUT }
  );
  if (data?.error) throw new Error(data.error?.message || 'RPC error');
  return data?.result;
}
async function ethCall(to, data) {
  return rpc('eth_call', [{ to, data }, 'latest']);
}

// -------- native ETH --------
async function fetchNativeETH(address) {
  try {
    const hex = await rpc('eth_getBalance', [address, 'latest']);
    const eth = weiToEth(toBN(hex)); // precision-safe
    return row({ address: 'native', symbol: 'ETH', name: 'Ether', decimals: 18, balance: eth });
  } catch (e) {
    console.error('[ETH] eth_getBalance failed:', e?.message || e);
    return row({ address: 'native', symbol: 'ETH', name: 'Ether', decimals: 18, balance: 0 });
  }
}

// ---------- ERC-20 discovery/fetchers ----------
async function fetchERC20sFromQuickNode(address) {
  if (!QN_URL) return [];
  const candidates = [
    {
      method: 'qn_getTokenBalances',
      params: [address],
      normalize: (res) => {
        const arr = res?.assets || res || [];
        return arr.map((t) =>
          row({
            address: t?.contractAddress,
            symbol: t?.symbol,
            name: t?.name,
            decimals: Number(t?.decimals ?? 18),
            balance: toDecimal(t?.balance ?? 0, Number(t?.decimals ?? 18))
          })
        );
      }
    },
    {
      method: 'qn_getWalletTokenBalances',
      params: [address],
      normalize: (res) => {
        const arr = res?.assets || res || [];
        return arr.map((t) =>
          row({
            address: t?.contractAddress,
            symbol: t?.symbol,
            name: t?.name,
            decimals: Number(t?.decimals ?? 18),
            balance: toDecimal(t?.balance ?? 0, Number(t?.decimals ?? 18))
          })
        );
      }
    },
    {
      method: 'alchemy_getTokenBalances',
      params: [address, 'erc20'],
      normalize: (res) => {
        const arr = res?.tokenBalances || [];
        return arr
          .filter((t) => t?.contractAddress)
          .map((t) =>
            row({
              address: t.contractAddress,
              symbol: t?.symbol || '',
              name: t?.name || '',
              decimals: Number(t?.decimals ?? 18),
              balance: toDecimal(t?.tokenBalance ?? 0, Number(t?.decimals ?? 18))
            })
          );
      }
    }
  ];

  for (const c of candidates) {
    try {
      log('Trying', c.method);
      const res = await rpc(c.method, c.params);
      const out = c.normalize(res).filter((t) => t.balance > 0);
      if (out.length) {
        log(`Success via ${c.method}:`, out.length, 'tokens');
        return out;
      }
    } catch (e) {
      log(`${c.method} failed:`, e?.message || e);
    }
  }
  return [];
}

// Moralis fallback
async function fetchERC20sFromMoralis(address) {
  if (!MORALIS_KEY) return [];
  try {
    const url = `${MORALIS_BASE}/${address}/erc20?chain=eth`;
    const { data } = await axios.get(url, { headers: { 'X-API-Key': MORALIS_KEY }, timeout: READ_TIMEOUT });
    return (data || [])
      .map((t) => {
        const dec = Number(t?.decimals ?? 18);
        return row({
          address: t?.token_address,
          symbol: t?.symbol,
          name: t?.name,
          decimals: dec,
          balance: toDecimal(t?.balance ?? 0, dec)
        });
      })
      .filter((t) => t.balance > 0);
  } catch (e) {
    console.warn('[ETH] Moralis ERC20 failed:', e?.message || e);
    return [];
  }
}

// Etherscan discovery + on-chain reads
async function fetchERC20sFromEtherscan(address) {
  if (!ETHERSCAN_KEY) return [];
  try {
    const url =
      `${ETHERSCAN_BASE}?module=account&action=tokentx&address=${address}` +
      `&startblock=0&endblock=99999999&sort=desc&apikey=${ETHERSCAN_KEY}`;
    const { data } = await axios.get(url, { timeout: READ_TIMEOUT });
    const txs = Array.isArray(data?.result) ? data.result : [];
    if (!txs.length) return [];

    const uniq = [];
    const seen = new Set();
    for (const t of txs) {
      const ca = String(t?.contractAddress || '').toLowerCase();
      if (ca && !seen.has(ca)) {
        seen.add(ca);
        uniq.push(ca);
        if (uniq.length >= MAX_DISCOVERED) break;
      }
    }
    if (!uniq.length) return [];

    const out = [];
    await Promise.all(
      uniq.map(async (ca) => {
        try {
          const [decHex, symHex, nameHex, balHex] = await Promise.all([
            ethCall(ca, SIG.decimals),
            ethCall(ca, SIG.symbol),
            ethCall(ca, SIG.name),
            ethCall(ca, encodeBalanceOfData(address))
          ]);

          const decimals = Number(toBN(decHex));
          const symbol = tryDecodeString(symHex) || '';
          const name = tryDecodeString(nameHex) || '';
          const balRaw = toBN(balHex);
          const balance = toDecimal(balRaw, decimals);

          if (balance > 0) {
            out.push(row({ address: ca, symbol, name, decimals, balance }));
          }
        } catch {
          /* skip */
        }
      })
    );

    return out;
  } catch (e) {
    console.warn('[ETH] Etherscan discovery failed:', e?.message || e);
    return [];
  }
}

// Ethplorer last-resort
async function fetchERC20sFromEthplorer(address) {
  try {
    const url = `${ETHPLORER}/getAddressInfo/${address}?apiKey=${ETHPLORER_KEY}`;
    const { data } = await axios.get(url, { timeout: READ_TIMEOUT });
    const tokens = data?.tokens || [];
    return tokens
      .map((t) => {
        const info = t?.tokenInfo || {};
        const dec = Number(info?.decimals ?? 18);
        return row({
          address: info?.address,
          symbol: info?.symbol,
          name: info?.name,
          decimals: dec,
          balance: toDecimal(t?.balance ?? 0, dec)
        });
      })
      .filter((t) => t.balance > 0);
  } catch (e) {
    console.error('[ETH] Ethplorer failed:', e?.message || e);
    return [];
  }
}

// ---------- public ----------
export async function fetchEthereumTokens(address, { force = false } = {}) {
  const key = `eth:tokens:${(address || '').toLowerCase()}`;

  // Cached path — normalise old shapes {tokens: []} → []
  if (!force) {
    const cachedRaw = getCachedJSON(key, CACHE_TTL_MS);
    const cachedArr = Array.isArray(cachedRaw)
      ? cachedRaw
      : Array.isArray(cachedRaw?.tokens)
        ? cachedRaw.tokens
        : null;

    if (cachedArr) {
      const fixed = applyKnownTokenFixes(cachedArr.slice());
      const priced = await enrichAllPrices(fixed);
      const cleaned = filterEthSpam(priced);
      setCachedJSON(key, cleaned); // rewrite in the new array-only shape
      return cleaned;
    }
  }

  const [nativeRow, qnErc20] = await Promise.all([
    fetchNativeETH(address),
    fetchERC20sFromQuickNode(address)
  ]);

  let erc20 = qnErc20;
  if (!erc20.length) {
    log('No ERC-20s from QuickNode; trying Moralis');
    erc20 = await fetchERC20sFromMoralis(address);
  }
  if (!erc20.length) {
    log('No ERC-20s from Moralis; trying Etherscan+on-chain');
    erc20 = await fetchERC20sFromEtherscan(address);
  }
  if (!erc20.length) {
    log('No ERC-20s from Etherscan; falling back to Ethplorer');
    erc20 = await fetchERC20sFromEthplorer(address);
  }

  const baseList = [nativeRow, ...erc20];
  applyKnownTokenFixes(baseList);

  const result = await enrichAllPrices(baseList);
  const cleaned = filterEthSpam(result);
  setCachedJSON(key, cleaned); // store as array
  return cleaned;
}

export async function refreshEthereumTokens(address) {
  const fresh = await fetchEthereumTokens(address, { force: true });
  setCachedJSON(`eth:tokens:${(address || '').toLowerCase()}`, fresh);
  return fresh;
}
