// src/views/portfolio/Portfolio.jsx
/* eslint-disable import/no-relative-parent-imports */
import { useEffect, useMemo, useState } from 'react';
import { Row, Col, Card, Button, Spinner, Form } from 'react-bootstrap';

import { useWallets } from '../../contexts/WalletContext';
import { buildPortfolioDetailed } from '../../services/portfolioAggService';

// Force "USD $12,345.67" format everywhere
const fmtUSD = (n) => {
  const amt = (Number(n) || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `USD $${amt}`;
};

const fmtAmt = (n, p = 6) => {
  const x = Number(n) || 0;
  return !isFinite(x)
    ? '0'
    : x >= 1
    ? x.toLocaleString(undefined, { maximumFractionDigits: 4 })
    : x.toPrecision(p);
};

const keyFor = (t) =>
  `${t.chain}:${t.address || 'native'}:${(t.symbol || '').toUpperCase()}`;

// ---- minimal junk filter (keeps structure intact) ----
const DENY = new Set(['ETHG', 'AICC']);
function isJunkToken(t) {
  const sym = String(t.symbol || '').toUpperCase().trim();
  if (DENY.has(sym)) return true;
  if (t.possible_spam === true || t.is_spam === true) return true;
  // keep price 0 tokens (PLS, etc.), only block obvious nonsense
  const price = Number(t.priceUsd ?? t.price);
  if (Number.isNaN(price) || price > 100000) return true;
  const amount = Number(t.amount);
  if (!isFinite(amount) || amount < 0) return true;
  return false;
}

// ---- same chip style as WalletDetail.jsx ----
const Chip = ({ active, onClick, children }) => (
  <button
    type="button"
    className={`badge ${active ? 'bg-primary' : 'bg-secondary'}`}
    onClick={onClick}
    style={{ border: 'none' }}
  >
    {children}
  </button>
);

export default function Portfolio() {
  let ctx; try { ctx = useWallets(); } catch { ctx = undefined; }
  const wallets = Array.isArray(ctx?.wallets) ? ctx.wallets : [];

  const [mode, setMode] = useState('pulse'); // 'all' | 'eth' | 'pulse' | 'base'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [totalUsd, setTotalUsd] = useState(0);
  const [tokens, setTokens] = useState([]);
  const [breakdown, setBreakdown] = useState(new Map());
  const [expanded, setExpanded] = useState(new Set());
  const [q, setQ] = useState(''); // ← search like WalletDetails

  const walletCount = wallets.length;

  const walletName = (addr) =>
    wallets.find(
      (w) => (w.address || '').toLowerCase() === (addr || '').toLowerCase()
    )?.name || 'Wallet';

  async function load(force = false) {
    setLoading(true); setError(null);
    try {
      const only = mode === 'all' ? 'auto' : mode;
      const { totalUsd, tokens, breakdown } = await buildPortfolioDetailed(wallets, { only, force });
      setTotalUsd(totalUsd); setTokens(tokens); setBreakdown(breakdown);
    } catch (e) {
      setError(e?.message || 'Failed to load portfolio');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(false); /* eslint-disable-next-line */ }, [walletCount, mode]);

  // search + junk filter just before render
  const visibleTokens = useMemo(() => {
    const base = tokens.filter((t) => !isJunkToken(t));
    const s = (q || '').trim().toLowerCase();
    if (!s) return base;
    return base.filter((t) =>
      (t.name || '').toLowerCase().includes(s) ||
      (t.symbol || '').toLowerCase().includes(s) ||
      (t.address || t.contract || '').toLowerCase().includes(s)
    );
  }, [tokens, q]);

  const toggleExpand = (k) => {
    const next = new Set(expanded);
    next.has(k) ? next.delete(k) : next.add(k);
    setExpanded(next);
  };

  const standardLabel =
    mode === 'pulse' ? 'PRC-20'
    : mode === 'all' ? 'ERC-20 & PRC-20'
    : 'ERC-20';

  return (
    <>
      {/* HEADER — cloned look from WalletDetail.jsx */}
      <Row className="mb-4">
        <Col>
          <Card className="shadow-sm border-0">
            <Card.Body>
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-3">
                <div>
                  <div className="text-muted" style={{ fontSize: 18, fontWeight: 600 }}>
                    All Wallets
                  </div>

                  <h2 className="mb-1" style={{ fontWeight: 800 }}>{fmtUSD(totalUsd)}</h2>

                  <div className="d-inline-flex align-items-center gap-2" style={{ fontSize: 12 }}>
                    <span className="text-success">24h: +0.00%</span>
                    <span className="text-muted">• Wallets: {walletCount}</span>
                  </div>
                </div>

                {/* Chain chips (All first) */}
                <div className="d-flex align-items-center gap-2">
                  <Chip active={mode === 'all'}   onClick={() => setMode('all')}>All</Chip>
                  <Chip active={mode === 'eth'}   onClick={() => setMode('eth')}>Ethereum</Chip>
                  <Chip active={mode === 'pulse'} onClick={() => setMode('pulse')}>PulseChain</Chip>
                  <Chip active={mode === 'base'}  onClick={() => setMode('base')}>Base</Chip>
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* CONTROLS — Search left, Refresh right (same placement as WalletDetail) */}
      <Row className="mb-3">
        <Col md={6} className="mb-2">
          <Form.Control
            placeholder={`Search ${standardLabel} token / symbol / contract…`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </Col>
        <Col md={6} className="text-md-end">
          <Button variant="outline-secondary" size="sm" onClick={() => load(true)} disabled={loading}>
            {loading ? (<><Spinner size="sm" animation="border" className="me-1" /> Refreshing…</>) : 'Refresh'}
          </Button>
        </Col>
      </Row>

      {/* Sub‑label row like WalletDetail */}
      <Row className="mb-2">
        <Col>
          <small className="text-muted">
            {mode === 'all'
              ? 'All chains — ERC-20 & PRC-20 tokens'
              : mode === 'pulse'
              ? 'PulseChain — PRC-20 tokens'
              : `${mode === 'base' ? 'Base' : 'Ethereum'} — ERC-20 tokens`}
          </small>
        </Col>
      </Row>

      {error && (
        <Row><Col><Card className="mb-3"><Card.Body className="text-danger">{error}</Card.Body></Card></Col></Row>
      )}

      {/* Token rows */}
      <Row>
        <Col>
          <Card className="shadow-sm">
            <Card.Header><strong>Top Tokens</strong></Card.Header>
            <Card.Body>
              {loading && <div className="text-muted">Loading…</div>}
              {!loading && visibleTokens.length === 0 && <div className="text-muted">No tokens found.</div>}

              {!loading && visibleTokens.map((t,i)=>{
                const k = keyFor(t);
                const open = expanded.has(k);
                const rows = breakdown.get(k) || [];

                return (
                  <div key={`${k}:${i}`} className="mb-2 p-2 bg-transparent border-bottom">
                    <div className="d-flex align-items-center justify-content-between">
                      <div className="d-flex align-items-center gap-2">
                        <div className="rounded-circle bg-secondary" style={{ width: 20, height: 20 }} />
                        <div>
                          <div className="fw-semibold">{t.symbol || '—'}</div>
                          <div className="text-muted" style={{ fontSize: 12 }}>
                            {t.name || (t.address ? `${t.address.slice(0,6)}…${t.address.slice(-4)}` : 'Native')}
                          </div>
                        </div>
                      </div>

                      <div className="d-flex align-items-center" style={{ gap: 24 }}>
                        <div className="text-end" style={{ width: 110 }}>
                          <div className="text-muted" style={{ fontSize: 12 }}>Price</div>
                          <div>{fmtUSD(t.priceUsd)}</div>
                        </div>
                        <div className="text-end" style={{ width: 160 }}>
                          <div className="text-muted" style={{ fontSize: 12 }}>Amount</div>
                          <div>{fmtAmt(t.amount)} {t.symbol}</div>
                        </div>
                        <div className="text-end" style={{ width: 140 }}>
                          <div className="text-muted" style={{ fontSize: 12 }}>Value</div>
                          <div className="fw-semibold">{fmtUSD(t.valueUsd)}</div>
                        </div>
                        <div className="d-flex" style={{ gap: 8 }}>
                          <Button size="sm" variant="outline-secondary" onClick={()=>toggleExpand(k)}>
                            {open ? 'Hide' : 'Expand'}
                          </Button>
                        </div>
                      </div>
                    </div>

                    {open && (
                      <div className="mt-3 ms-4">
                        <div className="text-muted mb-2" style={{ fontSize: 12 }}>Balance Breakdown</div>
                        {rows.length === 0 && <div className="text-muted" style={{ fontSize: 12 }}>No holdings.</div>}
                        {rows.map((r, idx)=>(
                          <div key={idx} className="d-flex justify-content-between" style={{ fontSize: 12, lineHeight: '22px' }}>
                            <div>{walletName(r.wallet)}</div>
                            <div className="text-end">{fmtAmt(r.amount)} {t.symbol}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
}
