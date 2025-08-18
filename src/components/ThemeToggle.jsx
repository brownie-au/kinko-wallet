// src/components/ThemeToggle.jsx
import React, { useMemo } from 'react';
import { Button, ButtonGroup, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { setResolvedTheme } from 'components/setResolvedTheme';
import { ThemeMode } from 'config';

// Optional: pass `variant="outline-secondary"` etc.
export default function ThemeToggle({
  size = 'sm',
  variant = 'outline-secondary',
  showLabels = false,
  className = '',
}) {
  // Find current mode from <html data-theme="..."> to style active button
  const current = useMemo(() => {
    const html = document.documentElement;
    // common values we use elsewhere: 'light' | 'dark' | 'system'
    return (html.getAttribute('data-theme-mode') ||
            html.getAttribute('data-bs-theme') ||
            'system').toLowerCase();
  }, []); // we don’t need to re-render on click; buttons still work

  const Btn = ({ mode, title, icon }) => {
    const isActive =
      (current === 'light' && mode === ThemeMode.LIGHT) ||
      (current === 'dark' && mode === ThemeMode.DARK) ||
      (current === 'system' && mode === ThemeMode.SYSTEM);

    const body = (
      <Button
        size={size}
        variant={isActive ? 'secondary' : variant}
        onClick={() => setResolvedTheme(mode)}
        aria-label={title}
        title={title}
      >
        <i className={icon} style={{ fontSize: 16, lineHeight: 0 }} />
        {showLabels ? <span style={{ marginLeft: 8 }}>{title}</span> : null}
      </Button>
    );

    return (
      <OverlayTrigger placement="top" overlay={<Tooltip>{title}</Tooltip>}>
        <span>{body}</span>
      </OverlayTrigger>
    );
  };

  return (
    <ButtonGroup className={className} aria-label="Theme Mode">
      <Btn mode={ThemeMode.LIGHT}  title="Light"  icon="ph ph-sun" />
      <Btn mode={ThemeMode.DARK}   title="Dark"   icon="ph ph-moon" />
      <Btn mode={ThemeMode.SYSTEM} title="System" icon="ph ph-cpu" />
    </ButtonGroup>
  );
}
