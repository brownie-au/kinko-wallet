import { ethers } from 'ethers';
import { isWalletAddress, NETWORKS } from '../utils/walletRecords.js';
const KEY = 'kw:manualTokens:v1';
const RPC = {
  eth: import.meta.env.VITE_ETH_RPC_URL || 'https://eth.llamarpc.com',
  pulse: import.meta.env.VITE_PLS_RPC_URL || 'https://rpc.pulsechain.com',
  bsc: import.meta.env.VITE_BSC_RPC_URL || 'https://bsc-dataseed.binance.org',
  polygon: import.meta.env.VITE_POLYGON_RPC_URL || 'https://polygon-bor-rpc.publicnode.com',
  base: import.meta.env.VITE_BASE_RPC_URL || 'https://mainnet.base.org'
};
export function getManualTokens() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter((t) => NETWORKS.includes(t.chain) && isWalletAddress(t.address)) : [];
  } catch {
    return [];
  }
}
export function saveManualToken(chain, address) {
  if (!NETWORKS.includes(chain) || !isWalletAddress(address)) throw new Error('Enter a valid token contract and network.');
  const list = getManualTokens();
  const lower = address.trim().toLowerCase();
  if (!list.some((t) => t.chain === chain && t.address === lower)) list.push({ chain, address: lower });
  localStorage.setItem(KEY, JSON.stringify(list));
  // Manual changes invalidate cached coverage, without clearing wallet lists.
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key?.startsWith(`kw:holdings:v2:${chain}:`)) localStorage.removeItem(key);
  }
}
export async function readManualTokens(chain, wallet) {
  const tokens = getManualTokens().filter((t) => t.chain === chain);
  if (!tokens.length) return { tokens: [], failed: [] };
  const provider = new ethers.providers.JsonRpcProvider({ url: RPC[chain], timeout: 12000 });
  const results = await Promise.allSettled(
    tokens.map(async (t) => {
      const contract = new ethers.Contract(
        t.address,
        [
          'function balanceOf(address) view returns (uint256)',
          'function decimals() view returns (uint8)',
          'function name() view returns (string)',
          'function symbol() view returns (string)'
        ],
        provider
      );
      const [balance, decimals, name, symbol] = await Promise.all([
        contract.balanceOf(wallet),
        contract.decimals(),
        contract.name().catch(() => 'Token'),
        contract.symbol().catch(() => '')
      ]);
      return { ...t, balanceRaw: balance.toString(), decimals: Number(decimals), name, symbol };
    })
  );
  return {
    tokens: results.filter((r) => r.status === 'fulfilled').map((r) => r.value),
    failed: results.flatMap((r, i) => (r.status === 'rejected' ? [tokens[i].address] : []))
  };
}
