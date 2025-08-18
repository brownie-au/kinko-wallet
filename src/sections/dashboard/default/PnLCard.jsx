// src/sections/dashboard/default/PnLCard.jsx
import { useEffect, useState } from 'react';
import { Card, ButtonGroup, Button, Spinner } from 'react-bootstrap';

import wallets from '../../../data/wallets.js';
import { getWalletCache } from '../../../utils/walletCache';
import { recordSnapshotIfNeeded, getPnL } from '../../../services/pnlService';

// ---------- formats ----------
const fmtUSD = (n) => {
  const x = Number(n) || 0;
  return `USD $${x.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};
const fmtUsdSigned = (n) => {
  const x = Number(n) || 0;
  const sign = x >= 0 ? '+' : '-';
  const abs = Math.abs(x);
  return `${sign}${fmtUSD(abs).replace('USD $', '$')}`;
};

// Sum the latest cached USD across all known wallets (last-known values).
function getCachedPortfolioUsd() {
  try {
    let total = 0;
    (wallets || []).forEach((w) => {
      const wc = getWalletCache?.(w?.address || w?.addr || w) || {};
      const guesses = [wc.totalUsd, wc.totals?.usd, wc.portfolioUsd, wc.portfolio?.totalUsd];
      const val = guesses.find((v) => Number.isFinite(Number(v)));
      total += Number(val || 0);
    });
    return total;
  } catch {
    return 0;
  }
}

const RANGES = ['7D', '1M', '3M', '1Y', 'YTD', 'ALL'];

export default function PnLCard() {
  const [range, setRange] = useState('YTD');
  const [loading, setLoading] = useState(true);
  const [currentUsd, setCurrentUsd] = useState(0);
  const [pnl, setPnl] = useState({ pnlUsd: 0, pnlPct: 0, baseValue: 0, currentValue: 0 });

  // refresh current portfolio USD from cache + snapshot once/day
  useEffect(() => {
    const val = getCachedPortfolioUsd();
    setCurrentUsd(val);
    recordSnapshotIfNeeded(val);
  }, []);

  // recompute on range/current change
  useEffect(() => {
    setLoading(true);
    const res = getPnL(range.toLowerCase(), currentUsd);
    setPnl(res);
    setLoading(false);
  }, [range, currentUsd]);

  const color = pnl.pnlUsd >= 0 ? '#3ddc97' : '#ff6b6b';

  return (
    <Card className="mb-3 h-100">
      <Card.Body className="d-flex flex-column">
        <div className="d-flex justify-content-between align-items-start mb-2">
          <div className="d-flex flex-column gap-1">
            <div style={{ color: '#98a2ad', fontSize: 12, letterSpacing: 0.3 }}>PnL</div>
            {loading ? (
              <Spinner size="sm" />
            ) : (
              <>
                <div style={{ fontSize: 28, fontWeight: 600, color }}>
                  <span style={{ color }}>{fmtUsdSigned(pnl.pnlUsd)}</span>
                </div>
                <div style={{ color: '#98a2ad', fontSize: 11 }}>
                  {range.toUpperCase()}
                  {' · '}
                  {fmtUSD(pnl.baseValue)} → {fmtUSD(pnl.currentValue)}
                  {' · '}
                  {Number.isFinite(pnl.pnlPct) ? `${pnl.pnlPct.toFixed(2)}%` : '0%'}
                </div>
              </>
            )}
          </div>

          <ButtonGroup size="sm">
            {RANGES.map((r) => (
              <Button
                key={r}
                variant={r === range ? 'primary' : 'outline-secondary'}
                onClick={() => setRange(r)}
                style={{ fontWeight: 600 }}
              >
                {r}
              </Button>
            ))}
          </ButtonGroup>
        </div>

        {/* Spacer to help equalise visual height if content is short */}
        <div className="flex-grow-1" />
      </Card.Body>
    </Card>
  );
}
