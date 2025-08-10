import { useState } from 'react';
import { Modal, Button, Form, Alert, Spinner } from 'react-bootstrap';
import { loadPortfolio } from '../services/syncService.js';
import { useWallets } from '../contexts/WalletContext.jsx';

export default function PortfolioIdModal({ show, onHide }) {
  const { replaceWallets } = useWallets();
  const [id, setId] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    try {
      setBusy(true); setErr('');
      const { wallets } = await loadPortfolio(id.trim().toUpperCase());
      replaceWallets(wallets);
      onHide?.();
    } catch (e) {
      setErr(e?.message || 'Remote load failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton><Modal.Title>Use Portfolio ID</Modal.Title></Modal.Header>
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
        <div className="text-muted small mt-2">Loads wallets from the remote store and replaces current session.</div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide} disabled={busy}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={busy || !id.trim()}>
          {busy ? (<><Spinner size="sm" className="me-2" />Loading…</>) : 'Load'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
