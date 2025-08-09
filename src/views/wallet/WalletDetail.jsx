/* eslint-disable import/no-relative-parent-imports */
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Row, Col, Card, Button, Form, Modal } from 'react-bootstrap';
import { getPortfolioWithPrices } from '../../services/moralisService.js';
import { fetchPulsechainTokens } from '../../services/pulsechainService.js';
import wallets from '../../data/wallets.js';
import { setWalletCache } from '../../utils/walletCache';

// ⬇️ NEW: sticky chip + last-section helpers
import {
  getLastSection,
  setLastSection,
  getWalletNetChip,
  setWalletNetChip
} from '../../utils/uiState';

// ----------------------------- utils -----------------------------
// Force "USD $12,345.67"
const fmtUSD = (n) => {
  const amt = (Number(n) || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `USD $${amt}`;
};

const fmtNum = (n) =>
  (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 6 });

const short = (a) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || '');

const addrStyle = {
  fontFamily: 'monospace',
  fontSize: 18,
  lineHeight: '24px',
  display: 'inline-block',
  verticalAlign: 'middle'
};

// ---------------- wallet name/chain resolver (robust) ----------------
function findByAddrLoose(arr, addrLower) {
  const array = Array.isArray(arr) ? arr : [];
  const addrFields = ['address', 'addr', 'account', 'publicKey', 'public_key', 'hash', 'id', 'wallet'];

  // 1) exact full-address match
  let item = array.find((w) =>
    addrFields.some((f) => (w?.[f] || '').toLowerCase() === addrLower)
  );
  if (item) return item;

  // 2) loose match on short id/prefix/suffix like "0xbc16"
  item = array.find((w) => {
    const vals = addrFields.map((f) => (w?.[f] || '').toLowerCase());
    return vals.some((v) => v && (addrLower.startsWith(v) || addrLower.endsWith(v)));
  });
  return item || null;
}

function findAnyWalletRecord(addressLower) {
  let rec = findByAddrLoose(wallets, addressLower);
  if (rec) return rec;

  try {
    const keys = ['wallets', 'kinko:wallets', 'kinko_wallets', 'portfolio:wallets'];
    for (const k of keys) {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const groups = [];

      if (Array.isArray(parsed)) groups.push(parsed);
      else if (parsed && typeof parsed === 'object') {
        groups.push([parsed]);
        Object.values(parsed).forEach((v) => { if (Array.isArray(v)) groups.push(v); });
      }

      for (const g of groups) {
        const hit = findByAddrLoose(g, addressLower);
        if (hit) return hit;
      }
    }
  } catch { /* ignore */ }

  return null;
}

function normalizeChain(x) {
  const s = (x ?? '').toString().toLowerCase();
  if (s.includes('pulse') || s === '369') return 'pulse';
  if (s.includes('base')  || s === '8453') return 'base';
  return 'eth';
}

function resolveWalletName(address) {
  const a = (address || '').toLowerCase();
  if (!a) return 'Wallet';
  const rec = findAnyWalletRecord(a);
  return rec?.name || rec?.label || rec?.title || rec?.nickname || 'Wallet';
}

function resolveDefaultChain(address) {
  const a = (address || '').toLowerCase();
  if (!a) return 'eth';
  const rec = findAnyWalletRecord(a);
  if (!rec) return 'eth';
  const raw =
    rec.chain ?? rec.network ?? rec.net ??
    (typeof rec.chainId === 'number' ? String(rec.chainId) : rec.chainId);
  return normalizeChain(raw);
}

// Derive a stable "group id" for sticky chip storage.
// We look for common group-ish fields and fall back to a generic bucket.
function resolveGroupId(address) {
  const rec = findAnyWalletRecord((address || '').toLowerCase()) || {};
  return (
    rec.group ||
    rec.grp ||
    rec.collection ||
    rec.folder ||
    rec.section ||
    rec.category ||
    rec.groupId ||
    'default'
  );
}

