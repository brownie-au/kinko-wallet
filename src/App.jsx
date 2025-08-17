import './styles/chain-ui.css';
import { useEffect, useRef } from 'react';
import { RouterProvider } from 'react-router-dom';

// project-imports
import router from 'routes';
import Locales from 'components/Locales';

// NEW: wallet context (so dashboard tiles can read real totals)
import { WalletProvider } from 'contexts/WalletContext';

// NEW: background snapshot prefetcher
import { prefetchAllManaged } from './services/snapshotService';

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
        <PreloadSnapshots />
        <RouterProvider router={router} />
      </WalletProvider>
    </Locales>
  );
}

export default App;
