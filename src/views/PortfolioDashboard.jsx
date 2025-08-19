// src/views/PortfolioDashboard.jsx
/* eslint-disable import/no-relative-parent-imports */
import { useEffect, useState } from 'react';
import { Row, Col, Card } from 'react-bootstrap';

import wallets from '../data/wallets.js';
import { getWalletCache } from '../utils/walletCache';

// optional: render the big portfolio line chart in the middle
import PortfolioBalanceChart from '../sections/dashboard/crypto/default/PortfolioBalanceChart.jsx';

// ---------- formats ----------
const fmtUsd = (n) =>
  `USD $${(Number(n) || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

// helper to read sticky total (what View All writes)
function getStickyTotal() {
  try {
    const v = localStorage.getItem('kw:lastTotalUsd');
    return Number(v) || 0;
  } catch {
    return 0;
  }
}

// fallback: sum whatever the app already cached for each wallet
function getCachedPortfolioUsd() {
  try {
    const list = Array.isArray(wallets) ? wallets : [];
    let total = 0;

    for (const w of list) {
      const addr = (w?.address || w)?.toLowerCase?.() || '';
      if (!addr) continue;

      const wc = getWalletCache(addr, { maxAge: Number.MAX_SAFE_INTEGER }) || {};
      const t =
        wc?.totals?.usd ??
        wc?.totals?.totalUsd ??
        wc?.totalUsd ??
        0;
      total += Number(t) || 0;
    }
    return total;
  } catch {
    return 0;
  }
}

export default function PortfolioDashboard() {
  // seed from sticky; if empty fall back to wallet caches
  const [total, setTotal] = useState(() => {
    const sticky = getStickyTotal();
    return sticky > 0 ? sticky : getCachedPortfolioUsd();
  });

  useEffect(() => {
    // watch for localStorage updates from View All
    const tick = () => {
      const v = getStickyTotal();
      if (v > 0) setTotal(v);
    };

    const onStorage = (e) => {
      if (e.key === 'kw:lastPortfolioTotalUsdAt' || e.key === 'kw:lastTotalUsd') tick();
    };

    window.addEventListener('storage', onStorage);
    const id = setInterval(tick, 4000); // catch same-tab changes too
    tick();
    return () => {
      window.removeEventListener('storage', onStorage);
      clearInterval(id);
    };
  }, []);

  return (
    <Row className="g-3">
      {/* ===== Top Stat Cards ===== */}
      <Col md={4}>
        <Card className="mb-3">
          <Card.Body>
            <div className="text-muted mb-1">Total Portfolio Value</div>
            <div className="fs-4 fw-semibold" data-scrub="true">{fmtUsd(total)}</div>
            <div className="text-success small mt-1" data-scrub="true">▲ 0.00% (24h)</div>
          </Card.Body>
        </Card>
      </Col>

      <Col md={4}>
        <Card className="mb-3">
          <Card.Body>
            <div className="text-muted mb-1">PnL</div>
            <div className="fs-4 fw-semibold" data-scrub="true">+ $6,842</div>
            <div className="small mt-2">
              <span className="badge bg-secondary me-2">7D</span>
              <span className="badge bg-secondary me-2">1M</span>
              <span className="badge bg-secondary me-2">3M</span>
              <span className="badge bg-secondary me-2">1Y</span>
              <span className="badge bg-secondary me-2">YTD</span>
              <span className="badge bg-primary">ALL</span>
            </div>
          </Card.Body>
        </Card>
      </Col>

      <Col md={4}>
        <Card className="mb-3">
          <Card.Body>
            <div className="text-muted mb-1">Crypto Fear &amp; Greed</div>
            <div className="fs-4 fw-semibold">
              64 <span className="text-muted small">Greed</span>
            </div>
            <div className="text-muted small">Updated: 17/08/2025, 10:00:00</div>
            <div className="progress mt-2" style={{ height: 6 }}>
              <div className="progress-bar" role="progressbar" style={{ width: '64%' }} />
            </div>
          </Card.Body>
        </Card>
      </Col>

      {/* ===== Main Balance Chart ===== */}
      <Col xs={12}>
        <Card className="mb-3">
          <Card.Body>
            <PortfolioBalanceChart />
          </Card.Body>
        </Card>
      </Col>

      {/* ===== Removed junk =====
          - Social "Total Likes" cards
          - Rating stars breakdown
          - Ideas / Location counts
          These tiles are intentionally gone.
      */}
    </Row>
  );
}
