import { createRoot } from 'react-dom/client';

// styles
import 'bootstrap/dist/css/bootstrap.min.css';
import './index.scss';

// project-imports
import App from './App';
import { ConfigProvider } from 'contexts/ConfigContext';
import { WalletProvider } from 'contexts/WalletContext.jsx'; // ⬅️ ADD THIS

import '@fontsource/open-sans/300.css';
import '@fontsource/open-sans/400.css';
import '@fontsource/open-sans/500.css';
import '@fontsource/open-sans/600.css';

const container = document.getElementById('root');
const root = createRoot(container);

root.render(
  <ConfigProvider>
    <WalletProvider>        {/* ⬅️ WRAP APP WITH THIS */}
      <App />
    </WalletProvider>
  </ConfigProvider>
);
