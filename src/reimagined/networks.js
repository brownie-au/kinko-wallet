export const HEX_ADDRESS = '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39';
export const NETWORKS = {
  pulse: {
    dex: 'pulsechain',
    wrappedNative: '0xa1077a294dde1b09bb078844df40758a5d0f9a27',
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
    dex: 'ethereum',
    wrappedNative: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
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
    dex: 'base',
    wrappedNative: '0x4200000000000000000000000000000000000006',
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
    dex: 'polygon',
    wrappedNative: '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270',
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
    dex: 'bsc',
    wrappedNative: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',
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
