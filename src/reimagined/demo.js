import { blankWatchlist } from './vault.js';
import { stakeMetrics } from './networks.js';
const a = '0x1111111111111111111111111111111111111111';
const b = '0x2222222222222222222222222222222222222222';
export const demoWatchlist = {
  ...blankWatchlist(),
  wallets: [
    { address: a, name: 'Long-term holdings', networks: ['pulse', 'eth'], hidden: false },
    { address: b, name: 'Everyday wallet', networks: ['eth', 'base'], hidden: false }
  ]
};
const token = (chain, address, symbol, name, amount, price, wallet = a) => ({
  chain,
  address,
  symbol,
  name,
  amountExact: String(amount),
  priceUsd: price,
  valueUsd: amount * price,
  valueExact: String(amount * price),
  wallet,
  priceSource: 'Illustrative demo'
});
export const demoRows = [
  token('eth', null, 'ETH', 'Ethereum', 18.42, 2600),
  token('pulse', '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39', 'HEX', 'HEX', 1600000, 0.018),
  token('pulse', null, 'PLS', 'PulseChain', 420000000, 0.000064),
  token('pulse', '0x95b303987a60c71504d99aa1b13b4dAA07b0790ab'.toLowerCase(), 'PLSX', 'PulseX', 580000000, 0.000033),
  token('base', null, 'ETH', 'Ethereum', 4.6, 2600, b),
  token('eth', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', 'USDC', 'USD Coin', 8200, 1, b)
];
const nowDay = Math.floor((Date.now() / 1000 - 1575331200) / 86400);
export const demoStakes = [
  {
    id: '284913',
    chain: 'pulse',
    wallet: a,
    principal: '650000',
    tShares: '28.42',
    shares: '28420000000000',
    lockedDay: nowDay - 270,
    stakedDays: 300,
    unlockedDay: 0
  },
  {
    id: '319846',
    chain: 'pulse',
    wallet: a,
    principal: '950000',
    tShares: '61.83',
    shares: '61830000000000',
    lockedDay: nowDay - 440,
    stakedDays: 730,
    unlockedDay: 0
  },
  {
    id: '156210',
    chain: 'eth',
    wallet: b,
    principal: '125000',
    tShares: '8.21',
    shares: '8210000000000',
    lockedDay: nowDay - 400,
    stakedDays: 365,
    unlockedDay: 0
  }
].map((s) => stakeMetrics(s, nowDay));
