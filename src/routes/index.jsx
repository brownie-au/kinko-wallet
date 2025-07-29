import KinkoRoutes from './KinkoRoutes';
import { lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';

// project-imports
import AdminPanelRoutes from './AdminPanelRoutes';
import ApplicationRoutes from './ApplicationRoutes';
import ChartMapRoutes from './ChartMapRoutes';
import ComponentsRoutes from './ComponentsRoutes';
import FormsRoutes from './FormsRoutes';
import OtherRoutes from './OtherRoutes';
import PagesRoutes from './PagesRoutes';
import NavigationRoutes from './NavigationRoutes';
import TablesRoutes from './TablesRoutes';

import Loadable from 'components/Loadable';
import SimpleLayout from 'layout/Simple';
import WalletDetail from '../views/wallet/WalletDetail';

const PagesLanding = Loadable(lazy(() => import('../views/Landing')));

// ==============================|| ROUTING RENDER ||============================== //

const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <SimpleLayout />,
      children: [
        {
          index: true,
          element: <PagesLanding />
        },
        {
          path: '/landing',
          element: <PagesLanding />
        },
        {
          path: '/wallet-detail',          // <-- NEW ROUTE
          element: <WalletDetail />        // <-- USE COMPONENT
        }
      ]
    },
    ApplicationRoutes,
    AdminPanelRoutes,
    NavigationRoutes,
    ComponentsRoutes,
    FormsRoutes,
    TablesRoutes,
    PagesRoutes,
    OtherRoutes,
    ChartMapRoutes,

    // --- Our New Wallet Routes ---
    KinkoRoutes
  ],
  {
    basename: import.meta.env.VITE_APP_BASE_NAME
  }
);

export default router;
