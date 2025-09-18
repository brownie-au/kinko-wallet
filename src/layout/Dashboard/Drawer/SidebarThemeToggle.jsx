import React from 'react';

// project-imports
import useConfig from 'hooks/useConfig';
import { ThemeMode } from 'config';
import { setResolvedTheme } from 'components/setResolvedTheme';

// A compact, one-color 3-way theme toggle for the sidebar footer
export default function SidebarThemeToggle() {
  const { mode, onChangeMode } = useConfig();

  const items = [
    { value: ThemeMode.LIGHT, iconClass: 'ph ph-sun', label: 'Light' },
    { value: ThemeMode.DARK, iconClass: 'ph ph-moon', label: 'Dark' },
    { value: ThemeMode.AUTO, iconClass: 'ph ph-monitor', label: 'System' }
  ];

  const handleClick = (value) => {
    onChangeMode(value);
    setResolvedTheme(value); // apply immediately (data-pc-theme)
  };

  return (
    <div className="kw-theme-toggle" role="group" aria-label="Theme mode switch">
      {items.map(({ value, iconClass, label }) => {
        const active = mode === value;
        return (
          <button
            key={value}
            type="button"
            className={`kw-theme-btn ${active ? 'active' : ''}`}
            onClick={() => handleClick(value)}
            title={label}
            aria-pressed={active}
          >
            <i className={iconClass} aria-hidden="true" />
            <span className="sr-only">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

