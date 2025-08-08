import { useEffect, useRef, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';

// react-bootstrap
import Image from 'react-bootstrap/Image';

// project-imports
import DrawerContent from './DrawerContent';
import { handlerDrawerOpen, useGetMenuMaster } from 'api/menu';
import { MenuOrientation } from 'config';
import useConfig from 'hooks/useConfig';

// assets
import logo from 'assets/images/logo-white.svg';
import DarkLogo from 'assets/images/logo-dark.svg';

// ==============================|| MAIN LAYOUT - DRAWER ||============================== //

export default function MainDrawer() {
  const { menuMaster } = useGetMenuMaster();
  const drawerOpen = menuMaster?.isDashboardDrawerOpened;
  const [selectedItems, setSelectedItems] = useState();
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 1024);
  const overlayRef = useRef(null);
  const { menuOrientation, sidebarTheme } = useConfig();
  const location = useLocation();

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (overlayRef.current?.contains(event.target)) {
        handlerDrawerOpen(false);
      }
    };
    if (isMobile) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMobile]);

  const isLargeScreen = window.innerWidth > 1024;

  useEffect(() => {
    const removeClasses = ['layout-2', 'layout-3', 'preset-1', 'preset-brand-1'];
    const resetAttributes = () => {
      document.body.classList.remove(...removeClasses);
    };

    resetAttributes();

    const pathname = location.pathname;

    if (!isLargeScreen) {
      document.body.setAttribute('data-pc-layout', 'vertical');
    }

    if (pathname === '/layouts/layout-2') {
      document.body.removeAttribute('data-pc-layout');
      document.body.setAttribute('data-pc-preset', 'preset-1');
      document.body.classList.add('layout-2', 'preset-1');
    }

    if (pathname === '/layouts/layout-3') {
      document.body.removeAttribute('data-pc-layout');
      document.body.setAttribute('data-pc-preset', 'preset-1');
      document.body.classList.add('layout-3', 'preset-brand-1');
    }

    // always run layout logic
    switch (menuOrientation) {
      case MenuOrientation.TAB:
      case MenuOrientation.VERTICAL:
        document.body.setAttribute('data-pc-layout', menuOrientation.toLowerCase());
        break;
      case MenuOrientation.LAYOUT2:
        document.body.setAttribute('data-pc-layout', MenuOrientation.VERTICAL);
        document.body.setAttribute('data-pc-preset', 'preset-1');
        document.body.classList.add('layout-2', 'preset-1');
        break;
      case MenuOrientation.LAYOUT3:
        document.body.setAttribute('data-pc-layout', MenuOrientation.VERTICAL);
        document.body.setAttribute('data-pc-preset', 'preset-1');
        document.body.classList.add('layout-3', 'preset-brand-1');
        break;
      default:
        break;
    }
  }, [menuOrientation, isLargeScreen, location.pathname]);

  return (
    <nav id="pc-sidebar" className={`pc-sidebar ${drawerOpen ? 'pc-sidebar-hide mob-sidebar-active' : ''} `}>
      <div className="navbar-wrapper">
        <div className="m-header">
          {/* Make the brand a link back to the landing page */}
          <Link to="/" className="b-brand text-primary" aria-label="Go to Kinko Wallet home">
            <Image
              src={sidebarTheme === true ? DarkLogo : logo}
              fluid
              className="logo logo-lg"
              alt="Kinko Wallet"
            />
          </Link>
        </div>

        <div className={menuOrientation === MenuOrientation.TAB ? 'tab-container' : 'navbar-content'}>
          <DrawerContent selectedItems={selectedItems} setSelectedItems={setSelectedItems} />
        </div>
      </div>
      {drawerOpen && isMobile && <div className="pc-menu-overlay" ref={overlayRef} />}
    </nav>
  );
}
