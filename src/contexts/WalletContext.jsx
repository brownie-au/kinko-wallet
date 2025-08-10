import React, { createContext, useContext, useState } from 'react';

const WalletContext = createContext();
export const useWallets = () => useContext(WalletContext);

export const WalletProvider = ({ children }) => {
  const [wallets, setWallets] = useState([]); // memory only

  const addWallet = (address, name) => {
    const addr = String(address || '').trim();
    if (!addr) return;
    setWallets((prev) => (prev.find((w) => w.address === addr) ? prev : [...prev, { address: addr, name }]));
  };

  const deleteWallet = (address) => setWallets((prev) => prev.filter((w) => w.address !== address));
  const replaceWallets = (arr) => setWallets(Array.isArray(arr) ? arr : []);

  return (
    <WalletContext.Provider value={{ wallets, addWallet, deleteWallet, replaceWallets }}>
      {children}
    </WalletContext.Provider>
  );
};
