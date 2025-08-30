// src/contexts/PrivacyContext.jsx
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'kw:privacyOn';
const STYLE_ID = 'kw-privacy-style';
const PRIVACY_CSS = `
/* injected by PrivacyProvider — do not edit */
body[data-privacy="on"] [data-scrub="true"] {
  filter: blur(6px);
  transition: filter 140ms ease;
}
body[data-privacy="on"] [data-scrub="true"]::selection {
  background: transparent;
}
[data-scrub="true"] {
  display: inline-block;
}
`;

const PrivacyContext = createContext({
  privacyOn: false,
  togglePrivacy: () => {}
});

export function PrivacyProvider({ children }) {
  const [privacyOn, setPrivacyOn] = useState(false);

  // 1) Ensure the CSS exists no matter how the app is bundled
  useEffect(() => {
    if (typeof document === 'undefined') return;
    let styleTag = document.getElementById(STYLE_ID);
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = STYLE_ID;
      styleTag.type = 'text/css';
      styleTag.appendChild(document.createTextNode(PRIVACY_CSS));
      document.head.appendChild(styleTag);
    }
  }, []);

  // 2) Load saved state
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === '1') setPrivacyOn(true);
    } catch {}
  }, []);

  // 3) Reflect to <body> and persist
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, privacyOn ? '1' : '0');
    } catch {}
    if (typeof document !== 'undefined') {
      document.body.setAttribute('data-privacy', privacyOn ? 'on' : 'off');
    }
  }, [privacyOn]);

  const togglePrivacy = () => setPrivacyOn((v) => !v);

  const value = useMemo(() => ({ privacyOn, togglePrivacy }), [privacyOn]);
  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
}

export const usePrivacy = () => useContext(PrivacyContext);
