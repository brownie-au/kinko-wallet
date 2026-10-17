import { normalizeWallets, isWalletAddress } from '../utils/walletRecords.js';
import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { buildPortfolioDetailedFromCache as buildPortfolioDetailed } from '../services/portfolioAggService';

const WalletContext = createContext();
export const useWallets = () => useContext(WalletContext);

export const WalletProvider = ({ children }) => {
  // ---- wallets (persisted) ----
  // Hydrate synchronously from localStorage to avoid an initial "[]" write that can wipe data
  const [wallets, setWallets] = useState(() => {
    try {
      const raw = localStorage.getItem('wallets');
      const arr = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(arr) ? arr : [];
      return normalizeWallets(list).filter((w) => !w.hidden);
    } catch {
      return [];
    }
  }); // [{ address, name }]

  // Do NOT blindly persist here; Manage page owns persistence including the hidden flag.
  // Other pages should treat context as the visible subset only and must not overwrite LS.

  const addWallet = (address, name) => {
    const addr = String(address || '').trim();
    if (!isWalletAddress(addr)) return;
    setWallets((prev) => (prev.find((w) => w.address.toLowerCase() === addr.toLowerCase()) ? prev : [...prev, { address: addr, name }]));
  };

  const deleteWallet = (address) => setWallets((prev) => prev.filter((w) => w.address !== address));

  const replaceWallets = (arr) => setWallets(normalizeWallets(Array.isArray(arr) ? arr : []).filter((w) => !w.hidden));

  // ---- portfolio aggregate (NEW) ----
  const [portfolio, setPortfolio] = useState({
    totalUsd: 0,
    changePct24h: 0,
    tokens: [],
    breakdown: []
  });
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [portfolioError, setPortfolioError] = useState('');

  const requestRef = useRef(0);
  const refreshPortfolio = useCallback(
    async (opts = {}) => {
      const requestId = ++requestRef.current;
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
        if (requestId === requestRef.current) {
          setPortfolio(safe);
          setPortfolioError(result?.issues?.length ? 'Some network data is unavailable or stale.' : '');
        }
      } catch (e) {
        if (requestId === requestRef.current) setPortfolioError(e?.message || 'Portfolio refresh unavailable.');
      } finally {
        if (requestId === requestRef.current) setPortfolioLoading(false);
      }
    },
    [wallets]
  );

  // Recompute when wallet list changes
  useEffect(() => {
    if (!wallets || wallets.length === 0) {
      requestRef.current++;
      setPortfolioLoading(false);
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
