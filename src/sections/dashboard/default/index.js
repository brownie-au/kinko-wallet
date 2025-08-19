// src/sections/dashboard/default/index.js

// Primary cards & widgets
export { default as PortfolioValueCard } from './PortfolioValueCard';
export { default as PnLCard } from './PnLCard';
export { default as FearGreedCard } from './FearGreedCard';
export { default as PortfolioBalanceChart } from './PortfolioBalanceChart';
export { default as TopTokensRow } from './TopTokensRow.jsx'; // keep .jsx if the file uses it

// Back-compat: old pages import EarningChart but it is the same component
export { default as EarningChart } from './PortfolioBalanceChart';

// ---- TEMP: placeholder so Charts.jsx can import UsersMap without blowing up ----
export const UsersMap = () => null;
