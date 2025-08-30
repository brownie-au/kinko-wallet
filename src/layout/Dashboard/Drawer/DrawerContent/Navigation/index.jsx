// src/layout/Dashboard/Drawer/DrawerContent/Navigation/index.jsx
import PropTypes from 'prop-types';
import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

import ListGroup from 'react-bootstrap/ListGroup';
import Badge from 'react-bootstrap/Badge';
import clsx from 'clsx';

import { MenuOrientation, ThemeDirection } from 'config';
import useConfig from 'hooks/useConfig';
import menuItems from 'menu-items';

const LS_KEY = 'kw:sidebarOpen:v1';

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
  } catch {}
};

const collectUrls = (node) => {
  if (!node) return [];
  if (node.type === 'item') return node.url ? [node.url] : [];
  if (Array.isArray(node.children)) return node.children.flatMap(collectUrls);
  return [];
};

const isDisabled = (item) => !!item.disabled;

function MenuItem({ item }) {
  if (isDisabled(item)) {
    return (
      <li className="pc-item">
        <span className="pc-link disabled">
          {item.icon && <span className="pc-micon">{item.icon}</span>}
          <span className="pc-mtext">{item.title}</span>
          <Badge className="pc-badge">Soon</Badge>
        </span>
      </li>
    );
  }
  return (
    <li className="pc-item">
      <NavLink to={item.url} className={({ isActive }) => clsx('pc-link', isActive && 'active')}>
        {item.icon && <span className="pc-micon">{item.icon}</span>}
        <span className="pc-mtext">{item.title}</span>
      </NavLink>
    </li>
  );
}
MenuItem.propTypes = { item: PropTypes.object.isRequired };

function NestedCollapse({ node, openMap, setOpen, themeDirection }) {
  const isOpen = !!openMap[node.id];

  return (
    <li className={clsx('pc-item kw-hasmenu', isOpen && 'kw-open')}>
      <div className="kw-toggle">
        <button
          type="button"
          className="pc-link text-start w-100 border-0 bg-transparent"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            e.nativeEvent?.stopImmediatePropagation?.();
            setOpen(node.id, !isOpen);
          }}
        >
          {node.icon && <span className="pc-micon">{node.icon}</span>}
          <span className="pc-mtext">{node.title}</span>
          <span className={clsx('pc-arrow', isOpen && 'kw-rot')}>
            <i className="ti ti-chevron-right" />
          </span>
          {node.badge && <Badge className="pc-badge">{node.badge}</Badge>}
        </button>
      </div>

      <ul className={clsx('pc-submenu', themeDirection === ThemeDirection.RTL && 'edge', isOpen ? 'kw-show' : 'kw-hide')}>
        {Array.isArray(node.children) &&
          node.children.map((child) =>
            child.type === 'item' ? (
              <MenuItem key={child.id} item={child} />
            ) : child.type === 'collapse' ? (
              <NestedCollapse key={child.id} node={child} openMap={openMap} setOpen={setOpen} themeDirection={themeDirection} />
            ) : null
          )}
      </ul>
    </li>
  );
}

NestedCollapse.propTypes = {
  node: PropTypes.object.isRequired,
  openMap: PropTypes.object.isRequired,
  setOpen: PropTypes.func.isRequired,
  themeDirection: PropTypes.oneOf([ThemeDirection.LTR, ThemeDirection.RTL]).isRequired
};

export default function Navigation() {
  const { pathname } = useLocation();
  const { menuOrientation, themeDirection } = useConfig();
  const navRef = useRef(null);

  const groups = useMemo(() => menuItems.items || [], []);

  const [openMap, setOpenMap] = useState(() => readOpenMap());
  const setOpen = (id, next) => {
    setOpenMap((prev) => {
      // remove falsy keys to keep storage clean
      const updated = { ...prev };
      if (next) updated[id] = true;
      else delete updated[id];
      writeOpenMap(updated);
      return updated;
    });
  };

  // Initial deep-link auto-open: run once on mount (kept).
  const didInitRef = useRef(false);
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;

    const draft = { ...readOpenMap() };
    let changed = false;

    const scan = (node) => {
      if (!node) return;
      if (node.type === 'collapse') {
        const urls = collectUrls(node);
        if (urls.some((u) => u && pathname.startsWith(u)) && !draft[node.id]) {
          draft[node.id] = true;
          changed = true;
        }
      }
      if (Array.isArray(node.children)) node.children.forEach(scan);
    };
    groups.forEach(scan);

    if (changed) {
      setOpenMap(draft);
      writeOpenMap(draft);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 🔒 Persistence guard:
  // If some parent remounts or a template script strips classes on navigation,
  // re-hydrate the open state from localStorage after every route change.
  useEffect(() => {
    const stored = readOpenMap();
    setOpenMap((prev) => {
      const a = JSON.stringify(prev);
      const b = JSON.stringify(stored);
      return a === b ? prev : stored;
    });
  }, [pathname]);

  return (
    <ul ref={navRef} className={`pc-navbar d-block ${menuOrientation === MenuOrientation.TAB ? 'pc-tab-link nav flex-column' : ''}`}>
      {groups.map((group) => {
        if (group.type !== 'group') {
          return (
            <h6 key={group.id} color="error" className="align-items-center">
              Fix - Navigation Group
            </h6>
          );
        }

        return (
          <ListGroup as="li" key={group.id} className="pc-item border-0 bg-transparent">
            {group.title && <div className="pc-navbar-title px-3 pt-2 pb-1 text-uppercase opacity-75 small">{group.title}</div>}

            {(group.children || []).map((node) => {
              if (node.type === 'item') {
                return (
                  <ListGroup key={node.id} className="pc-item border-0 bg-transparent">
                    <MenuItem item={node} />
                  </ListGroup>
                );
              }
              if (node.type === 'collapse') {
                const isOpen = !!openMap[node.id];
                return (
                  <ListGroup key={node.id} className={clsx('pc-item kw-hasmenu border-0 bg-transparent', isOpen && 'kw-open')}>
                    <div className="kw-toggle">
                      <button
                        type="button"
                        className="pc-link text-start w-100 border-0 bg-transparent"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          e.nativeEvent?.stopImmediatePropagation?.();
                          setOpen(node.id, !isOpen);
                        }}
                      >
                        {node.icon && <span className="pc-micon">{node.icon}</span>}
                        <span className="pc-mtext">{node.title}</span>
                        <span className={clsx('pc-arrow', isOpen && 'kw-rot')}>
                          <i className="ti ti-chevron-right" />
                        </span>
                        {node.badge && <Badge className="pc-badge">{node.badge}</Badge>}
                      </button>
                    </div>

                    <ul className={clsx('pc-submenu', themeDirection === ThemeDirection.RTL && 'edge', isOpen ? 'kw-show' : 'kw-hide')}>
                      {Array.isArray(node.children) &&
                        node.children.map((child) =>
                          child.type === 'item' ? (
                            <MenuItem key={child.id} item={child} />
                          ) : child.type === 'collapse' ? (
                            <NestedCollapse
                              key={child.id}
                              node={child}
                              openMap={openMap}
                              setOpen={setOpen}
                              themeDirection={themeDirection}
                            />
                          ) : null
                        )}
                    </ul>
                  </ListGroup>
                );
              }
              return null;
            })}
          </ListGroup>
        );
      })}
    </ul>
  );
}

Navigation.propTypes = {
  selectedItems: PropTypes.any,
  setSelectedItems: PropTypes.any,
  setSelectTab: PropTypes.any
};
