// src/views/wallet/WalletManage.jsx
import React, { useState, useEffect, useRef } from 'react';
import {
  Card,
  Button,
  Form,
  Row,
  Col,
  ListGroup,
  Alert,
  ButtonGroup,
  InputGroup,
  Modal
} from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import { useWallets } from '../../contexts/WalletContext.jsx';
import CreatePortfolioIdModal from '../../components/CreatePortfolioIdModal.jsx';
import PortfolioIdModal from '../../components/PortfolioIdModal.jsx';
import WelcomeModal from '../../components/WelcomeModal.jsx';
import { clearSyncId } from '../../services/syncService.js';
import { clearEhexStakesCaches } from '../../services/kw-ehexStakingService.js';
import { usePortfolioValue, HEX_STAKING_SOURCE, EHEX_STAKING_SOURCE } from '../../contexts/PortfolioValueContext.jsx';

const SOFT = {
  success: { backgroundColor: 'rgba(25,135,84,0.12)', borderColor: 'rgba(25,135,84,0.35)', color: '#1e7e55' },
  warning: { backgroundColor: 'rgba(255,193,7,0.12)', borderColor: 'rgba(255,193,7,0.45)', color: '#996c00' },
  danger: { backgroundColor: 'rgba(220,53,69,0.12)', borderColor: 'rgba(220,53,69,0.40)', color: '#9f1c28' },
  info:   { backgroundColor: 'rgba(13,110,253,0.12)', borderColor: 'rgba(13,110,253,0.35)', color: '#0a58ca' } // blue
};

const ACTION_BTN_STYLE = {
  minWidth: 84,           // consistent width
  padding: '3px 10px',    // slimmer
  lineHeight: '1.1',
  fontWeight: 600
};

