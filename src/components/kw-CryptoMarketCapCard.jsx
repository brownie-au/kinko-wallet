// src/components/kw-CryptoMarketCapCard.jsx
/* eslint-disable import/no-relative-parent-imports */
import { useEffect, useMemo, useState, useCallback } from 'react';
import { Card, ButtonGroup, Button, Placeholder } from 'react-bootstrap';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { getMarketCapHistory, formatUsd } from '../services/marketCapService';

const RANGES = ['7d', '1m', '3m', '1y', 'ytd', 'all'];

export default function KwCryptoMarketCapCard() {
  const [range, setRange] = useState('7d');
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (r) => {
    setLoading(true);
    try {
      const { data } = await getMarketCapHistory(r);
      setRows(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(range);
  }, [range, load]);

  const data = useMemo(() => {
    if (!rows) return [];
    return rows.map(({ t, cap }) => ({
      t,
      cap,
      // label strings for axes/tooltip
      date: new Date(t).toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })
    }));
  }, [rows]);

  return (
    <Card className="h-100">
      <Card.Body>
        <div className="d-flex justify-content-between align-items-start mb-2">
          <div>
            <div className="text-muted small">Global</div>
            <h6 className="mb-0">Crypto Market Cap</h6>
          </div>
          <ButtonGroup size="sm">
            {RANGES.map((r) => (
              <Button key={r} variant={r === range ? 'primary' : 'outline-secondary'} onClick={() => setRange(r)}>
                {r.toUpperCase()}
              </Button>
            ))}
          </ButtonGroup>
        </div>

        {loading && (
          <div style={{ height: 220 }}>
            <Placeholder as="div" animation="wave" className="w-100 h-100 rounded" />
          </div>
        )}

        {!loading && data.length > 0 && (
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="mcapFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopOpacity={0.35} stopColor="currentColor" />
                    <stop offset="100%" stopOpacity={0} stopColor="currentColor" />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeOpacity={0.08} />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: 'rgba(255,255,255,0.6)' }} tickMargin={8} />
                <YAxis hide domain={['dataMin', 'dataMax']} />
                <Tooltip
                  formatter={(v) => [formatUsd(v), 'Market Cap']}
                  labelFormatter={(label, payload) => {
                    const p = payload?.[0]?.payload;
                    if (!p) return label;
                    const d = new Date(p.t);
                    return d.toLocaleString('en-AU', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    });
                  }}
                  contentStyle={{ background: 'rgba(0,0,0,0.8)', border: '0px', borderRadius: 8 }}
                />
                <Area
                  type="monotone"
                  dataKey="cap"
                  stroke="currentColor"
                  fill="url(#mcapFill)"
                  strokeWidth={2.2}
                  dot={false}
                  activeDot={{ r: 3 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {!loading && data.length === 0 && <div className="text-muted small">No data.</div>}
      </Card.Body>
    </Card>
  );
}
