// src/components/CreatePortfolioIdModal.jsx
import { useEffect, useState } from 'react';
import { Modal, Button, Alert, Form } from 'react-bootstrap';
import {
  createPortfolio,
  savePortfolio,
  getSyncId
} from '../services/syncService.js';

export default function CreatePortfolioIdModal({ show, onHide }) {
  const [id, setId] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (show) {
      setId(getSyncId() || '');  // if device already has an ID, show it
      setMsg('');
    }
  }, [show]);

  const onCreateOrUpdate = async () => {
    try {
      setBusy(true);
      setMsg('');
      if (id) {
        // Update existing ID with current wallets
        await savePortfolio(id);
        setMsg('Updated your existing Portfolio ID with current wallets.');
      } else {
        // Create a new ID from current wallets
        const res = await createPortfolio();
        setMsg('Created a new Portfolio ID.');
        setId(res.id);
      }
    } catch {
      setMsg('Sorry, something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const copy = () => navigator.clipboard?.writeText(id).catch(() => {});

  return (
    <Modal show={show} onHide={busy ? null : onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>Create Portfolio ID</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="mb-2">
          {id
            ? 'You already have a Portfolio ID on this device. You can copy it or update it with your current wallets.'
            : 'Create a new Portfolio ID for the wallets on this device.'}
        </p>

        <div className="d-flex gap-2 align-items-center">
          <Form.Control
            value={id}
            readOnly
            placeholder="No ID yet — click Create to generate one"
          />
          <Button variant="outline-secondary" onClick={copy} disabled={!id}>
            Copy
          </Button>
        </div>

        {msg && <Alert variant="info" className="mt-3 mb-0">{msg}</Alert>}

        <div className="d-flex justify-content-between align-items-center mt-3">
          <small className="text-warning">
            Anyone with this ID can view & edit this portfolio. Keep it private.
          </small>
          <Button onClick={onCreateOrUpdate} disabled={busy}>
            {id ? 'Update ID' : 'Create ID'}
          </Button>
        </div>
      </Modal.Body>
    </Modal>
  );
}
