// src/layout/Dashboard/Header.jsx
import React, { useEffect } from 'react';
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

// Privacy hook
import { usePrivacy } from 'contexts/PrivacyContext.jsx';

const notifications = [
  { id: 1, avatar: Img1, time: '2 min ago', title: 'UI/UX Design', description: "Lorem Ipsum has been the industry's standard dummy text ever since the 1500s.", date: 'Today' },
  { id: 2, avatar: Img2, time: '1 hour ago', title: 'Message', description: "Lorem Ipsum has been the industry's standard dummy text ever since the 1500s.", date: 'Today' },
  { id: 3, avatar: Img3, time: '2 hour ago', title: 'Forms', description: "Lorem Ipsum has been the industry's standard dummy text ever since the 1500s.", date: 'Yesterday' },
  { id: 4, avatar: Img4, time: '12 hour ago', title: 'Challenge invitation', description: 'Jonny aber invites you to join the challenge', actions: true, date: 'Yesterday' },
  { id: 5, avatar: Img5, time: '5 hour ago', title: 'Security', description: "Lorem Ipsum has been the industry's standard dummy text ever since the 1500s.", date: 'Yesterday' }
];

export default function Header() {
  const { i18n, onChangeLocalization, onChangeMode, mode } = useConfig();
  const { menuMaster } = useGetMenuMaster();
  const drawerOpen = !!menuMaster?.isDashboardDrawerOpened;

  const { privacyOn, togglePrivacy } = usePrivacy();

  useEffect(() => {
    setResolvedTheme(mode);
  }, [mode]);

  // keep template behaviour: add/remove body class so sidebar CSS works
  useEffect(() => {
    document.body.classList.toggle('mob-sidebar-active', drawerOpen);
    return () => document.body.classList.remove('mob-sidebar-active');
  }, [drawerOpen]);

  const handleListItemClick = (lang) => onChangeLocalization(lang);

  const closeIfMobile = () => {
    if (window.innerWidth <= 1024) handlerDrawerOpen(false);
  };

  return (
    <header className="pc-header">
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

            {/* Search dropdown removed */}
          </Nav>
        </div>

        <div className="ms-auto">
          <Nav className="list-unstyled">
            {/* Privacy: Phosphor eye/eye-slash so it matches theme */}
            <Nav.Item className="pc-h-item">
              <a
                href="#"
                className="pc-head-link me-0"
                onClick={(e) => { e.preventDefault(); togglePrivacy(); }}
                title={privacyOn ? 'Show balances' : 'Hide balances'}
                aria-label={privacyOn ? 'Show balances' : 'Hide balances'}
                aria-pressed={privacyOn}
                role="button"
              >
                <i className={privacyOn ? 'ph ph-eye-slash' : 'ph ph-eye'} />
              </a>
            </Nav.Item>

            <Dropdown className="pc-h-item" align="end">
              <Dropdown.Toggle className="pc-head-link me-0 arrow-none" variant="link" id="dropdown-basic">
                <i className="ph ph-sun-dim" />
              </Dropdown.Toggle>
              <Dropdown.Menu className="pc-h-dropdown">
                <Dropdown.Item onClick={() => onChangeMode(ThemeMode.DARK)}><i className="ph ph-moon" />Dark</Dropdown.Item>
                <Dropdown.Item onClick={() => onChangeMode(ThemeMode.LIGHT)}><i className="ph ph-sun" />Light</Dropdown.Item>
                <Dropdown.Item onClick={() => onChangeMode(ThemeMode.AUTO)}><i className="ph ph-cpu" />Default</Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>

            <Dropdown className="pc-h-item d-none d-md-inline-flex" align="end">
              <Dropdown.Toggle className="pc-head-link head-link-primary me-0 arrow-none" variant="link" id="language-dropdown">
                <i className="ph ph-translate" />
              </Dropdown.Toggle>
              <Dropdown.Menu className="pc-h-dropdown lng-dropdown">
                <Dropdown.Item active={i18n === 'en'} onClick={() => handleListItemClick('en')}><span>English <small>(UK)</small></span></Dropdown.Item>
                <Dropdown.Item active={i18n === 'fr'} onClick={() => handleListItemClick('fr')}><span>français <small>(French)</small></span></Dropdown.Item>
                <Dropdown.Item active={i18n === 'ro'} onClick={() => handleListItemClick('ro')}><span>Română <small>(Romanian)</small></span></Dropdown.Item>
                <Dropdown.Item active={i18n === 'zh'} onClick={() => handleListItemClick('zh')}><span>中国人 <small>(Chinese)</small></span></Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>

            <Dropdown className="pc-h-item" align="end">
              <Dropdown.Toggle className="pc-head-link me-0 arrow-none" variant="link" id="settings-dropdown">
                <i className="ph ph-diamonds-four" />
              </Dropdown.Toggle>
              <Dropdown.Menu className="pc-h-dropdown">
                <Dropdown.Item><i className="ph ph-user" />My Account</Dropdown.Item>
                <Dropdown.Item><i className="ph ph-gear" />Settings</Dropdown.Item>
                <Dropdown.Item><i className="ph ph-lifebuoy" />Support</Dropdown.Item>
                <Dropdown.Item><i className="ph ph-lock-key" />Lock Screen</Dropdown.Item>
                <Dropdown.Item><i className="ph ph-power" />Logout</Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>

            <Dropdown className="pc-h-item" align="end">
              <Dropdown.Toggle className="pc-head-link me-0 arrow-none" variant="link" id="notification-dropdown">
                <i className="ph ph-bell" />
                <span className="badge bg-success pc-h-badge">3</span>
              </Dropdown.Toggle>
              <Dropdown.Menu className="dropdown-notification pc-h-dropdown">
                <Dropdown.Header className="d-flex align-items-center justify-content-between">
                  <h5 className="m-0">Notifications</h5>
                  <Link className="btn btn-link btn-sm" to="#">Mark all read</Link>
                </Dropdown.Header>
                <SimpleBarScroll style={{ maxHeight: 'calc(100vh - 215px)' }}>
                  <div className="dropdown-body text-wrap position-relative">
                    {notifications.map((n, i) => (
                      <React.Fragment key={n.id}>
                        {(i === 0 || notifications[i - 1].date !== n.date) ? <p className="text-span">{n.date}</p> : null}
                        <MainCard className="mb-0">
                          <Stack direction="horizontal" gap={3}>
                            <Image className="img-radius avatar rounded-0" src={n.avatar} alt="" />
                            <div>
                              <span className="float-end text-sm text-muted">{n.time}</span>
                              <h5 className="text-body mb-2">{n.title}</h5>
                              <p className="mb-0">{n.description}</p>
                              {n.actions && (
                                <div className="mt-2">
                                  <Button variant="outline-secondary" size="sm" className="me-2">Decline</Button>
                                  <Button variant="primary" size="sm">Accept</Button>
                                </div>
                              )}
                            </div>
                          </Stack>
                        </MainCard>
                      </React.Fragment>
                    ))}
                  </div>
                </SimpleBarScroll>
                <div className="text-center py-2">
                  <Link to="#!" className="link-danger">Clear all Notifications</Link>
                </div>
              </Dropdown.Menu>
            </Dropdown>

            <Dropdown className="pc-h-item" align="end">
              <Dropdown.Toggle className="pc-head-link arrow-none me-0" variant="link" id="user-profile-dropdown" aria-haspopup="true" aria-expanded="false">
                <i className="ph ph-user-circle" />
              </Dropdown.Toggle>
              <Dropdown.Menu className="dropdown-user-profile pc-h-dropdown p-0 overflow-hidden">
                <Dropdown.Header className="bg-primary">
                  <Stack direction="horizontal" gap={3} className="my-2">
                    <div className="flex-shrink-0">
                      <Image src={Img2} alt="user-avatar" className="user-avatar wid-35" roundedCircle />
                    </div>
                    <Stack gap={1}>
                      <h6 className="text-white mb-0">Carson Darrin 🖖</h6>
                      <span className="text-white text-opacity-75">carson.darrin@company.io</span>
                    </Stack>
                  </Stack>
                </Dropdown.Header>
                <div className="dropdown-body">
                  <div className="profile-notification-scroll position-relative" style={{ maxHeight: 'calc(100vh - 225px)' }}>
                    <Dropdown.Item as={Link} to="#" className="justify-content-start"><i className="ph ph-gear me-2" />Settings</Dropdown.Item>
                    <Dropdown.Item as={Link} to="#" className="justify-content-start"><i className="ph ph-share-network me-2" />Share</Dropdown.Item>
                    <Dropdown.Item as={Link} to="#" className="justify-content-start"><i className="ph ph-lock-key me-2" />Change Password</Dropdown.Item>
                    <div className="d-grid my-2">
                      <Button><i className="ph ph-sign-out align-middle me-2" />Logout</Button>
                    </div>
                  </div>
                </div>
              </Dropdown.Menu>
            </Dropdown>
          </Nav>
        </div>
      </div>

      {/* mobile overlay to close sidebar when tapping outside */}
      {drawerOpen && <div className="pc-md-overlay" onClick={closeIfMobile} />}
    </header>
  );
}
