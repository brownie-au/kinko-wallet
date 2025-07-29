import { lazy } from 'react';
import DashboardLayout from 'layout/Dashboard';
import Loadable from 'components/Loadable';

// --- Load Kinko Wallet pages ---
const WalletDashboard = Loadable(lazy(() => import('views/wallet/WalletDashboard')));
const WalletManage = Loadable(lazy(() => import('views/wallet/WalletManage')));
const WalletDetail = Loadable(lazy(() => import('components/WalletDetail')));
const PortfolioDashboard = Loadable(lazy(() => import('views/PortfolioDashboard')));

const KinkoRoutes = {
  path: '/',
  element: <DashboardLayout />,
  children: [
    // Wallet Dashboard Pages
    {
      path: 'wallets',
      children: [
        {
          index: true,
          element: <WalletDashboard />
        },
        {
          path: 'manage',
          element: <WalletManage />
        }
      ]
    },
    {
      path: 'wallet/:address',
      element: <WalletDetail />
    },

    // Portfolio Dashboard Route
    {
      path: 'portfolio',
      element: <PortfolioDashboard />
    }
  ]
};

export default KinkoRoutes;
