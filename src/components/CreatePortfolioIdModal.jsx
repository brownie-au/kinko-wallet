// src/components/CreatePortfolioIdModal.jsx
import { useEffect, useState } from 'react';
import { Modal, Button, Alert, Form, Spinner } from 'react-bootstrap';
import { createPortfolio, savePortfolio, getSyncId } from '../services/syncService.js';

export default function CreatePortfolioIdModal({ show, onHide }) {
  const [id, setId] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (show) {
      setId(getSyncId() || '');
      setMsg('');
      setErr('');
    }
  }, [show]);

  const onCreateOrUpdate = async () => {
    try {
      setBusy(true); setMsg(''); setErr('');
      if (id) {
        await savePortfolio(id);
        setMsg('Updated your existing Portfolio ID with current wallets.');
      } else {
        const res = await createPortfolio();
        setId(res.id);
        setMsg('Created a new Portfolio ID from your current wallets.');
      }
    } catch (e) {
      setErr(e?.message || 'Sorry, something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const copy = () => navigator.clipboard?.writeText(id).catch(() => {});

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>Create / Update Portfolio ID</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <p className="mb-2">
          {id
            ? 'This device already has a Portfolio ID. You can copy it or update it with your current wallets.'
            : 'Create a new Portfolio ID for the wallets currently on this device.'}
        </p>

        <Form.Group className="mb-3">
          <Form.Label>Portfolio ID</Form.Label>
          <Form.Control value={id} readOnly placeholder="(no ID yet)" />
          <div className="mt-2 d-flex gap-2">
            <Button variant="secondary" onClick={copy} disabled={!id || busy}>Copy</Button>
          </div>
        </Form.Group>

        {msg && <Alert variant="success" className="mb-0">{msg}</Alert>}
        {err && <Alert variant="danger" className="mb-0">{err}</Alert>}
      </Modal.Body>

      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide} disabled={busy}>Close</Button>
        <Button variant="primary" onClick={onCreateOrUpdate} disabled={busy}>
          {busy ? (<><Spinner size="sm" className="me-2" />Working…</>) : (id ? 'Update ID' : 'Create ID')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
