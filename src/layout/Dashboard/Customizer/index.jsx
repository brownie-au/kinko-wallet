// src/layout/Dashboard/Customizer/index.jsx
import { useEffect, useState } from 'react';

// react-bootstrap
import Button from 'react-bootstrap/Button';
import ListGroup from 'react-bootstrap/ListGroup';
import Offcanvas from 'react-bootstrap/Offcanvas';
import Stack from 'react-bootstrap/Stack';

// project-imports
import ThemeModeLayout from './Layout/ThemeMode';
import ThemeWidth from './Layout/ThemeWidth';
import SimpleBarScroll from 'components/third-party/SimpleBar';
import { ThemeDirection } from 'config';
import useConfig from 'hooks/useConfig';

export default function Customization() {
  const { onReset, themeDirection } = useConfig();

  const [show, setShow] = useState(false);
  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);

  // keep RTL/LTR placement behavior
  useEffect(() => {
    if (themeDirection === ThemeDirection.RTL) {
      document.body.setAttribute('data-pc-direction', ThemeDirection.RTL);
    } else {
      document.body.setAttribute('data-pc-direction', ThemeDirection.LTR);
    }
  }, [themeDirection]);

  return (
    <>
      <div className="pct-c-btn">
        <a href="#!" onClick={handleShow}>
          <i className="ph ph-gear-six" />
        </a>
      </div>

      <Offcanvas
        show={show}
        onHide={handleClose}
        placement={themeDirection === ThemeDirection.RTL ? 'start' : 'end'}
        className="border-0 pct-offcanvas"
      >
        <Offcanvas.Header className="justify-content-between">
          <Offcanvas.Title>
            <h5 className="mb-0">Settings</h5>
          </Offcanvas.Title>
          <Stack direction="horizontal" gap={2}>
            <Button
              variant="outline-danger"
              size="sm"
              className="rounded"
              onClick={() => {
                handleClose();
                onReset();
              }}
            >
              Reset
            </Button>
            <Button variant="link-danger" className="avatar avatar-xs btn-pc-default" onClick={handleClose}>
              <i className="ti ti-x f-20" />
            </Button>
          </Stack>
        </Offcanvas.Header>

        {/* Keep Theme Mode pinned at top */}
        <Offcanvas.Body>
          <ThemeModeLayout />
        </Offcanvas.Body>

        {/* Only Layout Width remains */}
        <SimpleBarScroll style={{ height: 'calc(100vh - 240px)' }}>
          <Offcanvas.Body className="py-0">
            <ListGroup variant="flush">{window.innerWidth > 1025 && <ThemeWidth />}</ListGroup>
          </Offcanvas.Body>
        </SimpleBarScroll>
      </Offcanvas>
    </>
  );
}
