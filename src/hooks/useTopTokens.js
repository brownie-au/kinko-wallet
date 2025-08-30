import { useEffect, useState } from 'react';
import { readTopTokensCache, synthesizeTopFromWalletCache } from '../services/topTokensService';

export default function useTopTokens(limit = 5) {
  const [top, setTop] = useState(() => {
    const cached = readTopTokensCache();
    if (cached?.length) return cached.slice(0, limit);
    return synthesizeTopFromWalletCache(limit);
  });

  useEffect(() => {
    const onStorage = (e) => {
      if (e?.key === 'kw:lastTopTokens') {
        try {
          setTop(JSON.parse(e.newValue || '[]').slice(0, limit));
        } catch {}
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [limit]);

  return top;
}
