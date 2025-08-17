// PnLCard.jsx
import { useMemo, useState, useEffect } from 'react';
import { Card, ButtonGroup, Button } from 'react-bootstrap';

// Keep ranges aligned with Portfolio Balance chart
const RANGES = ['7D', '1M', '3M', '1Y', 'YTD', 'ALL'];

export default function PnLCard({
  pnlUsd = 6842.0,          // wire to real PnL later
  rangeDefault = 'ALL',     // default visible range
  onRangeChange             // optional callback(range)
}) {
  const [range, setRange] = useState(rangeDefault);

  useEffect(() => {
    if (onRangeChange) onRangeChange(range);
  }, [range, onRangeChange]);

  const up = Number(pnlUsd) >= 0;

  const formatted = useMemo(
    () =>
      (Math.abs(Number(pnlUsd)) || 0).toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }),
    [pnlUsd]
  );

  return (
    <Card className="h-100">
      <Card.Body>
        <div className="d-flex justify-content-between align-items-center mb-2">
          <div className="text-muted">PnL</div>
          <ButtonGroup size="sm" aria-label="pnl-range">
            {RANGES.map((r) => (
              <Button
                key={r}
                variant={r === range ? 'primary' : 'outline-secondary'}
                onClick={() => setRange(r)}
              >
                {r}
              </Button>
            ))}
          </ButtonGroup>
        </div>

        <div className={`h3 mb-1 ${up ? 'text-success' : 'text-danger'}`}>
          {up ? '+' : '-'}${formatted}
        </div>
        <div className="text-muted small">{range}</div>
      </Card.Body>
    </Card>
  );
}
