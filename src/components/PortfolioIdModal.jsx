// src/components/PortfolioIdModal.jsx
import { useState } from 'react';
import { Modal, Button, Form, Alert, Spinner } from 'react-bootstrap';
import { loadPortfolio, writeLocalWallets, saveSyncId } from '../services/syncService.js';
import { useNavigate } from 'react-router-dom';

export default function PortfolioIdModal({ show, onHide }) {
  const [id, setId] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async () => {
    try {
      setBusy(true); setErr('');
      const data = await loadPortfolio(id.trim().toUpperCase());
      writeLocalWallets(data.wallets || []);
      saveSyncId(id.trim().toUpperCase());
      onHide?.();
      // Navigate & force a reload so contexts pick up new wallets
      navigate('/dashboard/default');
      setTimeout(() => window.location.reload(), 0);
    } catch (e) {
      setErr(e?.message || 'Invalid or not found Portfolio ID.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>Use Portfolio ID</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <Form.Group className="mb-3">
          <Form.Label>Enter Portfolio ID</Form.Label>
          <Form.Control
            value={id}
            onChange={(e) => setId(e.target.value.toUpperCase())}
            placeholder="e.g. KJ8NR4MF"
            disabled={busy}
          />
        </Form.Group>
        {err && <Alert variant="danger" className="mb-0">{err}</Alert>}
        <div className="text-muted small mt-2">
          This replaces the wallets on this device with those from the Portfolio ID.
        </div>
      </Modal.Body>

      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide} disabled={busy}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={busy || !id.trim()}>
          {busy ? (<><Spinner size="sm" className="me-2" />Adding…</>) : 'Add / Open'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
