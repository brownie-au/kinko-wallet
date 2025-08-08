/* eslint-disable import/no-relative-parent-imports */
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Row, Col, Card, Button, Form, Modal } from 'react-bootstrap';
import { getPortfolioWithPrices } from '../../services/moralisService.js';
import wallets from '../../data/wallets.js';

const fmtUSD = (n) =>
  (Number(n) || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const fmtNum = (n) =>
  (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 6 });
const short = (a) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || '');

// matches the 24px icon buttons
const addrStyle = {
  fontFamily: 'monospace',
  fontSize: 18,
  lineHeight: '24px',
  display: 'inline-block',
  verticalAlign: 'middle'
};

/* ------------------------------------------------------------------ */
/* Wallet name resolver: wallets.js -> localStorage (several keys)    */
/* ------------------------------------------------------------------ */
function findNameInArray(arr, addrLower) {
  const array = Array.isArray(arr) ? arr : [];
  const addrFields = ['address', 'addr', 'account', 'publicKey', 'public_key', 'hash', 'id', 'wallet'];
  const item = array.find((w) => addrFields.some((f) => (w?.[f] || '').toLowerCase() === addrLower));
  return item?.name || item?.label || item?.title || item?.nickname || null;
}

function resolveWalletName(address) {
  const a = (address || '').toLowerCase();
  if (!a) return 'Wallet';

  // 1) imported list
  const fromImport = findNameInArray(wallets, a);
  if (fromImport) return fromImport;

  // 2) localStorage (common keys / shapes)
  try {
    const keys = ['wallets', 'kinko:wallets', 'kinko_wallets', 'portfolio:wallets'];
    for (const k of keys) {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw);

      // handle arrays, or objects that contain arrays, or single objects
      const candidates = [];
      if (Array.isArray(parsed)) candidates.push(parsed);
      else if (parsed && typeof parsed === 'object') {
        candidates.push([parsed]);
        Object.values(parsed).forEach((v) => {
          if (Array.isArray(v)) candidates.push(v);
        });
      }

      for (const arr of candidates) {
        const name = findNameInArray(arr, a);
        if (name) return name;
      }
    }
  } catch {
    /* ignore JSON errors */
  }

  return 'Wallet';
}

/* ------- tiny inline icon buttons ------- */
const IconButton = ({ title, onClick, children }) => (
  <button
    type="button"
    className="btn btn-sm btn-outline-light p-1 d-inline-flex align-items-center justify-content-center"
    style={{ width: 24, height: 24, borderRadius: 6 }}
    title={title}
    onClick={onClick}
  >
    {children}
  </button>
);

const CopyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="11" height="11" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const QrIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <rect x="3" y="3"   width="6" height="6" rx="1" />
    <rect x="15" y="3"  width="6" height="6" rx="1" />
    <rect x="3" y="15"  width="6" height="6" rx="1" />
    <rect x="15" y="15" width="2" height="2" />
    <rect x="19" y="15" width="2" height="2" />
    <rect x="15" y="19" width="2" height="2" />
    <rect x="19" y="19" width="2" height="2" />
  </svg>
);

