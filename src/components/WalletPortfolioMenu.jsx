// src/components/WalletPortfolioMenu.jsx
import React from 'react';
import { Nav } from 'react-bootstrap';
import { LinkContainer } from 'react-router-bootstrap';
import { useWallets } from '../contexts/WalletContext';

const WalletPortfolioMenu = () => {
  const ctx = (() => { try { return useWallets(); } catch { return undefined; } })();
  const wallets = Array.isArray(ctx?.wallets) ? ctx.wallets : [];
  const tail = (a='') => (a ? a.slice(-4) : '----');

  return (
    <div>
      <LinkContainer to="/portfolio">
        <Nav.Link>
          <strong>View All</strong>
        </Nav.Link>
      </LinkContainer>

      {wallets.length ? (
        wallets.map((w) => (
          <LinkContainer key={w.address || w.name} to={`/wallet/${w.address}`}>
            <Nav.Link>
              {w?.name || 'Unnamed'} – 0x...{tail(w?.address)}
            </Nav.Link>
          </LinkContainer>
        ))
      ) : (
        <div style={{ padding: '8px 16px', color: '#888' }}>No wallets found.</div>
      )}

      <LinkContainer to="/wallets/manage">
        <Nav.Link>
          <strong>Manage Wallets</strong>
        </Nav.Link>
      </LinkContainer>
    </div>
  );
};

export default WalletPortfolioMenu;