const WalletManage = () => {
  const { replaceWallets } = useWallets();
  // Local authoritative list for Manage page (includes hidden)
  const [wallets, setWallets] = useState([]);
  const [_, setWalletsStateTick] = useState(0); // force re-render after edits if needed
  const [dragIndex, setDragIndex] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragGhostRef = useRef(null);
  const addressInputRef = useRef(null);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [welcomeModalDismissed, setWelcomeModalDismissed] = useState(false);

  const destroyDragGhost = () => {
    try {
      const el = dragGhostRef.current;
      if (el && el.parentNode) el.parentNode.removeChild(el);
    } catch {}
    dragGhostRef.current = null;
  };

  const createDragGhost = (wallet) => {
    destroyDragGhost();
    const ghost = document.createElement('div');
    ghost.setAttribute('role', 'presentation');
    ghost.style.position = 'absolute';
    ghost.style.top = '-9999px';
    ghost.style.left = '-9999px';
    ghost.style.zIndex = '2147483647';
    ghost.style.pointerEvents = 'none';
    ghost.style.padding = '8px 10px';
    ghost.style.borderRadius = '8px';
    ghost.style.border = '1px solid rgba(255,255,255,0.18)';
    ghost.style.background = 'rgba(26, 28, 34, 0.96)';
    ghost.style.color = '#fff';
    ghost.style.boxShadow = '0 6px 18px rgba(0,0,0,0.35)';
    ghost.style.font = '500 13px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
    ghost.style.display = 'flex';
    ghost.style.alignItems = 'center';
    ghost.style.gap = '10px';

    const icon = document.createElement('div');
    icon.textContent = '☰';
    icon.style.opacity = '0.8';
    icon.style.fontSize = '14px';

    const text = document.createElement('div');
    const name = wallet?.name || 'Unnamed';
    const addr = wallet?.address || '';
    text.innerHTML = `
      <div style="font-weight:700; font-family:monospace; white-space:nowrap;">${addr}</div>
      <div style="opacity:.85; font-size:12px;">${name}</div>
    `;

    ghost.appendChild(icon);
    ghost.appendChild(text);
    document.body.appendChild(ghost);
    dragGhostRef.current = ghost;
    return ghost;
  };
  const [address, setAddress] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const [editingIndex, setEditingIndex] = useState(null);
  const [tempName, setTempName] = useState('');

  const [confirmIdx, setConfirmIdx] = useState(null); // delete confirmation

  const [showCreateId, setShowCreateId] = useState(false);
  const [showUseId, setShowUseId] = useState(false);
  const [showLogout, setShowLogout] = useState(false);

  const walletList = Array.isArray(wallets) ? wallets : [];
  const totalWallets = walletList.length;
  const activeWallets = walletList.filter((w) => !w.hidden).length;
  const hiddenWallets = totalWallets - activeWallets;
  const walletCountLabel = `${totalWallets} (${activeWallets} Active${hiddenWallets > 0 ? ` / ${hiddenWallets} Hidden` : ''})`;

  const navigate = useNavigate();
  const { removeSource } = usePortfolioValue();

  // ---- Local storage helpers (Manage uses full list incl. hidden) ----
  const readAll = () => {
    try {
      const raw = localStorage.getItem('wallets');
      const arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) return [];
      return arr.map((w) => ({ address: (w?.address || '').trim(), name: (w?.name || '').trim(), hidden: !!w?.hidden }));
    } catch { return []; }
  };
  const writeAll = (list) => {
    try { localStorage.setItem('wallets', JSON.stringify(Array.isArray(list) ? list : [])); } catch {}
    // keep app views in sync: update context with visible-only
    try {
      const visible = (Array.isArray(list) ? list : []).filter((w) => !w.hidden).map(({ address, name }) => ({ address, name }));
      replaceWallets(visible);
    } catch {}
  };

  // Hydrate on mount
  useEffect(() => {
    const all = readAll();
    setWallets(all);
    // also ensure context sees visible-only
    try { replaceWallets(all.filter((w) => !w.hidden).map(({ address, name }) => ({ address, name }))); } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (totalWallets > 0 && welcomeModalDismissed) {
      setWelcomeModalDismissed(false);
    }
  }, [totalWallets, welcomeModalDismissed]);

  useEffect(() => {
    if (totalWallets === 0 && !welcomeModalDismissed) {
      setShowWelcomeModal(true);
    } else if (totalWallets > 0 && showWelcomeModal) {
      setShowWelcomeModal(false);
    }
  }, [totalWallets, welcomeModalDismissed, showWelcomeModal]);

  const handleWelcomeModalHide = () => {
    if (totalWallets === 0) {
      setWelcomeModalDismissed(true);
    }
    setShowWelcomeModal(false);
    setTimeout(() => {
      try { addressInputRef.current && addressInputRef.current.focus(); } catch {}
    }, 0);
  };


  // Add
  const addWallet = (e) => {
    e.preventDefault();
    if (!address) return;

    const normalized = address.trim().toLowerCase();
    const exists = (wallets || []).some((w) => (w.address || '').trim().toLowerCase() === normalized);
    if (exists) {
      setError('This wallet address already exists.');
      return;
    }

    const next = [...(wallets || []), { address: address.trim(), name, hidden: false }];
    setWallets(next);
    writeAll(next);
    setAddress('');
    setName('');
    setError('');
  };

  // Delete (confirmed)
  const deleteWallet = (idx) => {
    const next = (wallets || []).filter((_, i) => i !== idx);
    setWallets(next);
    writeAll(next);
    setConfirmIdx(null);
  };

  // Edit
  const startEdit = (idx) => {
    setEditingIndex(idx);
    setTempName(wallets[idx]?.name || '');
  };

  const saveEdit = (idx) => {
    const trimmed = (tempName || '').trim();
    const next = (wallets || []).map((w, i) => (i === idx ? { ...w, name: trimmed } : w));
    setWallets(next);
    writeAll(next);
    setEditingIndex(null);
    setTempName('');
    setWalletsStateTick((x) => x + 1);
  };

  // ---- drag & drop reordering ----
  const onDragStart = (idx) => (e) => {
    try { e.dataTransfer.setData('text/plain', String(idx)); } catch {}
    e.dataTransfer.effectAllowed = 'move';
    setDragIndex(idx);
    setIsDragging(true);
    // custom drag image containing address + name for better feedback
    try {
      const ghost = createDragGhost(wallets[idx]);
      // offset a bit so the mouse pointer doesn't cover text
      e.dataTransfer.setDragImage(ghost, 12, 12);
    } catch {}
  };
  const onDragOver = (idx) => (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const onDrop = (idx) => (e) => {
    e.preventDefault();
    let from = dragIndex;
    try { const d = Number(e.dataTransfer.getData('text/plain')); if (!Number.isNaN(d)) from = d; } catch {}
    setDragIndex(null);
    setIsDragging(false);
    destroyDragGhost();
    if (from == null || from === idx) return;
    const next = (wallets || []).slice();
    const [m] = next.splice(from, 1);
    next.splice(idx, 0, m);
    setWallets(next);
    writeAll(next);
  };
  const onDragEnd = () => { setDragIndex(null); setIsDragging(false); destroyDragGhost(); };

  const cancelEdit = () => {
    setEditingIndex(null);
    setTempName('');
  };

  const onEditKey = (e, idx) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit(idx);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  };

  // Open
  const openWallet = (addr) => {
    if (!addr) return;
    navigate(`/wallet/${addr}`);
  };

  // Hide/Unhide
  const toggleHidden = (idx) => {
    const next = (wallets || []).map((w, i) => (i === idx ? { ...w, hidden: !w.hidden } : w));
    setWallets(next);
    writeAll(next);
  };

  return (
    <div>
      <h2 className="mb-3">Manage Wallets</h2>

      <div className="mb-3 d-flex justify-content-start gap-2 flex-wrap">
        <Button
          variant="outline-secondary"
          className="rounded-pill"
          onClick={() => setShowUseId(true)}
        >
          Use Portfolio ID
        </Button>
        <Button
          variant="outline-secondary"
          className="rounded-pill"
          onClick={() => setShowCreateId(true)}
        >
          Create / Update Portfolio ID
        </Button>
        <Button
          variant="outline-danger"
          className="rounded-pill"
          onClick={() => setShowLogout(true)}
          title="Log out of this device"
        >
          Logout
        </Button>
      </div>

      <Card className="mb-4">
        <Card.Body>
          <Form onSubmit={addWallet}>
            <Row>
              <Col md={5}>
                <Form.Group controlId="walletAddress">
                  <Form.Label>Wallet Address</Form.Label>
                  <Form.Control
                    ref={addressInputRef}
                    type="text"
                    placeholder="0x1234...abcd"
                    value={address}
                    onChange={(e) => { setAddress(e.target.value); setError(''); }}
                    required
                  />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group controlId="walletName">
                  <Form.Label>Wallet Name</Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="My Wallet"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </Form.Group>
              </Col>
              <Col md={3} className="d-flex align-items-end">
                <Button variant="primary" type="submit" className="w-100">
                  Add Wallet
                </Button>
              </Col>
            </Row>
          </Form>
          {error && <Alert variant="danger" className="mt-3">{error}</Alert>}
        </Card.Body>
      </Card>

      <Card>
        <Card.Body>
          <h5 className="d-flex align-items-center gap-2 flex-wrap">
            <span>Existing Wallets</span>
            <span className="fw-normal">{totalWallets}</span>
            <span className="text-muted fw-normal">
              ({activeWallets} Active{hiddenWallets > 0 ? ` / ${hiddenWallets} Hidden` : ''})
            </span>
          </h5>
          <ListGroup>
            {wallets.length === 0 && (
              <ListGroup.Item>No wallets added yet.</ListGroup.Item>
            )}

            {(wallets || []).map((w, idx) => {
              const isEditing = editingIndex === idx;
              const isHidden = !!w.hidden;
              return (
                <ListGroup.Item
                  key={`${w.address}-${idx}`}
                  className="d-flex justify-content-between align-items-center"
                  style={isHidden ? { opacity: 0.6 } : undefined}
                  onDragOver={onDragOver(idx)}
                  onDrop={onDrop(idx)}
                  onDragEnd={onDragEnd}
                >
                  <div className="flex-grow-1 me-3" style={{ minWidth: 0 }}>
                    <div className="text-truncate">
                      <span
                        role="button"
                        aria-label="Drag to reorder"
                        title="Drag to reorder"
                        draggable
                        onDragStart={onDragStart(idx)}
                        onDragEnd={onDragEnd}
                        className="me-2 text-muted"
                        style={{
                          cursor: isDragging ? 'grabbing' : 'grab',
                          userSelect: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          border: '1px solid rgba(255,255,255,0.15)',
                          background: 'rgba(255,255,255,0.04)'
                        }}
                      >
                        {/* standard 3-line hamburger */}
                        <span style={{ fontSize: 14, lineHeight: 1 }}>☰</span>
                      </span>
                      <strong>{w.address}</strong>
                      {' - '}
                      {!isEditing ? (
                        <>
                          <span>{w.name || 'Unnamed'}</span>
                          {isHidden && <span className="badge bg-secondary ms-2">Hidden</span>}
                        </>
                      ) : (
                        <InputGroup size="sm" className="mt-1" style={{ maxWidth: 420 }}>
                          <Form.Control
                            autoFocus
                            value={tempName}
                            onChange={(e) => setTempName(e.target.value)}
                            onKeyDown={(e) => onEditKey(e, idx)}
                            placeholder="Wallet name"
                          />
                          <Button variant="primary" onClick={() => saveEdit(idx)}>Save</Button>
                          <Button variant="secondary" onClick={cancelEdit}>Cancel</Button>
                        </InputGroup>
                      )}
                    </div>
                  </div>

                  {!isEditing && (
                    <ButtonGroup aria-label="wallet actions">
                      {/* Open (soft green) */}
                      <Button
                        as={Link}
                        to={isHidden ? '#' : `/wallet/${w.address}`}
                        variant="outline-success"
                        size="sm"
                        className="me-2"
                        style={{ ...ACTION_BTN_STYLE, ...SOFT.success }}
                        onClick={(e) => {
                          if (isHidden) { e.preventDefault(); return; }
                          e.stopPropagation();
                        }}
                        disabled={isHidden}
                      >
                        Open
                      </Button>

                      {/* Edit (soft yellow) */}
                      <Button
                        variant="outline-warning"
                        size="sm"
                        className="me-2"
                        style={{ ...ACTION_BTN_STYLE, ...SOFT.warning }}
                        onClick={(e) => { e.stopPropagation(); startEdit(idx); }}
                        disabled={isHidden}
                      >
                        Edit
                      </Button>

                      {/* Hide / Unhide (soft blue) */}
                      <Button
                        variant="outline-info"
                        size="sm"
                        className="me-2"
                        style={{ ...ACTION_BTN_STYLE, ...SOFT.info }}
                        onClick={(e) => { e.stopPropagation(); toggleHidden(idx); }}
                      >
                        {isHidden ? 'Unhide' : 'Hide'}
                      </Button>

                      {/* Delete (soft red) */}
                      <Button
                        variant="outline-danger"
                        size="sm"
                        style={{ ...ACTION_BTN_STYLE, ...SOFT.danger }}
                        onClick={(e) => { e.stopPropagation(); setConfirmIdx(idx); }}
                        disabled={isHidden}
                      >
                        Delete
                      </Button>
                    </ButtonGroup>
                  )}
                </ListGroup.Item>
              );
            })}
          </ListGroup>
        </Card.Body>
      </Card>

      {/* Delete confirmation modal */}
      <Modal
        show={confirmIdx !== null}
        onHide={() => setConfirmIdx(null)}
        centered
        backdrop="static"
        keyboard
      >
        <Modal.Header closeButton>
          <Modal.Title>Are you sure?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Deleting this wallet removes it from your local list. Keys are never stored by Kinko Wallet.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setConfirmIdx(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => deleteWallet(confirmIdx)}>
            Delete
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Logout confirmation */}
      <Modal
        show={showLogout}
        onHide={() => setShowLogout(false)}
        centered
        backdrop="static"
        keyboard
      >
        <Modal.Header closeButton>
          <Modal.Title>Log out?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Logging out will remove all your wallets from this browser. Make sure you have created and copied your Portfolio ID if you wish to view these tokens again or on another device. Are you sure you want to log out?
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setShowLogout(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              try { replaceWallets([]); } catch {}
              try { localStorage.removeItem('wallets'); } catch {}
              try { clearSyncId(); } catch {}
              try { clearEhexStakesCaches(); } catch {}
              // Clear staking summary fallbacks used by the dashboard tile
              try { localStorage.removeItem('kw:staking:hex:summary'); } catch {}
              try { localStorage.removeItem('kw:staking:ehex:summary'); } catch {}
              // Clear persisted context cache for portfolio sources entirely
              try { localStorage.removeItem('kw:portfolioValueSources:v1'); } catch {}
              // Clear Dashboard Top Tokens + sticky totals
              try { localStorage.removeItem('kw:lastTopTokens'); } catch {}
              try { localStorage.removeItem('kw:lastTopTokensAt'); } catch {}
              try { localStorage.removeItem('kw:lastTotalUsd'); } catch {}
              try { localStorage.removeItem('kw:lastChangePct24h'); } catch {}
              try { localStorage.removeItem('kw:lastChangePct24hMeta'); } catch {}
              try { localStorage.removeItem('kw:portfolio:firstSeenAt'); } catch {}
              try { localStorage.removeItem('kw:portfolio:snap:24h'); } catch {}
              try { localStorage.removeItem('kw:lastTotalUpdatedAt'); } catch {}
              // Remove all per-wallet chain totals (legacy and namespaced)
              try {
                const prefix = 'kw:chainTotalsUsd:v1';
                const toRemove = [];
                for (let i = 0; i < localStorage.length; i++) {
                  const k = localStorage.key(i);
                  if (k && (k === prefix || k.startsWith(prefix + ':'))) toRemove.push(k);
                }
                toRemove.forEach((k) => localStorage.removeItem(k));
              } catch {}
              // Nudge any listeners in the same tab to refresh
              try { window.dispatchEvent(new StorageEvent('storage', { key: 'kw:lastTopTokens', newValue: '[]' })); } catch {}
              try { window.dispatchEvent(new StorageEvent('storage', { key: 'kw:lastTotalUsd', newValue: '0' })); } catch {}
              try { removeSource && removeSource(HEX_STAKING_SOURCE); } catch {}
              try { removeSource && removeSource(EHEX_STAKING_SOURCE); } catch {}
              setShowLogout(false);
              navigate('/', { replace: true });
            }}
          >
            Logout
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Modals */}
      <WelcomeModal
        show={showWelcomeModal}
        onHide={handleWelcomeModalHide}
      />

      <PortfolioIdModal
        show={showUseId}
        onHide={() => setShowUseId(false)}
        onSuccess={() => {
          try { setWallets(readAll()); } catch {}
        }}
      />
      <CreatePortfolioIdModal show={showCreateId} onHide={() => setShowCreateId(false)} />
    </div>
  );
};

export default WalletManage;

