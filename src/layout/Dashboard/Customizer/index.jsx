// src/layout/Dashboard/Customizer/index.jsx
import { useEffect } from 'react';
import { ThemeDirection } from 'config';
import useConfig from 'hooks/useConfig';

export default function Customization() {
  const { themeDirection } = useConfig();

  // Keep RTL/LTR placement behavior for the rest of the app
  useEffect(() => {
    if (themeDirection === ThemeDirection.RTL) {
      document.body.setAttribute('data-pc-direction', ThemeDirection.RTL);
    } else {
      document.body.setAttribute('data-pc-direction', ThemeDirection.LTR);
    }
  }, [themeDirection]);

  // Render nothing (gear button + settings drawer removed)
  return null;
}
