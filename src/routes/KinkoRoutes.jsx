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

// NEW: HEX Staking page
const KwHexStaking = Loadable(lazy(() => import('views/kw-staking/kw-HexStaking')));

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

    // NEW: HEX Staking route
    {
      path: 'staking/hex',
      element: (
        <WalletProvider>
          <KwHexStaking />
        </WalletProvider>
      )
    }
  ]
};

export default KinkoRoutes;
