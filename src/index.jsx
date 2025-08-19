// src/index.jsx
import { createRoot } from 'react-dom/client';

// styles
import './index.scss';

// project-imports
import App from './App';
import { ConfigProvider } from 'contexts/ConfigContext';
import { WalletProvider } from 'contexts/WalletContext.jsx'; // existing
import { PrivacyProvider } from 'contexts/PrivacyContext.jsx'; // ⬅️ NEW

import '@fontsource/open-sans/300.css';
import '@fontsource/open-sans/400.css';
import '@fontsource/open-sans/500.css';
import '@fontsource/open-sans/600.css';

const container = document.getElementById('root');
const root = createRoot(container);

root.render(
  <ConfigProvider>
    <PrivacyProvider>        {/* ⬅️ Wrap globally so any component can scrub */}
      <WalletProvider>       {/* existing */}
        <App />
      </WalletProvider>
    </PrivacyProvider>
  </ConfigProvider>
);
