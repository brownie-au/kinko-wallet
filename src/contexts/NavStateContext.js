// src/index.jsx
import { createRoot } from 'react-dom/client';

// styles
import './index.scss';
import './styles/chain-ui.css';
import './styles/kw-sidebar-override.css';   // keep this if you added it

// project-imports
import App from './App';
import { ConfigProvider } from 'contexts/ConfigContext';
import { WalletProvider } from 'contexts/WalletContext.jsx';
import { NavStateProvider } from './context/NavStateContext';

import '@fontsource/open-sans/300.css';
import '@fontsource/open-sans/400.css';
import '@fontsource/open-sans/500.css';
import '@fontsource/open-sans/600.css';

const container = document.getElementById('root');
const root = createRoot(container);

root.render(
    <ConfigProvider>
        <WalletProvider>
            <NavStateProvider>
                <App />
            </NavStateProvider>
        </WalletProvider>
    </ConfigProvider>
);
