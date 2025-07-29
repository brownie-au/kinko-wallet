import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import SimpleBarScroll from 'components/third-party/SimpleBar';
import navigation from 'menu-items/navigation';

export default function DrawerContent() {
  const walletPortfolio = navigation.children[0];
  const [open, setOpen] = useState(true); // Expanded by default
  const location = useLocation();

  // Helper: is menu item active?
  const isActive = (url) => location.pathname === url;

  return (
    <SimpleBarScroll style={{ height: 'calc(100vh - 74px)' }}>
      {/* ---- Sidebar Header ---- */}
      <div style={{ textAlign: 'center', padding: '24px 0 8px 0' }}>
        {/* Your logo is handled elsewhere, nothing added here! */}
        <div style={{
          fontSize: 11,
          color: '#b0b6be',
          letterSpacing: 1,
          fontWeight: 500,
          marginBottom: 8
        }}>
          SECURE INSIGHTS, NO KEYS REQUIRED
        </div>
      </div>

      {/* ---- Wallet Portfolio collapsible menu ---- */}
      <div className="pc-navbar">
        <div className={`pc-item pc-hasmenu${open ? ' pc-trigger active' : ''}`}>
          <div
            className="pc-link"
            style={{ cursor: 'pointer' }}
            onClick={() => setOpen((prev) => !prev)}
          >
            <span className="pc-micon">
              <i className="ph ph-wallet" />
            </span>
            <span className="pc-mtext">{walletPortfolio.title}</span>
            <span className="pc-arrow">
              <i className="ti ti-chevron-right" style={{
                transform: open ? 'rotate(90deg)' : 'none',
                transition: 'transform 0.2s'
              }} />
            </span>
          </div>
          <ul className="pc-submenu" style={{ display: open ? 'block' : 'none' }}>
            {walletPortfolio.children.map((item) => (
              <li
                key={item.id}
                className={`pc-item${isActive(item.url) ? ' active' : ''}`}
                style={{ position: 'relative' }}
              >
                <Link className="pc-link" to={item.url || '#'}>
                  {/* Blue dot: always show if active */}
                  {isActive(item.url) && (
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
                        display: 'inline-block',
                      }}
                    />
                  )}
                  <span className="pc-mtext" style={{ marginLeft: 18 }}>{item.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </SimpleBarScroll>
  );
}
