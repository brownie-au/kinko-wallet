// src/routes/KinkoRoutes.jsx
import { lazy } from 'react';
import DashboardLayout from 'layout/Dashboard';
import Loadable from 'components/Loadable';
import { WalletProvider } from 'contexts/WalletContext';

// Wallet pages
const WalletDashboard = Loadable(lazy(() => import('views/wallet/WalletDashboard')));
const WalletManage = Loadable(lazy(() => import('views/wallet/WalletManage')));
const WalletDetail = Loadable(lazy(() => import('views/wallet/WalletDetail')));

// View All (Portfolio)
const Portfolio = Loadable(lazy(() => import('views/portfolio/Portfolio')));

// Staking pages
const KwHexStaking = Loadable(lazy(() => import('views/kw-staking/kw-HexStaking')));

// ⚠️ Make sure the casing matches the actual file name on disk.
// If your file is named `kw-EhexStaking.jsx`, use that path instead.
const KwEhexStaking = Loadable(lazy(() => import('views/kw-staking/kw-eHexStaking')));
// const KwEhexStaking = Loadable(lazy(() => import('views/kw-staking/kw-EhexStaking')));

// Staking configs (Pulse = HEX, Ethereum = eHEX)
import { KW_STAKING_HEX_PULSE, KW_STAKING_EHEX_ETH } from 'config/kw-hex-staking-configs';

const KinkoRoutes = {
  path: '/',
  element: <DashboardLayout />,
  children: [
    {
      path: 'wallets',
      children: [
        { index: true, element: <WalletDashboard /> },
        { path: 'manage', element: <WalletManage /> }
      ]
    },
    { path: 'wallet/:address', element: <WalletDetail /> },

    // View All -> always render the new Portfolio page
    {
      path: 'portfolio',
      element: (
        <WalletProvider>
          <Portfolio />
        </WalletProvider>
      )
    },

    // HEX Staking (PulseChain) — label “HEX”
    {
      path: 'staking/hex',
      element: (
        <WalletProvider>
          <KwHexStaking config={KW_STAKING_HEX_PULSE} />
        </WalletProvider>
      )
    },

    // eHEX Staking (Ethereum) — label “eHEX”
    {
      path: 'staking/ehex',
      element: (
        <WalletProvider>
          <KwEhexStaking config={KW_STAKING_EHEX_ETH} />
        </WalletProvider>
      )
    }
  ]
};

export default KinkoRoutes;