// -------- tiny icon button --------
const IconButton = ({ title, onClick, children }) => (
  <button
    type="button"
    className="btn btn-sm btn-outline-secondary p-1 d-inline-flex align-items-center justify-content-center"
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

// ==============================  PAGE  ==============================
export default function WalletDetail() {
  const { address = '' } = useParams();

  // Mark this page as "wallets" while mounted (used to decide default chip on entry).
  useEffect(() => { setLastSection('wallets'); }, []);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [native, setNative] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [q, setQ] = useState('');
  const [sortKey, setSortKey] = useState('value');
  const [sortDir, setSortDir] = useState('desc');
  const [showQR, setShowQR] = useState(false);

  const walletName = useMemo(() => resolveWalletName(address), [address]);

  // Sticky chip logic:
  // - scoped per wallet "group"
  // - if we arrived from outside the wallet section (e.g., View All), default to 'all'
  // - otherwise reuse the saved chip for this group
  const groupId = useMemo(() => resolveGroupId(address), [address]);

  const initialChip = useMemo(() => {
    const last = getLastSection();               // 'wallets' vs something else
    const saved = getWalletNetChip(groupId);     // '', 'all', 'eth', 'pulse', 'base'
    return (last === 'wallets' && saved) ? saved : 'all';
  }, [groupId]);

  const [activeChain, setActiveChain] = useState(initialChip);

  // Keep chip in sync when switching between wallets/groups
  useEffect(() => {
    setActiveChain(initialChip);
  }, [address, groupId, initialChip]);

  const onChipChange = (code) => {
    setActiveChain(code);
    setWalletNetChip(groupId, code); // persist per group
  };

  // Normalise any token for cache format
  const mapTokenForCache = (t) => {
    const priceUsd = Number(t.priceUsd ?? t.price ?? 0);
    const amount   = Number(t.amount ?? 0);
    const valueUsd = Number(t.valueUsd ?? t.value ?? amount * priceUsd);
    return {
      symbol: (t.symbol || t.ticker || (t.name || 'TOKEN')).toUpperCase(),
      name: t.name || t.symbol || 'Token',
      amount,
      priceUsd,
      valueUsd,
      contract: t.contract,
      logo: t.logo,
      chain: t.chain || activeChain
    };
  };

  // ---- adapt Blockscout rows -> our UI shape ----
  const adaptPulseTokens = (rows) => {
    const list = Array.isArray(rows) ? rows.slice() : [];
    const plsIdx = list.findIndex((r) => r.address === 'PLS' || r.symbol === 'PLS');
    const pls = plsIdx >= 0 ? list.splice(plsIdx, 1)[0] : null;

    const nat = pls
      ? {
          name: 'PulseChain',
          symbol: 'PLS',
          amount: Number(pls.balance || 0),
          price: Number(pls.price || 0),
          value: Number(pls.value || 0),
          contract: 'native',
          logo: pls.iconUrl || null,
          chain: 'pulse'
        }
      : null;

    const toks = list.map((r) => ({
      name: r.name || r.symbol || 'Token',
      symbol: r.symbol || '',
      amount: Number(r.balance || 0),
      price: Number(r.price || 0),
      value: Number(r.value || 0),
      contract: r.address || null,
      logo: r.iconUrl || null,
      chain: 'pulse'
    }));

    const totalUSD = (nat ? nat.value : 0) + toks.reduce((s, t) => s + (t.value || 0), 0);
    return { native: nat, tokens: toks, totalUSD };
  };

  // Fetch one chain and tag rows with chain
  async function fetchOneChain(chainCode) {
    if (chainCode === 'pulse') {
      const rows = await fetchPulsechainTokens(address);
      return adaptPulseTokens(rows);
    }
    // eth/base via Moralis
    const res = await getPortfolioWithPrices(address, chainCode);
    const nat = res?.native
      ? { ...res.native, chain: chainCode }
      : null;
    const toks = Array.isArray(res?.tokens) ? res.tokens.map((t) => ({ ...t, chain: chainCode })) : [];
    const totalUSD = Number(res?.totalUSD || (nat?.value || 0) + toks.reduce((s, t) => s + (t.value || t.valueUsd || 0), 0));
    return { native: nat, tokens: toks, totalUSD };
  }

  // fetch -> set state -> cache
  useEffect(() => {
    let dead = false;

    async function load() {
      try {
        setLoading(true);
        setErr('');
        setNative(null);
        setTokens([]);

        let result;
        if (activeChain === 'all') {
          const chainsWanted = ['eth', 'base', 'pulse'];
          const parts = await Promise.allSettled(chainsWanted.map(fetchOneChain));
          const ok = parts
            .map((p, i) => (p.status === 'fulfilled' ? { ...p.value, _c: chainsWanted[i] } : null))
            .filter(Boolean);

          const natRows = ok.map((r) => r.native).filter(Boolean);
          const tokRows = ok.flatMap((r) => r.tokens || []);
          const totalUSD = ok.reduce((s, r) => s + (Number(r.totalUSD) || 0), 0);

          result = { native: null, tokens: [...natRows, ...tokRows], totalUSD };
        } else {
          result = await fetchOneChain(activeChain);
        }

        const { tokens: tok, native: nat, totalUSD } = result || { tokens: [], native: null, totalUSD: 0 };

        if (!dead) {
          setNative(nat ? { ...nat } : null);
          setTokens(Array.isArray(tok) ? tok : []);
          document.title = `Kinko Wallet – ${walletName} – ${fmtUSD(totalUSD)}`;
        }

        // cache snapshot for View All
        try {
          const cachedTokens = [
            ...(nat ? [mapTokenForCache({ ...nat, name: nat.name || nat.symbol || 'Native' })] : []),
            ...(Array.isArray(tok) ? tok.map(mapTokenForCache) : []),
          ];
          const cachedTotal = Number.isFinite(result?.totalUSD)
            ? Number(result.totalUSD)
            : cachedTokens.reduce((s, t) => s + (t.valueUsd || 0), 0);

          setWalletCache(`${address}:${activeChain}`, {
            chain: activeChain,
            tokens: cachedTokens,
            totalUsd: cachedTotal
          });
        } catch { /* ignore */ }
      } catch (e) {
        if (!dead) setErr(e.message || `Failed to load ${activeChain.toUpperCase()} data`);
      } finally {
        if (!dead) setLoading(false);
      }
    }

    if (address) load();
    return () => { dead = true; };
  }, [address, walletName, activeChain]);

  // ----------------------------- table data & sorting -----------------------------
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
          ? (a.price ?? a.priceUsd ?? 0)
          : sortKey === 'amount'
          ? (a.amount ?? 0)
          : (a.value ?? a.valueUsd ?? 0);
      const vb =
        sortKey === 'name'
          ? (b.name || b.symbol || '').toLowerCase()
          : sortKey === 'price'
          ? (b.price ?? b.priceUsd ?? 0)
          : sortKey === 'amount'
          ? (b.amount ?? 0)
          : (b.value ?? b.valueUsd ?? 0);
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    };
    return filtered.sort(cmp);
  }, [native, tokens, q, sortKey, sortDir]);

  const totalUSD = useMemo(
    () => items.reduce((s, t) => s + (t.value ?? t.valueUsd ?? 0), 0),
    [items]
  );

  const onSort = (k) => {
    setSortKey((prev) => {
      if (prev !== k) { setSortDir('desc'); return k; }
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
      return k;
    });
  };

  const copy = (txt) => navigator.clipboard?.writeText(txt).catch(() => {});

  // clickable chip
  const chip = (label, code) => (
    <button
      type="button"
      className={`badge ${activeChain === code ? 'bg-primary' : 'bg-secondary'}`}
      onClick={() => onChipChange(code)}
      style={{ border: 'none' }}
    >
      {label}
    </button>
  );

  const standardLabel =
    activeChain === 'pulse' ? 'PRC-20'
    : activeChain === 'all' ? 'ERC-20 & PRC-20'
    : 'ERC-20';

  const chainName = (c) => (c === 'pulse' ? 'Pulse' : c === 'base' ? 'Base' : 'ETH');

  // ----------------------------- render -----------------------------
  return (
    <>
      {/* HEADER */}
      <Row className="mb-4">
        <Col>
          <Card className="shadow-sm border-0">
            <Card.Body>
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-3">
                <div>
                  <div className="text-muted" style={{ fontSize: 18, fontWeight: 600 }}>
                    {walletName}
                  </div>

                  <h2 className="mb-1" style={{ fontWeight: 800 }}>{fmtUSD(totalUSD)}</h2>

                  <div className="d-inline-flex align-items-center gap-2" style={{ fontSize: 12 }}>
                    <span style={addrStyle}>{short(address)}</span>
                    <IconButton title="Copy address" onClick={() => copy(address)}>
                      <CopyIcon />
                    </IconButton>
                    <IconButton title="Show QR" onClick={() => setShowQR(true)}>
                      <QrIcon />
                    </IconButton>
                  </div>
                </div>

                {/* Chain chips (All first) */}
                <div className="d-flex align-items-center gap-2">
                  {chip('All', 'all')}
                  {chip('Ethereum', 'eth')}
                  {chip('PulseChain', 'pulse')}
                  {chip('Base', 'base')}
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
            placeholder={`Search ${standardLabel} token / symbol / contract…`}
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
      <Row className="mb-2">
        <Col>
          <small className="text-muted">
            {activeChain === 'all'
              ? 'All chains — ERC-20 & PRC-20 tokens'
              : activeChain === 'pulse'
              ? 'PulseChain — PRC-20 tokens'
              : `${activeChain === 'base' ? 'Base' : 'Ethereum'} — ERC-20 tokens`}
          </small>
        </Col>
      </Row>

      <Row>
        <Col>
          <Card className="shadow-sm">
            <Card.Body className="p-0">
              <div className="table-responsive">
                <table className="table table-hover mb-0 align-middle">
                  <thead className="sticky-top" style={{ position: 'sticky', top: 0 }}>
                    <tr>
                      <th style={{ width: '38%' }}>
                        <button
                          className="btn btn-link p-0 text-decoration-none text-reset"
                          onClick={() => onSort('name')}
                        >
                          Token {sortKey === 'name' && (sortDir === 'asc' ? '▲' : '▼')}
                        </button>
                      </th>
                      <th className="text-end" style={{ width: '18%' }}>
                        <button
                          className="btn btn-link p-0 text-decoration-none text-reset"
                          onClick={() => onSort('price')}
                        >
                          Price {sortKey === 'price' && (sortDir === 'asc' ? '▲' : '▼')}
                        </button>
                      </th>
                      <th className="text-end" style={{ width: '18%' }}>
                        <button
                          className="btn btn-link p-0 text-decoration-none text-reset"
                          onClick={() => onSort('amount')}
                        >
                          Amount {sortKey === 'amount' && (sortDir === 'asc' ? '▲' : '▼')}
                        </button>
                      </th>
                      <th className="text-end" style={{ width: '18%' }}>
                        <button
                          className="btn btn-link p-0 text-decoration-none text-reset"
                          onClick={() => onSort('value')}
                        >
                          Value {sortKey === 'value' && (sortDir === 'asc' ? '▲' : '▼')}
                        </button>
                      </th>
                      <th style={{ width: '8%' }}>CONTRACT</th>
                    </tr>
                  </thead>

                  <tbody>
                    {loading && <tr><td colSpan={5} className="text-center py-4">Loading {standardLabel}…</td></tr>}
                    {!loading && err && <tr><td colSpan={5} className="text-danger py-4 text-center">{err}</td></tr>}
                    {!loading && !err && items.length === 0 && (
                      <tr><td colSpan={5} className="py-4 text-center">No tokens found.</td></tr>
                    )}

                    {!loading && !err && items.map((t, i) => {
                      const price = (t.price ?? t.priceUsd ?? 0);
                      const amount = (t.amount ?? 0);
                      const value = (t.value ?? t.valueUsd ?? (amount * price));
                      const c = (t.chain || activeChain);

                      return (
                        <tr key={`${t.contract || t.symbol || 'row'}-${i}`}>
                          <td>
                            <div className="d-flex align-items-center gap-2">
                              <div
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: 6,
                                  overflow: 'hidden',
                                  background: 'var(--bs-secondary-bg, #e9ecef)',
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
                                <small className="text-muted">
                                  {t.symbol}
                                  {activeChain === 'all' && t.symbol ? ' • ' : ''}
                                  {activeChain === 'all' && <span className="badge bg-secondary ms-0">{chainName(c)}</span>}
                                </small>
                              </div>
                            </div>
                          </td>

                          <td className="text-end">{fmtUSD(price)}</td>
                          <td className="text-end">{fmtNum(amount)}</td>
                          <td className="text-end"><strong>{fmtUSD(value)}</strong></td>
                          <td>
                            <span
                              className="badge bg-secondary"
                              style={{ cursor: t.contract ? 'pointer' : 'default' }}
                              title={t.contract ? 'Copy contract' : undefined}
                              onClick={() => t.contract && copy(t.contract)}
                            >
                              {t.contract ? short(t.contract) : 'native'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
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
