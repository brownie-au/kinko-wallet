// src/layout/Dashboard/Drawer/DrawerContent/index.jsx
import { useState, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import SimpleBarScroll from 'components/third-party/SimpleBar';
import navigation from 'menu-items/navigation';

export default function DrawerContent() {
  const location = useLocation();
  const isActive = (url) => url && location.pathname === url;

  // Safe list of top-level menu items (Dashboard, Wallet Portfolio, etc.)
  const topItems = useMemo(
    () => (Array.isArray(navigation?.children) ? navigation.children : []),
    []
  );

  // Track open/closed state for collapsible items (default open only for wallet-portfolio)
  const [openMap, setOpenMap] = useState(() => {
    const init = {};
    topItems.forEach((it) => {
      if (it?.id === 'wallet-portfolio') init[it.id] = true; // open by default
    });
    return init;
  });

  const toggleOpen = (id) =>
    setOpenMap((prev) => ({ ...prev, [id]: !prev[id] }));

  // ----- Render helpers -----
  const renderLeafItem = (item) => (
    <div className="pc-item" key={item.id}>
      <Link className="pc-link" to={item.url || '#'}>
        <span className="pc-micon">{item.icon || null}</span>
        <span className="pc-mtext">{item.title}</span>
      </Link>
    </div>
  );

  const renderCollapse = (item) => {
    const children = Array.isArray(item.children) ? item.children : [];
    const isOpen = !!openMap[item.id];

    return (
      <div
        key={item.id}
        className={`pc-item pc-hasmenu${isOpen ? ' pc-trigger active' : ''}`}
      >
        <div
          className="pc-link"
          style={{ cursor: 'pointer' }}
          onClick={() => toggleOpen(item.id)}
        >
          <span className="pc-micon">{item.icon || null}</span>
          <span className="pc-mtext">{item.title}</span>
          <span className="pc-arrow">
            <i
              className="ti ti-chevron-right"
              style={{
                transform: isOpen ? 'rotate(90deg)' : 'none',
                transition: 'transform 0.2s'
              }}
            />
          </span>
        </div>

        <ul className="pc-submenu" style={{ display: isOpen ? 'block' : 'none' }}>
          {children.map((child) => (
            <li
              key={child.id}
              className={`pc-item${isActive(child.url) ? ' active' : ''}`}
              style={{ position: 'relative' }}
            >
              <Link className="pc-link" to={child.url || '#'}>
                {/* active dot */}
                {isActive(child.url) && (
                  <span
                    className="pc-dot"
                    style={{
                      position: 'absolute',
                      left: 2,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: '#20c7a7',
                      display: 'inline-block'
                    }}
                  />
                )}
                <span className="pc-mtext" style={{ marginLeft: 18 }}>
                  {child.title}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <SimpleBarScroll style={{ height: 'calc(100vh - 74px)' }}>
      {/* ---- Sidebar Header ---- */}
      <div style={{ textAlign: 'center', padding: '24px 0 8px 0' }}>
        <div
          style={{
            fontSize: 11,
            color: '#b0b6be',
            letterSpacing: 1,
            fontWeight: 500,
            marginBottom: 8
          }}
        >
          SECURE INSIGHTS, NO KEYS REQUIRED
        </div>
      </div>

      {/* ---- Menu ---- */}
      <div className="pc-navbar">
        {topItems.map((item) => {
          const children = Array.isArray(item.children) ? item.children : [];
          if (item.type === 'collapse' && children.length) return renderCollapse(item);
          // treat everything else as a leaf link
          return renderLeafItem(item);
        })}
      </div>
    </SimpleBarScroll>
  );
}
