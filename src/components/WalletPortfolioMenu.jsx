import React from 'react';
import { useWallets } from '../contexts/WalletContext';
import { Nav } from 'react-bootstrap';

const WalletPortfolioMenu = () => {
  // Defensive destructuring: never crashes if useWallets() returns undefined/null
  const { wallets = [] } = useWallets() || {};

  return (
    <div>
      <Nav.Link href="/portfolio"><strong>View All</strong></Nav.Link>
      {wallets.length > 0 ? (
        wallets.map((w) => (
          <Nav.Link key={w.address} href={`/wallet/${w.address}`}>
            {w.name || 'Unnamed'} - 0x...{w.address.slice(-4)}
          </Nav.Link>
        ))
      ) : (
        <div style={{ padding: '8px 16px', color: '#888' }}>No wallets found.</div>
      )}
      <Nav.Link href="/wallets/manage"><strong>Manage Wallets</strong></Nav.Link>
    </div>
  );
};

export default WalletPortfolioMenu;
