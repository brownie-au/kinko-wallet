import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import Button from 'react-bootstrap/Button';
import Dropdown from 'react-bootstrap/Dropdown';
import Image from 'react-bootstrap/Image';
import Nav from 'react-bootstrap/Nav';
import Stack from 'react-bootstrap/Stack';

import MainCard from 'components/MainCard';
import SimpleBarScroll from 'components/third-party/SimpleBar';
import { handlerDrawerOpen, useGetMenuMaster } from 'api/menu';
import useConfig from 'hooks/useConfig';
import { setResolvedTheme } from 'components/setResolvedTheme';
import { ThemeMode } from 'config';

import Img1 from 'assets/images/user/avatar-1.png';
import Img2 from 'assets/images/user/avatar-2.png';
import Img3 from 'assets/images/user/avatar-3.png';
import Img4 from 'assets/images/user/avatar-4.png';
import Img5 from 'assets/images/user/avatar-5.png';

const notifications = [
  { id: 1, avatar: Img1, time: '2 min ago', title: 'UI/UX Design', description: "Lorem Ipsum has been the industry's standard dummy text ever since the 1500s.", date: 'Today' },
  { id: 2, avatar: Img2, time: '1 hour ago', title: 'Message', description: "Lorem Ipsum has been the industry's standard dummy text ever since the 1500s.", date: 'Today' },
  { id: 3, avatar: Img3, time: '2 hour ago', title: 'Forms', description: "Lorem Ipsum has been the industry's standard dummy text ever since the 1500s.", date: 'Yesterday' },
  { id: 4, avatar: Img4, time: '12 hour ago', title: 'Challenge invitation', description: 'Jonny aber invites you to join the challenge', actions: true, date: 'Yesterday' },
  { id: 5, avatar: Img5, time: '5 hour ago', title: 'Security', description: "Lorem Ipsum has been the industry's standard dummy text ever since the 1500s.", date: 'Yesterday' }
];

/** Robust detector for whether the sidebar is collapsed/off-canvas */
function computeSidebarCollapsed() {
  const body = document.body;
  const sb = document.getElementById('pc-sidebar');
  const byBody =
    body.classList.contains('pc-sidebar-hide') ||
    body.classList.contains('mob-sidebar-active'); // datta mobile drawer
  const byElem = sb ? sb.classList.contains('hide') : false; // datta adds .hide on collapse
  return Boolean(byBody || byElem);
}

/** media query helper */
function getIsDesktop() {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(min-width: 992px)').matches;
}

