// src/services/moralisService.js
// Works with Moralis v2 (deep-index.moralis.io/api/v2)

// Load from .env
const MORALIS_API_KEY  = import.meta.env.VITE_MORALIS_API_KEY;
const MORALIS_API_BASE = import.meta.env.VITE_MORALIS_API_BASE || 'https://deep-index.moralis.io/api/v2';

// Default chain for the Ethereum wallet page
const CHAIN_ID = 'eth';

// WETH contract is a good proxy for native ETH price
const WETH_BY_CHAIN = {
  eth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  // base: '0x4200000000000000000000000000000000000006', // when we wire Base
  // add others as needed
};

// ---------- internal helpers ----------
const headers = () => ({ 'X-API-Key': MORALIS_API_KEY });

function safeNumber(n, fallback = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

async function mfetch(path, params = {}) {
  const url = new URL(`${MORALIS_API_BASE}/${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.append(k, v);
  });

  try {
    const res = await fetch(url.toString(), { headers: headers() });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[Moralis]', res.status, res.statusText, text);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error('[Moralis] network error', e);
    return null;
  }
}

// ---------- your existing exports (untouched signatures) ----------
export async function getNativeBalance(address, chain = CHAIN_ID) {
  const json = await mfetch(`${address}/balance`, { chain });
  const raw = json?.balance ?? '0'; // wei
  return safeNumber(raw) / 1e18;
}

export async function getTokenBalances(address, chain = CHAIN_ID) {
  const json = await mfetch(`${address}/erc20`, { chain });
  const arr = Array.isArray(json) ? json : [];
  return arr
    .map((t) => {
      const decimals = safeNumber(t.decimals, 18);
      const amount = safeNumber(t.balance) / 10 ** decimals;
      return {
        symbol: t.symbol || '',
        name: t.name || '',
        decimals,
        contractAddress: t.token_address,
        balance: Number.isFinite(amount) ? amount : 0
      };
    })
    .filter((t) => t.balance > 0)
    .sort((a, b) => b.balance - a.balance);
}

// ---------- new helpers for prices & logos ----------
export async function getTokenMetadata(addresses = [], chain = CHAIN_ID) {
  if (!addresses.length) return {};
  const params = { chain };
  addresses.forEach((a) => params['addresses'] = a); // URLSearchParams repeats 'addresses='

  // Build URL manually because URLSearchParams overwrites
  const url = new URL(`${MORALIS_API_BASE}/erc20/metadata`);
  url.searchParams.set('chain', chain);
  addresses.forEach((a) => url.searchParams.append('addresses', a));

  try {
    const res = await fetch(url.toString(), { headers: headers() });
    if (!res.ok) {
      console.error('[Moralis] metadata error', res.status);
      return {};
    }
    const data = await res.json();
    const out = {};
    (Array.isArray(data) ? data : []).forEach((m) => {
      out[(m.token_address || '').toLowerCase()] = {
        logo: m.logo || m.thumbnail || null,
        name: m.name,
        symbol: m.symbol,
        decimals: safeNumber(m.decimals, 18)
      };
    });
    return out;
  } catch (e) {
    console.error('[Moralis] metadata network error', e);
    return {};
  }
}

export async function getTokenPriceUSD(address, chain = CHAIN_ID) {
  const json = await mfetch('erc20/price', { chain, address });
  // Moralis returns { usdPrice, nativePrice: {...}, ... }
  return safeNumber(json?.usdPrice ?? json?.usd_price, 0);
}

// tiny concurrency control to be nice to the API
async function mapWithLimit(items, limit, fn) {
  const ret = [];
  let i = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    for (; i < items.length; ) {
      const idx = i++;
      ret[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return ret;
}

/**
 * High-level: full portfolio with USD prices, values & logos (Moralis-only).
 * Returns { tokens[], native, totalUSD }
 */
export async function getPortfolioWithPrices(address, chain = CHAIN_ID) {
  // 1) balances
  const [nativeEth, erc20] = await Promise.all([
    getNativeBalance(address, chain),
    getTokenBalances(address, chain)
  ]);

  // 2) metadata (logos)
  const addrs = erc20.map((t) => t.contractAddress).filter(Boolean);
  const meta = await getTokenMetadata(addrs, chain);

  // 3) prices
  const [nativePrice, prices] = await Promise.all([
    // Use WETH as the proxy for the native price on this chain
    getTokenPriceUSD(WETH_BY_CHAIN[chain] || WETH_BY_CHAIN.eth, chain),
    mapWithLimit(addrs, 4, (a) => getTokenPriceUSD(a, chain))
  ]);

  const tokens = erc20.map((t, idx) => {
    const key = (t.contractAddress || '').toLowerCase();
    const m = meta[key] || {};
    const price = safeNumber(prices[idx], 0);
    const value = t.balance * price;
    return {
      name: m.name || t.name || 'Unknown',
      symbol: m.symbol || t.symbol || '',
      decimals: m.decimals || t.decimals || 18,
      amount: t.balance,
      price,
      value,
      contract: t.contractAddress,
      logo: m.logo || null
    };
  }).sort((a, b) => b.value - a.value);

  const native = {
    name: chain === 'eth' ? 'Ether' : 'Native',
    symbol: chain === 'eth' ? 'ETH' : 'NATIVE',
    decimals: 18,
    amount: nativeEth,
    price: nativePrice,
    value: nativeEth * nativePrice,
    contract: 'native',
    logo: null
  };

  const totalUSD = tokens.reduce((s, t) => s + t.value, native.value);

  return { tokens, native, totalUSD };
}
