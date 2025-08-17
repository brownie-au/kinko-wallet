// src/sections/dashboard/default/PortfolioValueCard.jsx
import { useEffect, useState, useMemo } from 'react';
import { Card } from 'react-bootstrap';

const LS_TOTAL_KEY = 'kw:lastTotalUsd';
const LS_PCT_KEY = 'kw:lastChangePct24h';
const LS_UPDATED_KEY = 'kw:lastTotalUpdatedAt';

export default function PortfolioValueCard() {
  const [totalUsd, setTotalUsd] = useState(0);
  const [pct24h, setPct24h] = useState(0);

  const readFromLS = () => {
    try {
      const t = Number(localStorage.getItem(LS_TOTAL_KEY) || 0);
      const p = Number(localStorage.getItem(LS_PCT_KEY) || 0);
      setTotalUsd(isFinite(t) ? t : 0);
      setPct24h(isFinite(p) ? p : 0);
    } catch {
      setTotalUsd(0);
      setPct24h(0);
    }
  };

  useEffect(() => {
    // on mount
    readFromLS();

    // keep in sync if another tab / page updates it
    const onStorage = (e) => {
      if (e.key === LS_TOTAL_KEY || e.key === LS_PCT_KEY) readFromLS();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const formatted = useMemo(
    () => (Number(totalUsd) || 0).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 }),
    [totalUsd]
  );

  const up = Number(pct24h) >= 0;

  return (
    <Card className="h-100">
      <Card.Body>
        <div className="text-muted mb-1">Total Portfolio Value</div>
        <div className="h3 mb-1">USD ${formatted}</div>
        <div className={up ? 'text-success' : 'text-danger'}>
          {up ? '▲' : '▼'} {Math.abs(Number(pct24h) || 0).toFixed(2)}% (24h)
        </div>
      </Card.Body>
    </Card>
  );
}