export default function Header() {
  const { i18n, onChangeLocalization, onChangeMode, mode } = useConfig();
  const { menuMaster } = useGetMenuMaster();
  const drawerOpen = !!menuMaster?.isDashboardDrawerOpened;

  // theme sync
  useEffect(() => {
    setResolvedTheme(mode);
  }, [mode]);

  // track desktop vs mobile
  const [isDesktop, setIsDesktop] = useState(getIsDesktop());
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 992px)');
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // track whether sidebar is collapsed (class-based; no template code changes)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(computeSidebarCollapsed());
  useEffect(() => {
    const body = document.body;
    const sb = document.getElementById('pc-sidebar');

    const update = () => setSidebarCollapsed(computeSidebarCollapsed());

    // MutationObservers watch class changes on body and sidebar element
    const obsBody = new MutationObserver(update);
    obsBody.observe(body, { attributes: true, attributeFilter: ['class'] });

    let obsSb;
    if (sb) {
      obsSb = new MutationObserver(update);
      obsSb.observe(sb, { attributes: true, attributeFilter: ['class'] });
    }

    update();

    return () => {
      obsBody.disconnect();
      if (obsSb) obsSb.disconnect();
    };
  }, [drawerOpen]);

  // keep template behaviour: add/remove body class so sidebar CSS works
  useEffect(() => {
    document.body.classList.toggle('mob-sidebar-active', drawerOpen);
    return () => document.body.classList.remove('mob-sidebar-active');
  }, [drawerOpen]);

  const handleListItemClick = (lang) => onChangeLocalization(lang);

  const closeIfMobile = () => {
    if (!isDesktop) handlerDrawerOpen(false);
  };

  // RULE:
  // - Desktop + sidebar visible  => HIDE header (remove gap)
  // - Mobile OR sidebar collapsed => SHOW header (need hamburger)
  const shouldShowHeader = !isDesktop || sidebarCollapsed;

  // Add/remove class for body when header hidden
  useEffect(() => {
    document.body.classList.toggle('kw-header-hidden', !shouldShowHeader);
    return () => document.body.classList.remove('kw-header-hidden');
  }, [shouldShowHeader]);

  // NEW: squash phantom <p> inside .pc-content that causes gap
  useEffect(() => {
    const squash = () => {
      const content = document.querySelector('.pc-content');
      if (!content) return;

      // strip empty leading text nodes
      while (content.firstChild && content.firstChild.nodeType === Node.TEXT_NODE && !content.firstChild.textContent.trim()) {
        content.removeChild(content.firstChild);
      }

      // hide a leading empty <p>
      const el = content.firstElementChild;
      if (el && el.tagName === 'P' && el.textContent.trim() === '') {
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('margin-top', '0px', 'important');
        el.style.setProperty('padding-top', '0px', 'important');
        el.style.setProperty('height', '0px', 'important');
        el.style.setProperty('line-height', '0', 'important');
        el.style.setProperty('overflow', 'hidden', 'important');
      }

      // make sure first real child has no top margin
      const first = content.firstElementChild;
      if (first) {
        first.style.setProperty('margin-top', '0px', 'important');
      }
    };

    squash();

    const content = document.querySelector('.pc-content');
    const mo = content ? new MutationObserver(squash) : null;
    if (content && mo) mo.observe(content, { childList: true, subtree: true, characterData: true });
    const ro = content ? new ResizeObserver(squash) : null;
    if (content && ro) ro.observe(content);

    return () => {
      if (mo) mo.disconnect();
      if (ro) ro.disconnect();
    };
  }, []);

  // Inline style to fully collapse header box when hidden (no gap)
  const headerStyle = shouldShowHeader
    ? undefined
    : { height: 0, minHeight: 0, padding: 0, margin: 0, border: 0, overflow: 'hidden' };

  return (
    <header className="pc-header" style={headerStyle}>
      {shouldShowHeader && (
        <div className="header-wrapper">
          <div className="me-auto pc-mob-drp">
            <Nav className="list-unstyled">
              {/* DESKTOP toggle */}
              <Nav.Item className="pc-h-item pc-sidebar-collapse d-none d-lg-flex">
                <Nav.Link
                  as={Link}
                  to="#"
                  className="pc-head-link ms-0"
                  id="sidebar-hide"
                  onClick={(e) => {
                    e.preventDefault();
                    handlerDrawerOpen(!drawerOpen);
                  }}
                >
                  <i className="ph ph-list" />
                </Nav.Link>
              </Nav.Item>

              {/* MOBILE toggle */}
              <Nav.Item className="pc-h-item pc-sidebar-popup d-lg-none">
                <Nav.Link
                  as={Link}
                  to="#"
                  className="pc-head-link ms-0"
                  id="mobile-collapse"
                  onClick={(e) => {
                    e.preventDefault();
                    handlerDrawerOpen(!drawerOpen);
                  }}
                >
                  <i className="ph ph-list" />
                </Nav.Link>
              </Nav.Item>
            </Nav>
          </div>

          <div className="ms-auto">
            <Nav className="list-unstyled">
              {/* (menus unchanged, same as your version) */}
              {/* … snipped for brevity — keep identical to your current working code … */}
            </Nav>
          </div>
        </div>
      )}

      {/* mobile overlay to close sidebar when tapping outside */}
      {drawerOpen && <div className="pc-md-overlay" onClick={closeIfMobile} />}
    </header>
  );
}
