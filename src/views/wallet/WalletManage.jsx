// src/views/wallet/WalletManage.jsx
import { useState, useEffect, useRef } from 'react';
import { Card, Button, Form, Row, Col, ListGroup, Alert, ButtonGroup, InputGroup, Modal } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import { useWallets } from '../../contexts/WalletContext.jsx';
import CreatePortfolioIdModal from '../../components/CreatePortfolioIdModal.jsx';
import PortfolioIdModal from '../../components/PortfolioIdModal.jsx';
import WelcomeModal from '../../components/WelcomeModal.jsx';
import { clearSyncId } from '../../services/syncService.js';
import { clearEhexStakesCaches } from '../../services/kw-ehexStakingService.js';
import { usePortfolioValue, HEX_STAKING_SOURCE, EHEX_STAKING_SOURCE } from '../../contexts/PortfolioValueContext.jsx';
import '../../styles/kw-wallet-manage.css';
import { normalizeWallets, isWalletAddress, parseWalletBackup, NETWORKS } from '../../utils/walletRecords.js';
import { saveManualToken, getManualTokens } from '../../services/manualTokenService.js';

const SOFT = {
  success: { backgroundColor: 'rgba(25,135,84,0.12)', borderColor: 'rgba(25,135,84,0.35)', color: '#1e7e55' },
  warning: { backgroundColor: 'rgba(255,193,7,0.12)', borderColor: 'rgba(255,193,7,0.45)', color: '#996c00' },
  danger: { backgroundColor: 'rgba(220,53,69,0.12)', borderColor: 'rgba(220,53,69,0.40)', color: '#9f1c28' },
  info: { backgroundColor: 'rgba(13,110,253,0.12)', borderColor: 'rgba(13,110,253,0.35)', color: '#0a58ca' } // blue
};

const ACTION_BTN_STYLE = {
  minWidth: 84, // consistent width
  padding: '3px 10px', // slimmer
  lineHeight: '1.1',
  fontWeight: 600
};

