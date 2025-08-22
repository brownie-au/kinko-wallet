// src/layout/Dashboard/Drawer/DrawerContent/Navigation/NavCollapse.jsx
import PropTypes from 'prop-types';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, matchPath, useLocation, useNavigate } from 'react-router-dom';

// react-bootstrap
import Badge from 'react-bootstrap/Badge';
import ListGroup from 'react-bootstrap/ListGroup';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Tooltip from 'react-bootstrap/Tooltip';

// third-party
import { FormattedMessage } from 'react-intl';

// project-imports
import NavItem from './NavItem';
import { useGetMenuMaster } from 'api/menu';
import useConfig from 'hooks/useConfig';
import { MenuOrientation, ThemeDirection } from 'config';

// ------------- PERSISTENT OPEN-STATE (no accordion) -----------------
const LS_KEY = 'kw:sidebarOpen:v2';
const readOpenMap = () => {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || {};
  } catch {
    return {};
  }
};
const writeOpenMap = (map) => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(map || {}));
  } catch { }
};
// -------------------------------------------------------------------

export default function NavCollapse({
  menu,
  level,
  parentId,
  // kept for API compatibility, but not used for accordion anymore
  setSelectedItems,
  selectedItems,
  setSelectedLevel,
  selectedLevel
}) {
  const { menuMaster } = useGetMenuMaster();
  const navigation = useNavigate();
  const drawerOpen = menuMaster?.isDashboardDrawerOpened;

  const { menuOrientation, themeDirection } = useConfig();
  const location = useLocation();
  const pathname = location.pathname;

  // Determine if any descendant matches current path (used only once on mount)
  const isMenuActive = (node, currentPath) => {
    if (!node) return false;
    if (node.type === 'item') return (node.url || node.link) === currentPath;
    if (node.type === 'collapse' && Array.isArray(node.children)) {
      return node.children.some((child) => isMenuActive(child, currentPath));
    }
    return false;
  };

  // ---- open state is per group, persisted in localStorage ----
  const [openMap, setOpenMap] = useState(() => readOpenMap());
  const open = !!openMap[menu.id];

  const setOpen = (next) => {
    setOpenMap((m) => {
      const n = { ...m, [menu.id]: !!next };
      writeOpenMap(n);
      return n;
    });
  };

  const toggleOpen = () => setOpen(!open);

  // One-time deep-link convenience: if current route is inside this group, open it.
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    if (isMenuActive(menu, pathname)) setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Click handler (mobile/desktop consistent): toggle this group only; never closes siblings.
  const handleClick = (isRedirect) => {
    const isMobile = window.innerWidth <= 1024;
    setSelectedLevel?.(level);

    // Always allow toggling this group. We no longer collapse siblings.
    toggleOpen();

    // Optional redirect when the header itself has a URL (rare).
    if ((isMobile || !drawerOpen) && menu.url && isRedirect) {
      navigation(`${menu.url}`);
    }
  };

  // Children render (unchanged)
  const navCollapse = useMemo(
    () =>
      menu.children?.map((item) => {
        switch (item.type) {
          case 'collapse':
            return (
              <NavCollapse
                key={item.id}
                setSelectedItems={setSelectedItems}
                setSelectedLevel={setSelectedLevel}
                selectedLevel={selectedLevel}
                selectedItems={selectedItems}
                menu={item}
                level={level + 1}
                parentId={parentId}
              />
            );
          case 'item':
            return <NavItem key={item.id} item={item} level={level + 1} />;
          default:
            return (
              <h6 key={item.id} color="error" className="align-center">
                Fix - Collapse or Item
              </h6>
            );
        }
      }),
    [menu.children, level, parentId, selectedItems, selectedLevel, setSelectedItems, setSelectedLevel]
  );

  return (
    <>
      {menuOrientation !== MenuOrientation.TAB ? (
        <ListGroup className={`pc-item pc-hasmenu ${open ? 'pc-trigger' : ''}`}>
          <a className="pc-link" href="#!" onClick={() => handleClick(true)}>
            {menu.icon && (
              <span className="pc-micon">
                <i className={typeof menu.icon === 'string' ? menu.icon : menu.icon?.props.className} />
              </span>
            )}
            <span className="pc-mtext">
              <FormattedMessage id={menu.title} />
            </span>
            <span className="pc-arrow">
              <i className="ti ti-chevron-right" />
            </span>
            {menu.badge && <Badge className="pc-badge">{menu.badge}</Badge>}
          </a>
          {open && <ul className={`pc-submenu ${themeDirection === ThemeDirection.RTL ? 'edge' : ''}`}>{navCollapse}</ul>}
        </ListGroup>
      ) : (
        <>
          {menuOrientation !== MenuOrientation.TAB && (
            <ListGroup className={`pc-item pc-hasmenu ${open ? 'pc-trigger' : ''} ${isMenuActive(menu, pathname) ? 'active' : ''}`}>
              <OverlayTrigger
                placement="right"
                overlay={
                  <Tooltip id={`tooltip-${menu.title}`}>
                    <FormattedMessage id={menu.title} />
                  </Tooltip>
                }
              >
                <Link
                  to="#!"
                  className="pc-link"
                  onClick={() => {
                    handleClick(!open);
                  }}
                >
                  {menu.icon && (
                    <span className="pc-micon">
                      <i className={typeof menu.icon === 'string' ? menu.icon : menu.icon?.props.className} />
                    </span>
                  )}
                </Link>
              </OverlayTrigger>
            </ListGroup>
          )}
        </>
      )}
    </>
  );
}

NavCollapse.propTypes = {
  menu: PropTypes.any,
  level: PropTypes.number,
  parentId: PropTypes.string,
  setSelectedItems: PropTypes.oneOfType([PropTypes.func, PropTypes.any]),
  selectedItems: PropTypes.any,
  setSelectedLevel: PropTypes.func,
  selectedLevel: PropTypes.number
};
