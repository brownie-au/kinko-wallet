import { lazy } from 'react';

// project-imports
import Loadable from 'components/Loadable';
import DashboardLayout from 'layout/Dashboard';

// render - other pages
const OtherSamplePage = Loadable(lazy(() => import('views/SamplePage')));
const CacheInspector = Loadable(lazy(() => import('views/dev/CacheInspector')));

// ==============================|| OTHER ROUTING ||============================== //

const OtherRoutes = {
  path: '/',
  children: [
    {
      path: '/',
      element: <DashboardLayout />,
      children: [
        {
          path: 'other',
          children: [
            {
              path: 'sample-page',
              element: <OtherSamplePage />
            },
            // Hidden dev: cache inspector (not linked; open /__/cache)
            { path: '__/cache', element: <CacheInspector /> }
          ]
        }
      ]
    }
  ]
};

export default OtherRoutes;
