import PropTypes from 'prop-types';
import { createContext, useEffect } from 'react';

// project-imports
import useLocalStorage from 'hooks/useLocalStorage';
import config from 'config';

/* -----------------------------------------------------------------------------
   Default to DARK mode when there is no saved preference.
   We also mirror `mode` -> <html data-theme="..."> and `.dark` class.
----------------------------------------------------------------------------- */

const STORAGE_KEY = 'datta-able-react-ts-config';

// Base config with a dark-mode default (only used when nothing in storage)
const initialConfig = {
  ...config,
  mode: (config?.mode ?? 'dark')
};

// Handler stubs to shape context defaults
const handlerStubs = {
  onChangeLocalization: () => {},
  onChangeMenuOrientation: () => {},
  onChangeDirection: () => {},
  onChangeContainer: () => {},
  onChangeCaption: () => {},
  onChangeSideTheme: () => {},
  onChangeThemePreset: () => {},
  onChangeMenuIcon: () => {},
  onChangeMode: () => {},
  onReset: () => {}
};

const ConfigContext = createContext({ ...initialConfig, ...handlerStubs });

// ==============================|| CONFIG CONTEXT & PROVIDER ||============================== //

function ConfigProvider({ children }) {
  // If nothing is stored, useLocalStorage will seed with initialConfig (which is dark)
  const [cfg, setCfg] = useLocalStorage(STORAGE_KEY, initialConfig);

  // Enforce vertical menu on narrow screens (kept from your code)
  useEffect(() => {
    const width = window.innerWidth;
    if (width < 1025 && cfg.menuOrientation !== 'vertical') {
      setCfg((prev) => ({ ...prev, menuOrientation: 'vertical' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  // Reflect theme mode to the DOM early and on every change
  useEffect(() => {
    const mode = cfg.mode || 'dark';
    document.documentElement.setAttribute('data-theme', mode);
    document.documentElement.classList.toggle('dark', mode === 'dark');
  }, [cfg.mode]);

  const onReset = () => {
    setCfg(initialConfig); // resets to dark by default
  };

  const onChangeLocalization = (lang) => {
    setCfg({ ...cfg, i18n: lang });
  };

  const onChangeMenuOrientation = (layout) => {
    if (window.innerWidth >= 1025) {
      setCfg({ ...cfg, menuOrientation: layout });
    }
  };

  const onChangeMode = (selectedMode) => {
    setCfg({ ...cfg, mode: selectedMode });
  };

  const onChangeCaption = (caption) => {
    setCfg({ ...cfg, caption });
  };

  const onChangeSideTheme = (sidebarTheme) => {
    setCfg({ ...cfg, sidebarTheme });
  };

  const onChangeDirection = (direction) => {
    setCfg({ ...cfg, themeDirection: direction });
  };

  const onChangeContainer = (container) => {
    setCfg({ ...cfg, container });
  };

  const onChangeThemePreset = (key, value) => {
    setCfg({ ...cfg, [key]: value });
  };

  const onChangeMenuIcon = (key, value) => {
    setCfg({ ...cfg, [key]: value });
  };

  return (
    <ConfigContext.Provider
      value={{
        ...cfg,
        onChangeLocalization,
        onChangeMenuOrientation,
        onChangeMode,
        onChangeDirection,
        onChangeContainer,
        onChangeCaption,
        onChangeSideTheme,
        onChangeThemePreset,
        onChangeMenuIcon,
        onReset
      }}
    >
      {children}
    </ConfigContext.Provider>
  );
}

export { ConfigProvider, ConfigContext };

ConfigProvider.propTypes = { children: PropTypes.node };
