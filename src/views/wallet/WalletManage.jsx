// src/views/wallet/WalletManage.jsx
import React, { useState, useEffect } from 'react';
import { Card, Button, Form, Row, Col, ListGroup, Alert, ButtonGroup, InputGroup, Modal } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import { loadWallets, saveWallets } from '../../utils/walletStorage';
import CreatePortfolioIdModal from '../../components/CreatePortfolioIdModal.jsx';
import PortfolioIdModal from '../../components/PortfolioIdModal.jsx';

const SOFT = {
  success: { backgroundColor: 'rgba(25,135,84,0.12)', borderColor: 'rgba(25,135,84,0.35)', color: '#1e7e55' },
  warning: { backgroundColor: 'rgba(255,193,7,0.12)', borderColor: 'rgba(255,193,7,0.45)', color: '#996c00' },
  danger: { backgroundColor: 'rgba(220,53,69,0.12)', borderColor: 'rgba(220,53,69,0.40)', color: '#9f1c28' }
};

const ACTION_BTN_STYLE = {
  minWidth: 84, // consistent width
  padding: '3px 10px', // slimmer
  lineHeight: '1.1',
  fontWeight: 600
};

const WalletManage = () => {
  const [wallets, setWallets] = useState([]);
  const [address, setAddress] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const [editingIndex, setEditingIndex] = useState(null);
  const [tempName, setTempName] = useState('');

  const [confirmIdx, setConfirmIdx] = useState(null); // delete confirmation

  const [showCreateId, setShowCreateId] = useState(false);
  const [showUseId, setShowUseId] = useState(false);

  const navigate = useNavigate();

  // Load/save
  useEffect(() => {
    setWallets(loadWallets());
  }, []);
  useEffect(() => {
    saveWallets(wallets);
  }, [wallets]);

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

    setWallets([...wallets, { address: address.trim(), name }]);
    setAddress('');
    setName('');
    setError('');
    window.location.reload(); // MVP refresh for sidebar
  };

  // Delete (confirmed)
  const deleteWallet = (idx) => {
    const next = wallets.filter((_, i) => i !== idx);
    setWallets(next);
    setConfirmIdx(null);
    window.location.reload(); // keep sidebar in sync for now
  };

  // Edit
  const startEdit = (idx) => {
    setEditingIndex(idx);
    setTempName(wallets[idx]?.name || '');
  };

  const saveEdit = (idx) => {
    const trimmed = (tempName || '').trim();
    const next = wallets.map((w, i) => (i === idx ? { ...w, name: trimmed } : w));
    setWallets(next);
    setEditingIndex(null);
    setTempName('');
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

  // Open
  const openWallet = (addr) => {
    if (!addr) return;
    navigate(`/wallet/${addr}`);
  };

  return (
    <div>
      <h2 className="mb-3">Manage Wallets</h2>

      <div className="mb-3 d-flex justify-content-start gap-2 flex-wrap">
        <Button variant="outline-secondary" className="rounded-pill" onClick={() => setShowUseId(true)}>
          Use Portfolio ID
        </Button>
        <Button variant="outline-secondary" className="rounded-pill" onClick={() => setShowCreateId(true)}>
          Create / Update Portfolio ID
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
                  <Form.Control type="text" placeholder="My Wallet" value={name} onChange={(e) => setName(e.target.value)} />
                </Form.Group>
              </Col>
              <Col md={3} className="d-flex align-items-end">
                <Button variant="primary" type="submit" className="w-100">
                  Add Wallet
                </Button>
              </Col>
            </Row>
          </Form>
          {error && (
            <Alert variant="danger" className="mt-3">
              {error}
            </Alert>
          )}
        </Card.Body>
      </Card>

      <Card>
        <Card.Body>
          <h5>Existing Wallets</h5>
          <ListGroup>
            {wallets.length === 0 && <ListGroup.Item>No wallets added yet.</ListGroup.Item>}

            {wallets.map((w, idx) => {
              const isEditing = editingIndex === idx;
              return (
                <ListGroup.Item key={`${w.address}-${idx}`} className="d-flex justify-content-between align-items-center">
                  <div className="flex-grow-1 me-3" style={{ minWidth: 0 }}>
                    <div className="text-truncate">
                      <strong>{w.address}</strong>
                      {' – '}
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
                          <Button variant="primary" onClick={() => saveEdit(idx)}>
                            Save
                          </Button>
                          <Button variant="secondary" onClick={cancelEdit}>
                            Cancel
                          </Button>
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
                        onClick={(e) => {
                          e.stopPropagation();
                          startEdit(idx);
                        }}
                      >
                        Edit
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
      <Modal show={confirmIdx !== null} onHide={() => setConfirmIdx(null)} centered backdrop="static" keyboard>
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

      {/* Modals */}
      <PortfolioIdModal show={showUseId} onHide={() => setShowUseId(false)} />
      <CreatePortfolioIdModal show={showCreateId} onHide={() => setShowCreateId(false)} />
    </div>
  );
};

export default WalletManage;
