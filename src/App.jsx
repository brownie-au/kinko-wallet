// Global styles (order matters)
import './styles/chain-ui.css';

// React / Router
import { useEffect, useRef } from 'react';
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
        </PortfolioValueProvider>
      </WalletProvider>
    </Locales>
  );
}

export default App;
