export const HEX_ADDRESS = '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39';
export const NETWORKS = {
  pulse: {
    name: 'PulseChain',
    id: 369,
    symbol: 'PLS',
    color: '#8a54cf',
    explorer: 'https://scan.pulsechain.com',
    scan: 'https://api.scan.pulsechain.com/api/v2',
    rpc: ['https://rpc.pulsechain.com'],
    llama: 'pulsechain',
    nativePrice: 'pulsechain:' + '0xa1077a294dde1b09bb078844df40758a5d0f9a27'
  },
  eth: {
    name: 'Ethereum',
    id: 1,
    symbol: 'ETH',
    color: '#6279c9',
    explorer: 'https://eth.blockscout.com',
    scan: 'https://eth.blockscout.com/api/v2',
    rpc: ['https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org'],
    llama: 'ethereum',
    nativePrice: 'coingecko:ethereum'
  },
  base: {
    name: 'Base',
    id: 8453,
    symbol: 'ETH',
    color: '#3269f0',
    explorer: 'https://base.blockscout.com',
    scan: 'https://base.blockscout.com/api/v2',
    rpc: ['https://mainnet.base.org'],
    llama: 'base',
    nativePrice: 'coingecko:ethereum'
  },
  polygon: {
    name: 'Polygon',
    id: 137,
    symbol: 'POL',
    color: '#8256d3',
    explorer: 'https://polygon.blockscout.com',
    scan: 'https://polygon.blockscout.com/api/v2',
    rpc: ['https://polygon-bor-rpc.publicnode.com'],
    llama: 'polygon',
    nativePrice: 'coingecko:polygon-ecosystem-token'
  },
  bsc: {
    name: 'BNB Smart Chain',
    id: 56,
    symbol: 'BNB',
    color: '#b78d22',
    explorer: 'https://bscscan.com',
    scan: null,
    rpc: ['https://bsc-rpc.publicnode.com', 'https://bsc-dataseed.binance.org'],
    llama: 'bsc',
    nativePrice: 'coingecko:binancecoin'
  }
};
export const HEX_EPOCH = 1575331200; // 2019-12-03 00:00:00 UTC, verified contract LAUNCH_TIME.
export function stakeMetrics(s, day) {
  const endDay = s.lockedDay + s.stakedDays;
  const served = Math.max(0, Math.min(s.stakedDays, (s.unlockedDay || day) - s.lockedDay));
  return {
    ...s,
    endDay,
    startTime: (HEX_EPOCH + s.lockedDay * 86400) * 1000,
    endTime: (HEX_EPOCH + endDay * 86400) * 1000,
    remaining: Math.max(0, endDay - day),
    progress: s.stakedDays ? (served / s.stakedDays) * 100 : 0,
    status: s.unlockedDay
      ? 'Accounted'
      : s.lockedDay === 0 || day < s.lockedDay
        ? 'Pending'
        : day >= endDay
          ? 'Matured'
          : endDay - day <= 30
            ? 'Due soon'
            : 'Active'
  };
}
