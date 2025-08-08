import { useState } from 'react';
import { Modal, Button, Form } from 'react-bootstrap';
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
      const data = await loadPortfolio(id.trim());
      writeLocalWallets(data.wallets || []);
      saveSyncId(id.trim().toUpperCase());
      onHide?.();
      navigate('/dashboard/default');
      setTimeout(() => window.location.reload(), 0);
    } catch {
      setErr('Invalid or not found Portfolio ID.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal show={show} onHide={busy ? null : onHide} centered>
      <Modal.Header closeButton><Modal.Title>Use Portfolio ID</Modal.Title></Modal.Header>
      <Modal.Body>
        <Form.Control
          placeholder="Paste your Portfolio ID (e.g., GDRV7VVK)"
          value={id}
          onChange={(e) => setId(e.target.value.toUpperCase())}
          disabled={busy}
        />
        {err && <div className="text-danger mt-2">{err}</div>}
        <div className="d-flex justify-content-end mt-3">
          <Button variant="primary" onClick={submit} disabled={busy || !id}>Add / Open</Button>
        </div>
        <div className="text-muted mt-2" style={{ fontSize: 12 }}>
          This replaces the wallets on this device with those from the Portfolio ID.
        </div>
      </Modal.Body>
    </Modal>
  );
}
