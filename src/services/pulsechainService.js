const API_BASE = "https://scan.9inch.io/api";

// === Fetch native PLS balance ===
export async function getPLSBalance(address) {
  const url = `${API_BASE}?module=account&action=balance&address=${address}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== "1") throw new Error(data.result || "Failed to fetch PLS balance");
  return Number(data.result) / 1e18; // Convert wei to PLS
}

// === Fetch token balances ===
export async function getTokenBalances(address) {
  const url = `${API_BASE}?module=account&action=tokenlist&address=${address}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== "1") throw new Error(data.result || "Failed to fetch token list");
  return data.result.map(token => ({
    symbol: token.symbol,
    name: token.name,
    decimals: Number(token.decimals),
    contractAddress: token.contractAddress,
    balance: Number(token.balance) / Math.pow(10, token.decimals)
  }));
}

// === Fetch token price (placeholder for now) ===
export async function getTokenPrices(symbols) {
  const dummyPrices = {};
  symbols.forEach(symbol => {
    dummyPrices[symbol] = Math.random() * 0.1; // Fake price for now
  });
  return dummyPrices;
}
