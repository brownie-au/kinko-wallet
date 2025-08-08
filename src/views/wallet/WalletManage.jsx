import React, { useState, useEffect } from 'react';
import { Card, Button, Form, Row, Col, ListGroup, Alert } from 'react-bootstrap';
import { loadWallets, saveWallets } from '../../utils/walletStorage';
import CreatePortfolioIdModal from '../../components/CreatePortfolioIdModal.jsx';

const WalletManage = () => {
  const [wallets, setWallets] = useState([]);
  const [address, setAddress] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const [showCreateId, setShowCreateId] = useState(false);

  useEffect(() => {
    setWallets(loadWallets());
  }, []);

  useEffect(() => {
    saveWallets(wallets);
  }, [wallets]);

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

  const deleteWallet = (idx) => {
    const next = wallets.filter((_, i) => i !== idx);
    setWallets(next);
    window.location.reload();
  };

  return (
    <div>
      <h2 className="mb-4">Manage Wallets</h2>

      {/* Top action row */}
      <div className="mb-3 d-flex gap-2">
        <Button
          variant="success"
          onClick={() => setShowCreateId(true)}
          style={{ backgroundColor: '#20C997', borderColor: '#20C997' }}
        >
          Create Portfolio ID
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
            {wallets.map((w, idx) => (
              <ListGroup.Item
                key={w.address}
                className="d-flex justify-content-between align-items-center"
              >
                <div>
                  <strong>{w.address}</strong> – {w.name || 'Unnamed'}
                </div>
                <Button variant="danger" size="sm" onClick={() => deleteWallet(idx)}>
                  Delete
                </Button>
              </ListGroup.Item>
            ))}
          </ListGroup>
        </Card.Body>
      </Card>

      {/* Create/Update ID Modal */}
      <CreatePortfolioIdModal show={showCreateId} onHide={() => setShowCreateId(false)} />
    </div>
  );
};

export default WalletManage;
