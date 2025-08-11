// src/services/ethereumService.js
// Ethereum balances via QuickNode RPC (native ETH + token methods) with Ethplorer fallback for ERC-20s.
// Adds SAFE pricing for native ETH only (via ethPriceService). Sets both priceUSD and price. ERC-20 prices remain 0.

import axios from 'axios';
import { getEthUsdPrice } from './ethPriceService';
import { getCachedJSON, setCachedJSON } from '../utils/kinkoCache';

const QN_URL = import.meta.env.VITE_QUICKNODE_HTTP || '';
const ETHPLORER = 'https://api.ethplorer.io';
const ETHPLORER_KEY = import.meta.env.VITE_ETHPLORER_KEY || 'freekey';

const CACHE_TTL_MS = Number(import.meta.env.VITE_WALLET_CACHE_TTL_MIN ?? 10) * 60_000;
const DEBUG = !!import.meta.env.DEV;
const log = (...a) => DEBUG && console.log('%c[ETH]', 'color:#9cf', ...a);

// ---------- utils ----------
const toBN = (hex) => {
  if (!hex) return 0n;
  const s = String(hex);
  return s.startsWith('0x') ? BigInt(s) : BigInt(`0x${s}`);
};
const weiToEth = (weiBig) => Number(weiBig) / 1e18;
const toNum = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

// Default token row
const row = ({ address, symbol, name, decimals, balance }) => ({
  chain: 'eth',
  address: address ? String(address).toLowerCase() : 'native',
  symbol: symbol || '',
  name: name || '',
  decimals: Number(decimals ?? 18),
  balance: Number(balance ?? 0),
  priceUSD: 0,   // used by parts of the app
  price: 0,      // some views expect `price`
  usd: 0
});

// Enrich just native ETH with USD price (runs for fresh and cached arrays)
async function enrichEthPrice(tokens) {
  try {
    const ethUsd = await getEthUsdPrice(); // e.g., 4309.16
    if (!Array.isArray(tokens) || !(ethUsd > 0)) return tokens;
    const native = tokens.find(
      (t) => t.chain === 'eth' && (t.address === 'native' || (t.symbol || '').toUpperCase() === 'ETH')
    );
    if (native) {
      native.priceUSD = ethUsd;
      native.price = ethUsd; // alias for UIs that read `price`
      native.usd = toNum(native.balance, 0) * ethUsd;
    }
  } catch (e) {
    console.warn('[ETH] price enrich failed:', e?.message || e);
  }
  return tokens;
}

// ---------- RPC ----------
async function rpc(method, params, id = 1) {
  if (!QN_URL) throw new Error('QuickNode URL missing');
  const { data } = await axios.post(
    QN_URL,
    { jsonrpc: '2.0', id, method, params },
    { headers: { 'Content-Type': 'application/json' } }
  );
  if (data?.error) throw new Error(data.error?.message || 'RPC error');
  return data?.result;
}

// Native ETH
async function fetchNativeETH(address) {
  try {
    const hex = await rpc('eth_getBalance', [address, 'latest']);
    const eth = weiToEth(toBN(hex));
    return row({ address: 'native', symbol: 'ETH', name: 'Ether', decimals: 18, balance: eth });
  } catch (e) {
    console.error('[ETH] eth_getBalance failed:', e?.message || e);
    return row({ address: 'native', symbol: 'ETH', name: 'Ether', decimals: 18, balance: 0 });
  }
}

// ERC-20s via QuickNode (try common method names)
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
            balance:
              t?.decimals != null
                ? Number(t?.balance ?? 0) / 10 ** Number(t.decimals)
                : Number(t?.balance ?? 0)
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
            balance:
              t?.decimals != null
                ? Number(t?.balance ?? 0) / 10 ** Number(t.decimals)
                : Number(t?.balance ?? 0)
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
              balance:
                t?.tokenBalance != null && t?.decimals != null
                  ? Number(BigInt(t.tokenBalance)) / 10 ** Number(t.decimals)
                  : 0
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

// ERC-20s via Ethplorer (fallback)
async function fetchERC20sFromEthplorer(address) {
  try {
    const url = `${ETHPLORER}/getAddressInfo/${address}?apiKey=${ETHPLORER_KEY}`;
    const { data } = await axios.get(url);
    const tokens = data?.tokens || [];
    return tokens
      .map((t) => {
        const info = t?.tokenInfo || {};
        const dec = Number(info?.decimals ?? 18);
        const raw = Number(t?.balance ?? 0);
        const bal = dec ? raw / 10 ** dec : raw;
        return row({
          address: info?.address,
          symbol: info?.symbol,
          name: info?.name,
          decimals: dec,
          balance: bal
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

  // Serve cached result if present, but always enrich price before returning
  if (!force) {
    const cached = getCachedJSON(key, CACHE_TTL_MS);
    if (cached) {
      const priced = await enrichEthPrice(cached);
      setCachedJSON(key, priced);
      return priced;
    }
  }

  const [nativeRow, qnErc20] = await Promise.all([
    fetchNativeETH(address),
    fetchERC20sFromQuickNode(address)
  ]);

  let erc20 = qnErc20;
  if (!erc20.length) {
    log('No ERC-20s from QuickNode; falling back to Ethplorer');
    erc20 = await fetchERC20sFromEthplorer(address);
  }

  const result = await enrichEthPrice([nativeRow, ...erc20]);
  setCachedJSON(key, result);
  return result;
}

export async function refreshEthereumTokens(address) {
  const fresh = await fetchEthereumTokens(address, { force: true });
  setCachedJSON(`eth:tokens:${(address || '').toLowerCase()}`, fresh);
  return fresh;
}
