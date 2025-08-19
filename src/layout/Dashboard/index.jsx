// src/layout/Dashboard/index.jsx
import { Outlet } from 'react-router-dom';

import Drawer from './Drawer';
import Footer from './Footer';
import Header from './Header';
import Customizer from './Customizer';
import Breadcrumbs from 'components/Breadcrumbs';
import useConfig from 'hooks/useConfig';
import NavigationScroll from 'components/NavigationScroll';

import TickerBar from 'components/TickerBar';

export default function MainLayout() {
  const { container } = useConfig();

  return (
    <>
      <Customizer />
      <Drawer />

      {/* 🔝 Ticker first so it sits at the very top; header/hamburger comes below */}
      <TickerBar />

      <Header />

      <div className="pc-container">
        <div className={`pc-content ${container ? 'container' : ''}`}>
          <Breadcrumbs />
          <NavigationScroll>
            <Outlet />
          </NavigationScroll>
        </div>
      </div>

      <Footer />
    </>
  );
}
