// src/sections/dashboard/default/index.js

export { default as PortfolioValueCard } from './PortfolioValueCard';
export { default as PnLCard } from './PnLCard';
export { default as FearGreedCard } from './FearGreedCard';
export { default as PortfolioBalanceChart } from './PortfolioBalanceChart';

// src/sections/dashboard/default/index.js
export { default as PortfolioValueCard } from './PortfolioValueCard';
export { default as PnLCard } from './PnLCard';
export { default as FearGreedCard } from './FearGreedCard';
export { default as PortfolioBalanceChart } from './PortfolioBalanceChart';
export { default as TopTokensRow } from './TopTokensRow.jsx'; // <-- note .jsx

// Back-compat: old pages import EarningChart
export { default as EarningChart } from './PortfolioBalanceChart';

// ---- TEMP: placeholder so Charts.jsx can import UsersMap without blowing up ----
export const UsersMap = () => null;