const WalletManage = () => {
  const navigate = useNavigate();
  const importRef = useRef(null);
  const [notice, setNotice] = useState('');
  const [networks, setNetworks] = useState([...NETWORKS]);
  const [manualChain, setManualChain] = useState('pulse');
  const [manualAddress, setManualAddress] = useState('');
  const [manualTokens, setManualTokens] = useState(getManualTokens);
  const { replaceWallets } = useWallets();
  // Local authoritative list for Manage page (includes hidden)
  const [wallets, setWallets] = useState([]);
  const [, setWalletsStateTick] = useState(0); // force re-render after edits if needed
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
    text.textContent = `${addr} — ${name}`;

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

  const { removeSource } = usePortfolioValue();

  // ---- Local storage helpers (Manage uses full list incl. hidden) ----
  const readAll = () => {
    try {
      const raw = localStorage.getItem('wallets');
      const arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) return [];
      return normalizeWallets(arr);
    } catch {
      return [];
    }
  };
  const writeAll = (list) => {
    try {
      const cleaned = normalizeWallets(list, { strict: true });
      localStorage.setItem('wallets', JSON.stringify(cleaned));
      replaceWallets(cleaned.filter((w) => !w.hidden));
      return true;
    } catch {
      setError('Could not save wallets. Check browser storage and try again.');
      return false;
    }
  };

  const exportWallets = () => {
    const data = JSON.stringify({ app: 'Kinko Wallet', version: 1, exportedAt: new Date().toISOString(), wallets }, null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'kinko-wallet-backup.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('Wallet backup exported. Keep it private: it contains your public addresses and labels.');
  };
  const importWallets = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 1000000) throw new Error('Wallet backup is too large (maximum 1 MB).');
      const imported = parseWalletBackup(await file.text());
      const next = normalizeWallets([...wallets, ...imported], { strict: true });
      if (writeAll(next)) {
        setWallets(next);
        setNotice('Backup imported. Existing wallets were retained and duplicates merged.');
        setError('');
      }
    } catch (e) {
      setError(e.message || 'Unable to import this backup.');
    }
    event.target.value = '';
  };
  const updateNetworks = (idx, chain, checked) => {
    const current = wallets[idx].networks || NETWORKS;
    const nextNetworks = checked ? [...new Set([...current, chain])] : current.filter((n) => n !== chain);
    if (!nextNetworks.length) {
      setError('Keep at least one network selected.');
      return;
    }
    const next = wallets.map((w, i) => (i === idx ? { ...w, networks: nextNetworks } : w));
    if (writeAll(next)) {
      setWallets(next);
      setError('');
    }
  };

  // Hydrate on mount
  useEffect(() => {
    const all = readAll();
    setWallets(all);
    // also ensure context sees visible-only
    try {
      replaceWallets(all.filter((w) => !w.hidden));
    } catch {}
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
      try {
        addressInputRef.current && addressInputRef.current.focus();
      } catch {}
    }, 0);
  };

  // Add
  const addWallet = (e) => {
    e.preventDefault();
    if (!isWalletAddress(address)) {
      setError('Enter a public EVM address: 0x followed by 40 hexadecimal characters.');
      return;
    }
    if (!networks.length) {
      setError('Select at least one network.');
      return;
    }

    const normalized = address.trim().toLowerCase();
    const exists = (wallets || []).some((w) => (w.address || '').trim().toLowerCase() === normalized);
    if (exists) {
      setError('This wallet address already exists.');
      return;
    }

    const next = [...(wallets || []), { address: address.trim(), name: name.trim().slice(0, 120), hidden: false, networks: [...networks] }];
    if (!writeAll(next)) return;
    setWallets(next);
    setAddress('');
    setName('');
    setError('');
  };

  // Delete (confirmed)
  const deleteWallet = (idx) => {
    const next = (wallets || []).filter((_, i) => i !== idx);
    if (!writeAll(next)) return;
    setWallets(next);
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
    if (!writeAll(next)) return;
    setWallets(next);
    setEditingIndex(null);
    setTempName('');
    setWalletsStateTick((x) => x + 1);
  };

  // ---- drag & drop reordering ----
  const onDragStart = (idx) => (e) => {
    try {
      e.dataTransfer.setData('text/plain', String(idx));
    } catch {}
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
    try {
      const d = Number(e.dataTransfer.getData('text/plain'));
      if (!Number.isNaN(d)) from = d;
    } catch {}
    setDragIndex(null);
    setIsDragging(false);
    destroyDragGhost();
    if (from == null || from === idx) return;
    const next = (wallets || []).slice();
    const [m] = next.splice(from, 1);
    next.splice(idx, 0, m);
    if (!writeAll(next)) return;
    setWallets(next);
  };
  const onDragEnd = () => {
    setDragIndex(null);
    setIsDragging(false);
    destroyDragGhost();
  };

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

  // Hide/Unhide
  const toggleHidden = (idx) => {
    const next = (wallets || []).map((w, i) => (i === idx ? { ...w, hidden: !w.hidden } : w));
    if (!writeAll(next)) return;
    setWallets(next);
  };

  const moveWallet = (index, direction) => {
    const next = [...wallets];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    if (writeAll(next)) {
      setWallets(next);
      setNotice('Wallet order updated.');
    }
  };
  return (
    <div className="kw-wallet-manage">
      <h1 className="mb-2">Manage Wallets</h1>
      <p className="text-muted">Watch-only tracking. Add a public address, choose networks, and view your holdings.</p>

      <details className="kw-wallet-tools mb-3">
        <summary>Backups &amp; Portfolio ID</summary>
        <div className="mb-3 d-flex justify-content-start gap-2 flex-wrap">
          <Button variant="outline-secondary" className="rounded-pill" onClick={() => setShowUseId(true)}>
            Use Portfolio ID
          </Button>
          <Button variant="outline-secondary" className="rounded-pill" onClick={() => setShowCreateId(true)}>
            Create / Update Portfolio ID
          </Button>
          <Button variant="outline-danger" className="rounded-pill" onClick={() => setShowLogout(true)} title="Log out of this device">
            Clear this device
          </Button>
        </div>

        <p className="text-muted">
          Watch-only. Your cryptocurrency stays in your existing wallets. No private keys, recovery phrases or signatures required.
        </p>
        <div className="d-flex gap-2 flex-wrap mb-3">
          <Button variant="outline-secondary" onClick={exportWallets} disabled={!wallets.length}>
            Export backup
          </Button>
          <Button variant="outline-secondary" onClick={() => importRef.current?.click()}>
            Import backup
          </Button>
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            className="d-none"
            aria-label="Import wallet backup"
            onChange={importWallets}
          />
        </div>
      </details>
      {notice && (
        <Alert variant="info" dismissible onClose={() => setNotice('')}>
          {notice}
        </Alert>
      )}
      <Card className="mb-4">
        <Card.Body>
          <Form onSubmit={addWallet}>
            <Row className="g-3">
              <Col md={5}>
                <Form.Group controlId="walletAddress">
                  <Form.Label>Wallet Address</Form.Label>
                  <Form.Control
                    className="kw-wallet-search-input"
                    ref={addressInputRef}
                    type="text"
                    placeholder="0x1234...abcd"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={address}
                    onChange={(e) => {
                      setAddress(e.target.value);
                      setError('');
                    }}
                    required
                  />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group controlId="walletName">
                  <Form.Label>Wallet Name</Form.Label>
                  <Form.Control
                    className="kw-wallet-search-input"
                    type="text"
                    maxLength={120}
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
            <fieldset className="mt-3">
              <legend className="fs-6">Networks to monitor</legend>
              <div className="d-flex flex-wrap gap-3">
                {NETWORKS.map((c) => (
                  <Form.Check
                    key={c}
                    id={`new-network-${c}`}
                    type="checkbox"
                    label={{ eth: 'Ethereum', pulse: 'PulseChain', bsc: 'BNB Smart Chain', polygon: 'Polygon', base: 'Base' }[c]}
                    checked={networks.includes(c)}
                    onChange={(e) => setNetworks(e.target.checked ? [...networks, c] : networks.filter((n) => n !== c))}
                  />
                ))}
              </div>
            </fieldset>
            <small className="text-muted">
              Public addresses are sent to selected blockchain and pricing providers to retrieve holdings.
            </small>
          </Form>
          {error && (
            <Alert variant="danger" role="alert" className="mt-3">
              {error}
            </Alert>
          )}
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
            {wallets.length === 0 && <ListGroup.Item>No wallets added yet.</ListGroup.Item>}

            {(wallets || []).map((w, idx) => {
              const isEditing = editingIndex === idx;
              const isHidden = !!w.hidden;
              return (
                <ListGroup.Item
                  key={`${w.address}-${idx}`}
                  className="kw-wallet-item d-flex justify-content-between align-items-center"
                  style={isHidden ? { opacity: 0.6 } : undefined}
                  onDragOver={onDragOver(idx)}
                  onDrop={onDrop(idx)}
                  onDragEnd={onDragEnd}
                >
                  <div className="flex-grow-1 me-3" style={{ minWidth: 0 }}>
                    <div className="kw-wallet-identity">
                      <span
                        aria-hidden="true"
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
                      <strong className="kw-full-address">{w.address}</strong>
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
                            aria-label="Edit wallet name"
                            maxLength={120}
                          />
                          <Button variant="primary" onClick={() => saveEdit(idx)}>
                            Save
                          </Button>
                          <Button variant="secondary" onClick={cancelEdit}>
                            Cancel
                          </Button>
                        </InputGroup>
                      )}
                    </div>
                    <div className="d-flex gap-2 flex-wrap mt-2" role="group" aria-label={`Networks for ${w.name || w.address}`}>
                      {NETWORKS.map((c) => (
                        <Form.Check
                          key={c}
                          id={`network-${idx}-${c}`}
                          type="checkbox"
                          label={
                            c === 'pulse'
                              ? 'PulseChain'
                              : c === 'eth'
                                ? 'Ethereum'
                                : c === 'bsc'
                                  ? 'BSC'
                                  : c === 'polygon'
                                    ? 'Polygon'
                                    : 'Base'
                          }
                          checked={(w.networks || NETWORKS).includes(c)}
                          onChange={(e) => updateNetworks(idx, c, e.target.checked)}
                        />
                      ))}
                    </div>
                    <Button
                      variant="link"
                      size="sm"
                      className="px-0"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(w.address);
                          setNotice('Wallet address copied.');
                        } catch {
                          setError('Unable to copy this address.');
                        }
                      }}
                    >
                      Copy address
                    </Button>
                    <div className="d-flex gap-2" role="group" aria-label={`Reorder ${w.name || w.address}`}>
                      <Button size="sm" variant="outline-secondary" disabled={idx === 0} onClick={() => moveWallet(idx, -1)}>
                        Move up
                      </Button>
                      <Button
                        size="sm"
                        variant="outline-secondary"
                        disabled={idx === wallets.length - 1}
                        onClick={() => moveWallet(idx, 1)}
                      >
                        Move down
                      </Button>
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
                          if (isHidden) {
                            e.preventDefault();
                            return;
                          }
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
                        onClick={(e) => {
                          e.stopPropagation();
                          startEdit(idx);
                        }}
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
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleHidden(idx);
                        }}
                      >
                        {isHidden ? 'Unhide' : 'Hide'}
                      </Button>

                      {/* Delete (soft red) */}
                      <Button
                        variant="outline-danger"
                        size="sm"
                        style={{ ...ACTION_BTN_STYLE, ...SOFT.danger }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmIdx(idx);
                        }}
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

      <Card className="mt-4">
        <Card.Body>
          <h5>Track a token contract</h5>
          <p className="text-muted">
            Use this when discovery misses a token. A contract is tracked on its selected network only. BSC currently uses manual contracts
            for token coverage.
          </p>
          <Form
            onSubmit={(e) => {
              e.preventDefault();
              try {
                saveManualToken(manualChain, manualAddress);
                setManualTokens(getManualTokens());
                setManualAddress('');
                setNotice('Token contract saved. Refresh your portfolio to read its balance.');
                setError('');
              } catch (err) {
                setError(err.message);
              }
            }}
          >
            <Row className="g-2">
              <Col sm={3}>
                <Form.Select aria-label="Token network" value={manualChain} onChange={(e) => setManualChain(e.target.value)}>
                  {NETWORKS.map((c) => (
                    <option key={c} value={c}>
                      {c === 'pulse'
                        ? 'PulseChain'
                        : c === 'eth'
                          ? 'Ethereum'
                          : c === 'bsc'
                            ? 'BNB Smart Chain'
                            : c === 'polygon'
                              ? 'Polygon'
                              : 'Base'}
                    </option>
                  ))}
                </Form.Select>
              </Col>
              <Col sm={6}>
                <Form.Control
                  aria-label="Token contract address"
                  placeholder="Token contract: 0x…"
                  value={manualAddress}
                  onChange={(e) => setManualAddress(e.target.value)}
                  required
                />
              </Col>
              <Col sm={3}>
                <Button type="submit" className="w-100">
                  Track token
                </Button>
              </Col>
            </Row>
          </Form>
          <small className="text-muted">
            {manualTokens.length} manual contract{manualTokens.length === 1 ? '' : 's'} saved in this browser.
          </small>
        </Card.Body>
      </Card>

      {/* Delete confirmation modal */}
      <Modal show={confirmIdx !== null} onHide={() => setConfirmIdx(null)} centered scrollable backdrop="static" keyboard>
        <Modal.Header closeButton>
          <Modal.Title>Are you sure?</Modal.Title>
        </Modal.Header>
        <Modal.Body>Deleting this wallet removes it from your local list. Keys are never stored by Kinko Wallet.</Modal.Body>
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
      <Modal show={showLogout} onHide={() => setShowLogout(false)} centered scrollable backdrop="static" keyboard>
        <Modal.Header closeButton>
          <Modal.Title>Clear wallets from this device?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Logging out will remove all your wallets from this browser. Make sure you have created and copied your Portfolio ID if you wish to
          view these tokens again or on another device. Are you sure you want to log out?
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setShowLogout(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              try {
                replaceWallets([]);
              } catch {}
              try {
                localStorage.removeItem('wallets');
              } catch {}
              try {
                clearSyncId();
              } catch {}
              try {
                clearEhexStakesCaches();
              } catch {}
              // Clear staking summary fallbacks used by the dashboard tile
              try {
                localStorage.removeItem('kw:staking:hex:summary');
              } catch {}
              try {
                localStorage.removeItem('kw:staking:ehex:summary');
              } catch {}
              // Clear persisted context cache for portfolio sources entirely
              try {
                localStorage.removeItem('kw:portfolioValueSources:v1');
              } catch {}
              // Clear Dashboard Top Tokens + sticky totals
              try {
                localStorage.removeItem('kw:lastTopTokens');
              } catch {}
              try {
                localStorage.removeItem('kw:lastTopTokensAt');
              } catch {}
              try {
                localStorage.removeItem('kw:lastTotalUsd');
              } catch {}
              try {
                localStorage.removeItem('kw:lastChangePct24h');
              } catch {}
              try {
                localStorage.removeItem('kw:lastChangePct24hMeta');
              } catch {}
              try {
                localStorage.removeItem('kw:portfolio:firstSeenAt');
              } catch {}
              try {
                localStorage.removeItem('kw:portfolio:snap:24h');
              } catch {}
              try {
                localStorage.removeItem('kw:lastTotalUpdatedAt');
              } catch {}
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
              try {
                window.dispatchEvent(new StorageEvent('storage', { key: 'kw:lastTopTokens', newValue: '[]' }));
              } catch {}
              try {
                window.dispatchEvent(new StorageEvent('storage', { key: 'kw:lastTotalUsd', newValue: '0' }));
              } catch {}
              try {
                removeSource && removeSource(HEX_STAKING_SOURCE);
              } catch {}
              try {
                removeSource && removeSource(EHEX_STAKING_SOURCE);
              } catch {}
              setShowLogout(false);
              navigate('/', { replace: true });
            }}
          >
            Clear this device
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Modals */}
      <WelcomeModal show={showWelcomeModal} onHide={handleWelcomeModalHide} />

      <PortfolioIdModal
        show={showUseId}
        onHide={() => setShowUseId(false)}
        onSuccess={() => {
          try {
            setWallets(readAll());
          } catch {}
        }}
      />
      <CreatePortfolioIdModal show={showCreateId} onHide={() => setShowCreateId(false)} />
    </div>
  );
};

export default WalletManage;
