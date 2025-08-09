// src/components/PortfolioIdChip.jsx
import { useEffect, useState } from 'react';
import { getSyncId } from '../services/syncService.js';

export default function PortfolioIdChip({ className = '' }) {
  const [id, setId] = useState('');

  useEffect(() => {
    // initial read
    setId(getSyncId() || '');

    // cheap watcher: poll for changes (same-tab changes don't fire 'storage')
    const t = setInterval(() => {
      const v = getSyncId() || '';
      setId((prev) => (prev !== v ? v : prev));
    }, 1000);

    // also listen for cross-tab updates
    const onStorage = (e) => {
      if (e.key === 'kinko:sync:id') setId(getSyncId() || '');
    };
    window.addEventListener('storage', onStorage);

    return () => {
      clearInterval(t);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  if (!id) return null;

  const copy = async () => {
    try { await navigator.clipboard.writeText(id); } catch {}
  };

  return (
    <div className={`d-inline-flex align-items-center gap-2 px-3 py-2 rounded-pill bg-dark text-white small ${className}`}>
      <span className="text-uppercase">Portfolio ID:</span>
      <code className="mb-0">{id}</code>
      <button type="button" className="btn btn-sm btn-outline-light" onClick={copy}>
        Copy
      </button>
    </div>
  );
}
