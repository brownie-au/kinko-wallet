import { getPLSBalance, getTokenBalances, getTokenPrices } from '../services/pulsechainService';

export async function fetchPulsechainTokens(address) {
  try {
    // 1) Native PLS balance
    const plsBalance = await getPLSBalance(address);

    // 2) ERC20 tokens
    const tokens = await getTokenBalances(address);

    // 3) Add PLS as a token entry
    tokens.unshift({
      symbol: 'PLS',
      name: 'PulseChain Native',
      balance: plsBalance,
      decimals: 18,
      value: 0,  // to be calculated
      price: 0,
      change24h: 0
    });

    // 4) Get token prices
    const symbols = tokens.map(t => t.symbol);
    const prices = await getTokenPrices(symbols);

    // 5) Attach price and value
    return tokens.map(token => {
      const price = prices[token.symbol] || 0;
      return {
        ...token,
        price,
        value: token.balance * price,
        change24h: (Math.random() * 4 - 2).toFixed(2) // fake ± for now
      };
    });
  } catch (error) {
    console.error('PulseChain token fetch failed:', error);
    return [];
  }
}
