// Load from .env
const MORALIS_API_KEY = import.meta.env.VITE_MORALIS_API_KEY;
const MORALIS_API_BASE = import.meta.env.VITE_MORALIS_API_BASE || "https://mainnet-evm-api.moralis.io/v2";

// ETH only for now
const CHAIN_ID = "eth";

// General fetch wrapper
async function fetchMoralis(endpoint, params = {}) {
  const url = new URL(`${MORALIS_API_BASE}/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));

  const res = await fetch(url.toString(), {
    headers: { "X-API-Key": MORALIS_API_KEY }
  });

  if (!res.ok) throw new Error(`Moralis API error: ${res.status} ${res.statusText}`);
  return await res.json();
}

// Get ETH native balance
export async function getNativeBalance(address) {
  const result = await fetchMoralis(`${address}/balance`, { chain: CHAIN_ID });
  return Number(result.balance) / 1e18;
}

// Get ETH token balances (ERC-20)
export async function getTokenBalances(address) {
  const result = await fetchMoralis(`${address}/erc20`, { chain: CHAIN_ID });
  return result.map((token) => ({
    symbol: token.symbol,
    name: token.name,
    decimals: Number(token.decimals),
    contractAddress: token.token_address,
    balance: Number(token.balance) / Math.pow(10, token.decimals)
  }));
}
