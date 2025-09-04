// src/layout/Dashboard/Drawer/DrawerContent/index.jsx
import { useState, useMemo, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import SimpleBarScroll from 'components/third-party/SimpleBar';
import navigation from 'menu-items/navigation';
import { useWallets } from 'contexts/WalletContext';

// ---------- utils ----------
const normalizePath = (p = '') => {
  const base = p.split('#')[0].split('?')[0];
  if (!base) return '/';
  return base === '/' ? '/' : base.replace(/\/+$/, '');
};
const isExact = (a, b) => normalizePath(a) === normalizePath(b);

export default function DrawerContent() {
  const location = useLocation();
  const pathname = normalizePath(location.pathname);
  const isActive = (url) => url && isExact(url, pathname);

  // ---------- build menu, promote Manage Wallets ----------
  const { wallets } = useWallets();

  const topItems = useMemo(() => {
    const src = Array.isArray(navigation?.children) ? navigation.children : [];
    const cloned = src.map((it) => ({
      ...it,
      children: Array.isArray(it.children) ? it.children.map((c) => ({ ...c })) : []
    }));

    // promote "Manage Wallets" as a top-level leaf item
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

    // Dynamically rebuild Wallet Portfolio children from current wallets
    if (walletPortfolio) {
      const list = Array.isArray(wallets) ? wallets : [];
      const walletChildren = [
        { id: 'wallet-view-all', title: 'View All', type: 'item', url: '/portfolio' },
        ...list.map((w, i) => ({
          id: `wallet-${i}-${(w.address || '').slice(-4)}`,
          title: `${w?.name || 'Unnamed'} - 0x...${(w?.address || '').slice(-4)}`,
          type: 'item',
          url: `/wallet/${w.address}`
        })),
        { id: 'wallet-manage', title: 'Manage Wallets', type: 'item', url: '/wallets/manage' }
      ];
      walletPortfolio.children = walletChildren;
    }
    const rest = cloned.filter((it) => it?.id !== 'dashboard' && it?.id !== 'wallet-portfolio');

    const ordered = [];
    if (dashboard) ordered.push(dashboard);
    if (walletPortfolio) ordered.push(walletPortfolio);
    if (promoted) ordered.push(promoted);
    ordered.push(...rest);
    return ordered;
  }, [pathname, wallets]);

  // ---------- route helpers ----------
  const isWalletDetailRoute = pathname.startsWith('/wallet/'); // individual wallet pages ONLY

  // ---------- OPEN STATE (always collapsed by default; no persistence) ----------
  const [openMap, setOpenMap] = useState({}); // start closed every time
  const setGroupOpen = (id, next) =>
    setOpenMap((prev) => ({ ...prev, [id]: !!next }));
  const toggleOpen = (id) =>
    setOpenMap((prev) => ({ ...prev, [id]: !prev[id] }));

  // One-time deep-link: if current route sits inside a group, open that group (don’t touch others)
  const didInitRef = useRef(false);
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;

    const norm = (p = '') => normalizePath(p || '/');

    const containsPath = (node, path) => {
      if (!node) return false;
      if (Array.isArray(node.children) && node.children.length) {
        if (node.children.some((c) => (c?.url || c?.link) && norm(c.url || c.link) === path)) return true;
        return node.children.some((c) => containsPath(c, path));
      }
      return (node?.url || node?.link) ? norm(node.url || node.link) === path : false;
    };

    const parentIdForPath = (nodes = [], path) => {
      for (const n of nodes) {
        if (Array.isArray(n?.children) && n.children.length) {
          if (containsPath(n, path)) return n.id;
        }
      }
      return null;
    };

    const parent = parentIdForPath(navigation?.children || [], pathname);
    if (parent) setGroupOpen(parent, true);

    // also open Wallet Portfolio when on a wallet detail page
    if (isWalletDetailRoute) setGroupOpen('wallet-portfolio', true);
  }, [pathname, isWalletDetailRoute]);

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
    const isPortfolio = item.id === 'wallet-portfolio';

    // Portfolio special: consider "View All" (/wallets) and any wallet sub-route
    const anyChildActive = isPortfolio
      ? children.some((c) => {
        const u = normalizePath(c?.url || '');
        if (!u) return false;
        if (pathname === u) return true;       // exact (e.g. /wallets)
        if (pathname.startsWith(u + '/')) return true;
        return false;
      })
      : children.some((c) => isExact(c?.url, pathname));

    const isOpen =
      (openMap[item.id] ?? false) ||
      anyChildActive ||
      (isPortfolio && isWalletDetailRoute);

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
