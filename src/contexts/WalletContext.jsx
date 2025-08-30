import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { buildPortfolioDetailed } from '../services/portfolioAggService';

const WalletContext = createContext();
export const useWallets = () => useContext(WalletContext);

export const WalletProvider = ({ children }) => {
  // ---- wallets (memory only, same as before) ----
  const [wallets, setWallets] = useState([]); // [{ address, name }]

  const addWallet = (address, name) => {
    const addr = String(address || '').trim();
    if (!addr) return;
    setWallets((prev) => (prev.find((w) => w.address === addr) ? prev : [...prev, { address: addr, name }]));
  };

  const deleteWallet = (address) => setWallets((prev) => prev.filter((w) => w.address !== address));

  const replaceWallets = (arr) => setWallets(Array.isArray(arr) ? arr : []);

  // ---- portfolio aggregate (NEW) ----
  const [portfolio, setPortfolio] = useState({
    totalUsd: 0,
    changePct24h: 0,
    tokens: [],
    breakdown: []
  });
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [portfolioError, setPortfolioError] = useState('');

  const refreshPortfolio = useCallback(
    async (opts = {}) => {
      try {
        setPortfolioLoading(true);
        setPortfolioError('');
        // buildPortfolioDetailed expects list of wallets; we pass your objects array
        const result = await buildPortfolioDetailed(wallets, opts);
        // Ensure shape
        const safe = {
          totalUsd: Number(result?.totalUsd || 0),
          changePct24h: Number(result?.changePct24h || 0),
          tokens: result?.tokens || [],
          breakdown: result?.breakdown || []
        };
        setPortfolio(safe);
      } catch (e) {
        setPortfolioError(e?.message || String(e));
        setPortfolio((p) => ({ ...p, totalUsd: 0 }));
      } finally {
        setPortfolioLoading(false);
      }
    },
    [wallets]
  );

  // Recompute when wallet list changes
  useEffect(() => {
    if (!wallets || wallets.length === 0) {
      setPortfolio({ totalUsd: 0, changePct24h: 0, tokens: [], breakdown: [] });
      return;
    }
    refreshPortfolio({ only: 'summary' }); // non-breaking option; ignored if not used
  }, [wallets, refreshPortfolio]);

  const value = {
    wallets,
    addWallet,
    deleteWallet,
    replaceWallets,
    portfolio,
    portfolioLoading,
    portfolioError,
    refreshPortfolio
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
};
