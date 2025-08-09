// src/routes/index.jsx
import { lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';

import AdminPanelRoutes from './AdminPanelRoutes';
import ApplicationRoutes from './ApplicationRoutes';
import ChartMapRoutes from './ChartMapRoutes';
import ComponentsRoutes from './ComponentsRoutes';
import FormsRoutes from './FormsRoutes';
import OtherRoutes from './OtherRoutes';
import PagesRoutes from './PagesRoutes';
import NavigationRoutes from './NavigationRoutes';
import TablesRoutes from './TablesRoutes';
import KinkoRoutes from './KinkoRoutes';

import Loadable from 'components/Loadable';
import SimpleLayout from 'layout/Simple';

// Landing
const PagesLanding = Loadable(lazy(() => import('views/Landing')));

const router = createBrowserRouter(
  [
    // Landing-only group (no sidebar)
    {
      path: '/',
      element: <SimpleLayout />,
      children: [
        { index: true, element: <PagesLanding /> },
        { path: 'landing', element: <PagesLanding /> }
      ]
    },

    // All dashboard content (with sidebar/header)
    ApplicationRoutes,
    AdminPanelRoutes,
    NavigationRoutes,
    ComponentsRoutes,
    FormsRoutes,
    TablesRoutes,
    PagesRoutes,
    OtherRoutes,
    ChartMapRoutes,
    KinkoRoutes
  ],
  {
    basename: import.meta.env.VITE_APP_BASE_NAME
  }
);

export default router;
