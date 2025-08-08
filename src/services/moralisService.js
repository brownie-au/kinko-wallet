// src/services/moralisService.js

// Load from .env
const MORALIS_API_KEY  = import.meta.env.VITE_MORALIS_API_KEY;
const MORALIS_API_BASE = import.meta.env.VITE_MORALIS_API_BASE || 'https://mainnet-evm-api.moralis.io/v2';

// ETH only for now
const CHAIN_ID = 'eth';

// Internal: safe fetch wrapper (no throws)
async function fetchMoralis(endpoint, params = {}) {
  const url = new URL(`${MORALIS_API_BASE}/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.append(k, v);
  });

  try {
    const res = await fetch(url.toString(), { headers: { 'X-API-Key': MORALIS_API_KEY } });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('Moralis API error:', res.status, res.statusText, text);
      return null; // <- don't throw; keep UI alive
    }
    return await res.json();
  } catch (err) {
    console.error('Moralis network error:', err);
    return null; // <- fallback
  }
}

// Get ETH native balance (in ETH)
export async function getNativeBalance(address) {
  const json = await fetchMoralis(`${address}/balance`, { chain: CHAIN_ID });
  const raw = json?.balance ?? '0';            // wei as string
  return Number(raw) / 1e18;                   // ETH
}

// Get ETH token balances (ERC-20)
export async function getTokenBalances(address) {
  const json = await fetchMoralis(`${address}/erc20`, { chain: CHAIN_ID });
  const arr = Array.isArray(json) ? json : [];
  return arr
    .map((t) => {
      const decimals = Number(t.decimals ?? 18);
      const amount   = Number(t.balance ?? '0') / 10 ** decimals;
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

// Optional helper if you want a single list incl. native ETH
export async function getEthTokenTable(address) {
  const [eth, erc20] = await Promise.all([
    getNativeBalance(address),
    getTokenBalances(address)
  ]);
  return [{ name: 'Ether', symbol: 'ETH', decimals: 18, contractAddress: 'native', balance: eth }, ...erc20];
}
