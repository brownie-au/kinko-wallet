// src/index.jsx
import React from 'react';
import { createRoot } from 'react-dom/client';

// global styles
import './index.scss';

// fonts
import '@fontsource/open-sans/300.css';
import '@fontsource/open-sans/400.css';
import '@fontsource/open-sans/500.css';
import '@fontsource/open-sans/600.css';

// app + providers
import App from './App';
import { ConfigProvider } from 'contexts/ConfigContext';
import { WalletProvider } from 'contexts/WalletContext.jsx';
import { PrivacyProvider } from 'contexts/PrivacyContext.jsx';
import { RefreshProvider } from '@/contexts/RefreshContext.jsx';

const container = document.getElementById('root');
const root = createRoot(container);

root.render(
  <RefreshProvider>
    <ConfigProvider>
      <PrivacyProvider>
        <WalletProvider>
          <App />
        </WalletProvider>
      </PrivacyProvider>
    </ConfigProvider>
  </RefreshProvider>
);

