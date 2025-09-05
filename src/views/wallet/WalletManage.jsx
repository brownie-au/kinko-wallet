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
import { clearSyncId } from '../../services/syncService.js';
import { clearEhexStakesCaches } from '../../services/kw-ehexStakingService.js';
import { usePortfolioValue, HEX_STAKING_SOURCE, EHEX_STAKING_SOURCE } from '../../contexts/PortfolioValueContext.jsx';

const SOFT = {
  success: { backgroundColor: 'rgba(25,135,84,0.12)', borderColor: 'rgba(25,135,84,0.35)', color: '#1e7e55' },
  warning: { backgroundColor: 'rgba(255,193,7,0.12)', borderColor: 'rgba(255,193,7,0.45)', color: '#996c00' },
  danger: { backgroundColor: 'rgba(220,53,69,0.12)', borderColor: 'rgba(220,53,69,0.40)', color: '#9f1c28' }
};

const ACTION_BTN_STYLE = {
  minWidth: 84,           // consistent width
  padding: '3px 10px',    // slimmer
  lineHeight: '1.1',
  fontWeight: 600
};

const WalletManage = () => {
  const { wallets, addWallet: addWalletCtx, deleteWallet: deleteWalletCtx, replaceWallets } = useWallets();
  const [_, setWalletsStateTick] = useState(0); // force re-render after edits if needed
  const [dragIndex, setDragIndex] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragGhostRef = useRef(null);

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

  const navigate = useNavigate();
  const { removeSource } = usePortfolioValue();

  // Wallets come from context, which persists to localStorage for durability.

  // Add
  const addWallet = (e) => {
    e.preventDefault();
    if (!address) return;

    const normalized = address.trim().toLowerCase();
    const exists = wallets.some((w) => (w.address || '').trim().toLowerCase() === normalized);
    if (exists) {
      setError('This wallet address already exists.');
      return;
    }

    addWalletCtx(address.trim(), name);
    setAddress('');
    setName('');
    setError('');
  };

  // Delete (confirmed)
  const deleteWallet = (idx) => {
    const toDelete = wallets[idx]?.address;
    if (toDelete) deleteWalletCtx(toDelete);
    setConfirmIdx(null);
  };

  // Edit
  const startEdit = (idx) => {
    setEditingIndex(idx);
    setTempName(wallets[idx]?.name || '');
  };

  const saveEdit = (idx) => {
    const trimmed = (tempName || '').trim();
    const next = wallets.map((w, i) => (i === idx ? { ...w, name: trimmed } : w));
    replaceWallets(next);
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
    const next = wallets.slice();
    const [m] = next.splice(from, 1);
    next.splice(idx, 0, m);
    replaceWallets(next);
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
          <h5>Existing Wallets</h5>
          <ListGroup>
            {wallets.length === 0 && (
              <ListGroup.Item>No wallets added yet.</ListGroup.Item>
            )}

            {wallets.map((w, idx) => {
              const isEditing = editingIndex === idx;
              return (
                <ListGroup.Item
                  key={`${w.address}-${idx}`}
                  className="d-flex justify-content-between align-items-center"
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
                        <span>{w.name || 'Unnamed'}</span>
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
                        to={`/wallet/${w.address}`}
                        variant="outline-success"
                        size="sm"
                        className="me-2"
                        style={{ ...ACTION_BTN_STYLE, ...SOFT.success }}
                        onClick={(e) => e.stopPropagation()}
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
                      >
                        Edit
                      </Button>

                      {/* Delete (soft red) */}
                      <Button
                        variant="outline-danger"
                        size="sm"
                        style={{ ...ACTION_BTN_STYLE, ...SOFT.danger }}
                        onClick={(e) => { e.stopPropagation(); setConfirmIdx(idx); }}
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
          Logging out will remove all your wallets from this browser. Make sure you have created and copied your Portfolio ID if you want to view these tokens again or on another device. Are you sure you want to log out?
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
      <PortfolioIdModal show={showUseId} onHide={() => setShowUseId(false)} />
      <CreatePortfolioIdModal show={showCreateId} onHide={() => setShowCreateId(false)} />
    </div>
  );
};

export default WalletManage;
