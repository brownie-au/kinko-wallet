// src/services/ethBlockscoutService.js
// 🚀 Simplified Ethereum token fetcher using FreeCryptoAPI only
// No Blockscout calls, no CORS issues, works in both dev & deployment

export async function getEthTokensFromBlockscout(address, opts = {}) {
    try {
        const proxy = import.meta.env.VITE_FREECRYPTO_PROXY_URL;
        const apiUrl = `${proxy}?vs_currency=usd&ids=ethereum,hex,usdc,pepe,dai,doge,plsb,mm,texan,gero,icsa`;

        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const tokens = await response.json();

        // Convert to Kinko Wallet’s expected shape
        return tokens.map(t => ({
            symbol: t.symbol?.toUpperCase(),
            name: t.name,
            price: t.current_price,
            amount: 1, // placeholder since Blockscout balances removed
            value: t.current_price,
            change24h: t.price_change_percentage_24h,
            logo: t.image,
            chain: 'Ethereum',
        }));
    } catch (err) {
        console.error('ETH FreeCryptoAPI fetch failed:', err);
        return [];
    }
}

// Keep exports consistent for anything else importing from this file
export function toUnits(value, decimals = 18) {
    return Number(value) / Math.pow(10, decimals);
}
