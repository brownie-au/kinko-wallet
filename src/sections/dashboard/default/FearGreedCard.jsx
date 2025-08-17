// FearGreedCard.jsx
import { useEffect, useState } from 'react';
import { Card, Spinner } from 'react-bootstrap';

// Data source: https://api.alternative.me/fng/
export default function FearGreedCard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('https://api.alternative.me/fng/?limit=1');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) setData(json?.data?.[0] || null);
      } catch (e) {
        if (!cancelled) setErr(String(e?.message || e));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const value = Number(data?.value ?? NaN);
  const label = data?.value_classification || '';
  const updated = data?.timestamp
    ? new Date(Number(data.timestamp) * 1000).toLocaleString()
    : '';

  return (
    <Card className="h-100">
      <Card.Body>
        <div className="text-muted mb-1">Crypto Fear &amp; Greed</div>

        {!data && !err && <Spinner animation="border" size="sm" />}

        {!!err && <div className="text-danger small">Failed to load: {err}</div>}

        {!!data && (
          <>
            <div className="d-flex align-items-baseline gap-2">
              <div className="h3 mb-0">{isNaN(value) ? '-' : value}</div>
              <div className="text-muted">{label}</div>
            </div>
            <div className="text-muted small mt-1">Updated: {updated}</div>

            {/* Simple meter */}
            <div className="mt-3">
              <div className="progress" style={{ height: 8 }}>
                <div
                  className={`progress-bar ${value < 34 ? 'bg-warning' : value < 67 ? 'bg-info' : 'bg-success'}`}
                  role="progressbar"
                  style={{ width: `${isNaN(value) ? 0 : value}%` }}
                  aria-valuenow={isNaN(value) ? 0 : value}
                  aria-valuemin="0"
                  aria-valuemax="100"
                />
              </div>
              <div className="d-flex justify-content-between text-muted small mt-1">
                <span>0</span><span>50</span><span>100</span>
              </div>
            </div>
          </>
        )}
      </Card.Body>
    </Card>
  );
}
