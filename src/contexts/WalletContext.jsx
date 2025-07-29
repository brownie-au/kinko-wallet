import React, { createContext, useContext, useEffect, useState } from 'react';

const WalletContext = createContext();

export const useWallets = () => useContext(WalletContext);

export const WalletProvider = ({ children }) => {
  const [wallets, setWallets] = useState([]);

  // Load wallets from localStorage on first mount
  useEffect(() => {
    const data = localStorage.getItem('wallets');
    setWallets(data ? JSON.parse(data) : []);
  }, []);

  // Save wallets to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('wallets', JSON.stringify(wallets));
  }, [wallets]);

  const addWallet = (address, name) => {
    if (!address || wallets.find(w => w.address === address)) return;
    setWallets([...wallets, { address, name }]);
  };

  const deleteWallet = (address) => {
    setWallets(wallets.filter(w => w.address !== address));
  };

  return (
    <WalletContext.Provider value={{ wallets, addWallet, deleteWallet }}>
      {children}
    </WalletContext.Provider>
  );
};
