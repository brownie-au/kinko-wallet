// src/routes/ApplicationRoutes.jsx
import { lazy } from 'react';

import DashboardLayout from 'layout/Dashboard';
import Loadable from 'components/Loadable';

// application pages
const AppCalendar = Loadable(lazy(() => import('views/application/Calendar')));
const ApplicationTodo = Loadable(lazy(() => import('views/application/Todo')));
const AppMessage = Loadable(lazy(() => import('views/application/Message')));

// task pages
const AppTaskListPage = Loadable(lazy(() => import('views/application/task/List')));
const AppTaskBoardPage = Loadable(lazy(() => import('views/application/task/Board')));
const AppTaskDetailPage = Loadable(lazy(() => import('views/application/task/Detail')));

// gallery pages
const AdvanceGallery = Loadable(lazy(() => import('views/application/gallery/AdvanceGallery')));
const GridGallery = Loadable(lazy(() => import('views/application/gallery/GridGallery')));
const MasonryGallery = Loadable(lazy(() => import('views/application/gallery/MasonryGallery')));

// invoice pages
const InvoicePage = Loadable(lazy(() => import('views/application/invoice')));
const InvoiceSummaryPage = Loadable(lazy(() => import('views/application/invoice/InvoiceSummary')));
const InvoiceListPage = Loadable(lazy(() => import('views/application/invoice/InvoiceList')));

// users pages
const UserListPage = Loadable(lazy(() => import('views/application/users/UserList')));
const UserSocialProfilePage = Loadable(lazy(() => import('views/application/users/SocialProfile')));
const UserProfilePage = Loadable(lazy(() => import('views/application/users/Profile')));
const UserCardPage = Loadable(lazy(() => import('views/application/users/UserCard')));

// ✅ portfolio & wallet detail
const PortfolioOverview = Loadable(lazy(() => import('views/portfolio')));
const WalletDetail = Loadable(lazy(() => import('views/wallet/WalletDetail')));

const ApplicationRoutes = {
  path: '/',
  element: <DashboardLayout />,
  children: [
    // YOUR APP ROUTES
    {
      path: 'application',
      children: [
        { path: 'calendar', element: <AppCalendar /> },
        { path: 'message', element: <AppMessage /> },
        {
          path: 'task',
          children: [
            { path: 'list', element: <AppTaskListPage /> },
            { path: 'board', element: <AppTaskBoardPage /> },
            { path: 'detail', element: <AppTaskDetailPage /> }
          ]
        },
        { path: 'todo', element: <ApplicationTodo /> },
        {
          path: 'users',
          children: [
            { path: 'profile', element: <UserProfilePage /> },
            { path: 'social-profile', element: <UserSocialProfilePage /> },
            { path: 'user-card', element: <UserCardPage /> },
            { path: 'user-list', element: <UserListPage /> }
          ]
        },
        {
          path: 'gallery',
          children: [
            { path: 'grid', element: <GridGallery /> },
            { path: 'masonry', element: <MasonryGallery /> },
            { path: 'advance', element: <AdvanceGallery /> }
          ]
        },
        {
          path: 'invoice',
          children: [
            { path: 'invoice', element: <InvoicePage /> },
            { path: 'summary', element: <InvoiceSummaryPage /> },
            { path: 'list', element: <InvoiceListPage /> }
          ]
        }
      ]
    },

    // ✅ portfolio lives directly under dashboard
    { path: 'portfolio', element: <PortfolioOverview /> },

    // ✅ wallet detail (still under dashboard for consistent layout)
    { path: 'wallet/:address', element: <WalletDetail /> }
  ]
};

export default ApplicationRoutes;