export default function WalletDetail() {
  const { address = '' } = useParams();

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [native, setNative] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [q, setQ] = useState('');
  const [sortKey, setSortKey] = useState('value');
  const [sortDir, setSortDir] = useState('desc');
  const [showQR, setShowQR] = useState(false);

  // Resolve wallet name from multiple sources
  const walletName = useMemo(() => resolveWalletName(address), [address]);

  useEffect(() => {
    let dead = false;
    async function load() {
      try {
        setLoading(true);
        setErr('');
        const { tokens, native, totalUSD } = await getPortfolioWithPrices(address, 'eth'); // ETH page
        if (!dead) {
          setNative({ ...native });
          setTokens(tokens);
          document.title = `Kinko Wallet – ${walletName} – ${fmtUSD(totalUSD)}`;
        }
      } catch (e) {
        if (!dead) setErr(e.message || 'Failed to load wallet');
      } finally {
        if (!dead) setLoading(false);
      }
    }
    if (address) load();
    return () => { dead = true; };
  }, [address, walletName]);

  const items = useMemo(() => {
    const base = native ? [native, ...tokens] : tokens.slice();
    const s = (q || '').trim().toLowerCase();
    const filtered = s
      ? base.filter(
          (t) =>
            (t.name || '').toLowerCase().includes(s) ||
            (t.symbol || '').toLowerCase().includes(s) ||
            (t.contract || '').toLowerCase().includes(s)
        )
      : base;

    const cmp = (a, b) => {
      const va =
        sortKey === 'name'
          ? (a.name || a.symbol || '').toLowerCase()
          : sortKey === 'price'
          ? a.price
          : sortKey === 'amount'
          ? a.amount
          : a.value;
      const vb =
        sortKey === 'name'
          ? (b.name || b.symbol || '').toLowerCase()
          : sortKey === 'price'
          ? b.price
          : sortKey === 'amount'
          ? b.amount
          : b.value;
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    };
    return filtered.sort(cmp);
  }, [native, tokens, q, sortKey, sortDir]);

  const totalUSD = useMemo(() => items.reduce((s, t) => s + (t.value || 0), 0), [items]);

  const onSort = (k) => {
    setSortKey((prev) => {
      if (prev !== k) { setSortDir('desc'); return k; }
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
      return k;
    });
  };

  const copy = (txt) => navigator.clipboard?.writeText(txt).catch(() => {});

  return (
    <>
      {/* HEADER */}
      <Row className="mb-4">
        <Col>
          <Card className="shadow-sm border-0" style={{ background: 'linear-gradient(135deg,#1f2937,#0f172a)' }}>
            <Card.Body className="text-white">
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-3">
                <div>
                  {/* Wallet Name */}
                  <div className="opacity-75" style={{ fontSize: 18, fontWeight: 600 }}>
                    {walletName}
                  </div>

                  <h2 className="mb-1" style={{ fontWeight: 800 }}>{fmtUSD(totalUSD)}</h2>

                  {/* Short address + copy + QR */}
                  <div className="d-inline-flex align-items-center gap-2" style={{ fontSize: 12, opacity: 0.9 }}>
                    <span style={addrStyle}>{short(address)}</span>
                    <IconButton title="Copy address" onClick={() => copy(address)}>
                      <CopyIcon />
                    </IconButton>
                    <IconButton title="Show QR" onClick={() => setShowQR(true)}>
                      <QrIcon />
                    </IconButton>
                  </div>
                </div>

                {/* Chain chips (static for now) */}
                <div className="d-flex align-items-center gap-2">
                  <span className="badge bg-primary">Ethereum</span>
                  <span className="badge bg-secondary">Base</span>
                  <span className="badge bg-secondary">PulseChain</span>
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* CONTROLS */}
      <Row className="mb-3">
        <Col md={6} className="mb-2">
          <Form.Control
            placeholder="Search token / symbol / contract…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </Col>
        <Col md={6} className="text-md-end">
          <Button variant="outline-secondary" size="sm" onClick={() => window.location.reload()}>
            <i className="feather icon-rotate-ccw me-1" /> Refresh
          </Button>
        </Col>
      </Row>

      {/* TABLE */}
      <Row>
        <Col>
          <Card className="shadow-sm">
            <Card.Body className="p-0">
              <div className="table-responsive">
                <table className="table table-dark table-hover mb-0">
                  <thead className="sticky-top" style={{ position: 'sticky', top: 0 }}>
                    <tr>
                      <th style={{ width: '38%' }}>
                        <button
                          className="btn btn-link p-0 text-decoration-none text-white"
                          onClick={() => onSort('name')}
                        >
                          Token {sortKey === 'name' && (sortDir === 'asc' ? '▲' : '▼')}
                        </button>
                      </th>
                      <th className="text-end" style={{ width: '18%' }}>
                        <button
                          className="btn btn-link p-0 text-decoration-none text-white"
                          onClick={() => onSort('price')}
                        >
                          Price {sortKey === 'price' && (sortDir === 'asc' ? '▲' : '▼')}
                        </button>
                      </th>
                      <th className="text-end" style={{ width: '18%' }}>
                        <button
                          className="btn btn-link p-0 text-decoration-none text-white"
                          onClick={() => onSort('amount')}
                        >
                          Amount {sortKey === 'amount' && (sortDir === 'asc' ? '▲' : '▼')}
                        </button>
                      </th>
                      <th className="text-end" style={{ width: '18%' }}>
                        <button
                          className="btn btn-link p-0 text-decoration-none text-white"
                          onClick={() => onSort('value')}
                        >
                          Value {sortKey === 'value' && (sortDir === 'asc' ? '▲' : '▼')}
                        </button>
                      </th>
                      <th style={{ width: '8%' }}>Contract</th>
                    </tr>
                  </thead>

                  <tbody>
                    {loading && <tr><td colSpan={5} className="text-center py-4">Loading…</td></tr>}
                    {!loading && err && <tr><td colSpan={5} className="text-danger py-4 text-center">{err}</td></tr>}
                    {!loading && !err && items.length === 0 && (
                      <tr><td colSpan={5} className="py-4 text-center">No tokens found.</td></tr>
                    )}

                    {!loading && !err && items.map((t) => (
                      <tr key={`${t.contract}-${t.symbol}`}>
                        <td>
                          <div className="d-flex align-items-center gap-2">
                            <div
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 6,
                                overflow: 'hidden',
                                background: '#111827',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              {t.logo ? (
                                <img src={t.logo} alt="" style={{ width: 28, height: 28, objectFit: 'cover' }} />
                              ) : (
                                <span style={{ fontSize: 12, opacity: 0.7 }}>
                                  {(t.symbol || '?').slice(0, 3)}
                                </span>
                              )}
                            </div>
                            <div className="d-flex flex-column">
                              <strong>{t.name}</strong>
                              <small className="text-muted">{t.symbol}</small>
                            </div>
                          </div>
                        </td>
                        <td className="text-end">{fmtUSD(t.price)}</td>
                        <td className="text-end">{fmtNum(t.amount)}</td>
                        <td className="text-end">
                          <strong>{fmtUSD(t.value)}</strong>
                        </td>
                        <td>
                          <span
                            className="badge bg-secondary"
                            style={{ cursor: 'pointer' }}
                            title="Copy contract"
                            onClick={() => t.contract && copy(t.contract)}
                          >
                            {t.contract ? short(t.contract) : '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* QR MODAL */}
      <Modal show={showQR} onHide={() => setShowQR(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Wallet QR</Modal.Title>
        </Modal.Header>
        <Modal.Body className="text-center">
          <img
            alt="QR"
            width={240}
            height={240}
            style={{ imageRendering: 'pixelated' }}
            src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(address)}`}
          />
          <div className="mt-3" style={{ wordBreak: 'break-all', fontFamily: 'monospace' }}>{address}</div>
          <Button className="mt-3" onClick={() => { copy(address); setShowQR(false); }}>
            Copy Address
          </Button>
        </Modal.Body>
      </Modal>
    </>
  );
}
