// Global styles (order matters)
import './styles/chain-ui.css';

// React / Router
import { useEffect, useRef, useState } from 'react';
import { RouterProvider } from 'react-router-dom';

// project-imports
import router from 'routes';
import Locales from 'components/Locales';

// NEW: wallet context (so dashboard tiles can read real totals)
import { WalletProvider } from 'contexts/WalletContext';

// NEW: global aggregated portfolio value context
import { PortfolioValueProvider } from 'contexts/PortfolioValueContext';

// NEW: background snapshot prefetcher
import { prefetchAllManaged } from './services/snapshotService';

// Keep any other CSS before the hotfix
import './styles/kw-gap-fix.css';

// Keep this import LAST among CSS files (still good practice)
import './styles/kw-spacing-hotfix.css';

// Injected, always-wins gap killer
import KwNoGap from './components/kw-NoGap';

// NEW: runtime gap canceller (measures & offsets any residual gap)
import KwGapCancel from './components/kw-GapCancel';

// Rate-limit handling: axios backoff + toast
import axios from 'axios';
import { installAxiosBackoff } from './utils/axiosBackoff';
import { onRateLimit, showRateLimitNotice, hideRateLimitNotice } from './utils/rateLimitNotifier';

// near other global imports
import './utils/kwProgressHoverOverlay.js';

// Install global axios backoff once at module load
installAxiosBackoff(axios);

function RateLimitToast() {
  const [state, setState] = useState({ show: false, text: '' });
  useEffect(() => onRateLimit((show, text) => setState({ show, text })), []);
  return (
    <div
      className={`kw-toast rl ${state.show ? 'show' : ''}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{ position: 'fixed', left: '50%', bottom: 16, transform: 'translateX(-50%)', zIndex: 1090 }}
    >
      <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
      {state.text || 'Temporarily rate-limited, retrying…'}
      <style>{`
        .kw-toast.rl{opacity:0; transition: opacity .25s, transform .25s; padding:.5rem .75rem; background: rgba(0,0,0,.8); color:#fff; border-radius:8px; font-size: .9rem; display:flex; align-items:center}
        .kw-toast.rl.show{opacity:1}
      `}</style>
    </div>
  );
}

// Expose a tiny demo hook to preview the toast (available in all builds)
// eslint-disable-next-line no-underscore-dangle
window.__kinko = Object.assign(window.__kinko || {}, {
  simulateRateLimitNotice(ms = 2500) {
    showRateLimitNotice('Temporarily rate-limited, retrying…');
    setTimeout(() => hideRateLimitNotice(), Math.max(500, Number(ms) || 2500));
  }
});

// ==============================|| APP - THEME, ROUTER, LOCAL ||============================== //

function PreloadSnapshots() {
  const lastRunRef = useRef(0);
  const PERIOD_MS = 30 * 60 * 1000; // 30 minutes

  useEffect(() => {
    // Initial warm
    const kick = async () => {
      await prefetchAllManaged({ revalidate: true });
      lastRunRef.current = Date.now();
    };
    kick();

    // Interval refresh
    const id = setInterval(() => {
      prefetchAllManaged({ revalidate: true }).then(() => {
        lastRunRef.current = Date.now();
      });
    }, PERIOD_MS);

    // Refresh when user returns to tab, if stale
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        if (Date.now() - lastRunRef.current > PERIOD_MS) {
          prefetchAllManaged({ revalidate: true }).then(() => {
            lastRunRef.current = Date.now();
          });
        }
      }
    };
    document.addEventListener('visibilitychange', onVis);

    // Network back online → quick refresh
    const onOnline = () => {
      prefetchAllManaged({ revalidate: true }).then(() => {
        lastRunRef.current = Date.now();
      });
    };
    window.addEventListener('online', onOnline);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  return null;
}

function App() {
  return (
    <Locales>
      <WalletProvider>
        <PortfolioValueProvider>
          <PreloadSnapshots />
          <KwNoGap />
          <KwGapCancel />
          <RouterProvider router={router} />
          <RateLimitToast />
        </PortfolioValueProvider>
      </WalletProvider>
    </Locales>
  );
}

export default App;
