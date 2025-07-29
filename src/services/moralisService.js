const MORALIS_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6ImFlMDdlN2UzLTFmN2QtNDBhNy1hNjBlLWI5ODczOGE0ZWIwZCIsIm9yZ0lkIjoiNDYyMTI4IiwidXNlcklkIjoiNDc1NDMzIiwidHlwZUlkIjoiYzhmNDhmMjctYzcyYy00YjhlLWI2ZTEtMWJhNGVkM2IxNTY5IiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3NTM3NzA3OTcsImV4cCI6NDkwOTUzMDc5N30.HPj3-I0djQOYv8IU0JcGBSd4etxJ_hV3MXcNeDAuxds";
const MORALIS_API_BASE = "https://mainnet-evm-api.moralis.io/v2";

// ETH only
const CHAIN_ID = "eth";

async function fetchMoralis(endpoint, params = {}) {
  const url = new URL(`${MORALIS_API_BASE}/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
  const res = await fetch(url.toString(), {
    headers: { "X-API-Key": MORALIS_API_KEY }
  });
  if (!res.ok) throw new Error("Moralis API error");
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
  return result.map(token => ({
    symbol: token.symbol,
    name: token.name,
    decimals: Number(token.decimals),
    contractAddress: token.token_address,
    balance: Number(token.balance) / Math.pow(10, token.decimals)
  }));
}
