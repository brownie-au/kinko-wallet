// src/layout/Dashboard/Drawer/DrawerContent/index.jsx
import { useState, useMemo, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import SimpleBarScroll from 'components/third-party/SimpleBar';
import navigation from 'menu-items/navigation';

const normalizePath = (p = '') => {
  const base = p.split('#')[0].split('?')[0];
  if (!base) return '/';
  return base === '/' ? '/' : base.replace(/\/+$/, '');
};

export default function DrawerContent() {
  const location = useLocation();
  const pathname = normalizePath(location.pathname);
  const isActive = (url) => url && pathname === normalizePath(url);

  // ---------- build menu, promote Manage Wallets ----------
  const topItems = useMemo(() => {
    const src = Array.isArray(navigation?.children) ? navigation.children : [];
    const cloned = src.map((it) => ({
      ...it,
      children: Array.isArray(it.children) ? it.children.map((c) => ({ ...c })) : []
    }));

    const wpIdx = cloned.findIndex((it) => it?.id === 'wallet-portfolio');
    let manageWalletsChild = null;

    if (wpIdx >= 0 && Array.isArray(cloned[wpIdx].children)) {
      const ci = cloned[wpIdx].children.findIndex(
        (c) =>
          c?.id === 'manage-wallets' ||
          normalizePath(c?.url) === '/wallets/manage' ||
          (c?.title || '').toLowerCase() === 'manage wallets'
      );
      if (ci >= 0) {
        const [picked] = cloned[wpIdx].children.splice(ci, 1);
        manageWalletsChild = picked;
      }
    }

    const promoted =
      manageWalletsChild && {
        id: 'manage-wallets',
        type: 'item',
        title: manageWalletsChild.title || 'Manage Wallets',
        url: normalizePath(manageWalletsChild.url || '/wallets/manage'),
        icon: manageWalletsChild.icon || <i className="ti ti-settings" aria-hidden="true" />
      };

    const dashboard = cloned.find((it) => it?.id === 'dashboard');
    const walletPortfolio = cloned.find((it) => it?.id === 'wallet-portfolio');
    const rest = cloned.filter((it) => it?.id !== 'dashboard' && it?.id !== 'wallet-portfolio');

    const ordered = [];
    if (dashboard) ordered.push(dashboard);
    if (walletPortfolio) ordered.push(walletPortfolio);
    if (promoted) ordered.push(promoted);
    ordered.push(...rest);
    return ordered;
  }, [pathname]);

  // ---------- wallet-route detector ----------
  const isWalletDetailRoute = pathname.startsWith('/wallet/'); // individual wallet pages ONLY

  // manual toggle state
  const [openMap, setOpenMap] = useState({});

  // Auto-collapse when leaving wallet area (dashboard/manage/etc.)
  useEffect(() => {
    const leavingWalletArea =
      !isWalletDetailRoute &&
      normalizePath(pathname) !== '/wallets' &&
      normalizePath(pathname) !== '/wallets/'; // harmless if 'wallets/' never occurs
    if (leavingWalletArea) {
      setOpenMap((prev) => ({ ...prev, 'wallet-portfolio': false }));
    }
  }, [pathname, isWalletDetailRoute]);

  const toggleOpen = (id) => setOpenMap((prev) => ({ ...prev, [id]: !prev[id] }));

  // ---------- render helpers ----------
  const renderLeafItem = (item) => (
    <div className={`pc-item${isActive(item.url) ? ' active' : ''}`} key={item.id}>
      <Link className="pc-link" to={item.url || '#'}>
        <span className="pc-micon">{item.icon || null}</span>
        <span className="pc-mtext">{item.title}</span>
      </Link>
    </div>
  );

  const renderCollapse = (item) => {
    const children = Array.isArray(item.children) ? item.children : [];

    // For Wallet Portfolio: open if ANY child is active (including "View All"),
    // or if on a wallet detail route, or if the user manually toggled it open.
    const isPortfolio = item.id === 'wallet-portfolio';

    let anyChildActive = false;
    if (isPortfolio) {
      const current = pathname;
      anyChildActive = children.some((c) => {
        const u = normalizePath(c?.url || '');
        if (!u) return false;
        if (current === u) return true;            // exact match (e.g., /wallets)
        if (current.startsWith(u + '/')) return true; // child under a deeper subpath
        return false;
      });
    }

    const isOpen = isPortfolio
      ? anyChildActive || isWalletDetailRoute || !!openMap[item.id]
      : !!openMap[item.id];

    return (
      <div key={item.id} className={`pc-item pc-hasmenu${isOpen ? ' pc-trigger active' : ''}`}>
        <div className="pc-link" style={{ cursor: 'pointer' }} onClick={() => toggleOpen(item.id)}>
          <span className="pc-micon">{item.icon || null}</span>
          <span className="pc-mtext">{item.title}</span>
          <span className="pc-arrow">
            <i
              className="ti ti-chevron-right"
              style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}
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

      <div className="pc-navbar">
        {topItems.map((item) => {
          const children = Array.isArray(item.children) ? item.children : [];
          if (item.type === 'collapse' && children.length) return renderCollapse(item);
          return renderLeafItem(item);
        })}
      </div>
    </SimpleBarScroll>
  );
}
