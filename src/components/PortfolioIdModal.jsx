// src/components/PortfolioIdModal.jsx
import { useState, useCallback, useEffect } from 'react';
import { Modal, Button, Form, Alert, Spinner } from 'react-bootstrap';
import { loadPortfolio, setSyncId, isValidPid } from '../services/syncService.js';
import { useWallets } from '../contexts/WalletContext.jsx';

export default function PortfolioIdModal({ show, onHide, onSuccess }) {
  const { replaceWallets } = useWallets();
  const [id, setId] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (show) {
      setErr('');
      setId('');
    }
  }, [show]);

  const normalise = useCallback((v) => (v || '').trim().toUpperCase(), []);

  const submit = async () => {
    const cleanId = normalise(id);
    if (!cleanId) return;

    try {
      setBusy(true);
      setErr('');

      // Load from remote store
      const { wallets } = await loadPortfolio(cleanId);

      // Persist the complete validated records before changing the active portfolio.
      // A storage failure must leave the current context and ID untouched.
      localStorage.setItem('wallets', JSON.stringify(wallets));
      replaceWallets(wallets);
      setSyncId(cleanId);

      onHide?.();
      onSuccess?.();
    } catch (e) {
      setErr(e?.message || 'Remote load failed.');
    } finally {
      setBusy(false);
    }
  };

  const onChange = (e) => setId(normalise(e.target.value));
  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !busy && id.trim()) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered scrollable>
      <Modal.Header closeButton>
        <Modal.Title>Use Portfolio ID</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <Form.Group controlId="load-portfolio-id" className="mb-3">
          <Form.Label>Enter Portfolio ID</Form.Label>
          <Form.Control
            value={id}
            onChange={onChange}
            onKeyDown={onKeyDown}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={8}
            placeholder="e.g. KJ8NR4MF"
            disabled={busy}
          />
        </Form.Group>

        {err && (
          <Alert variant="danger" className="mb-0">
            {err}
          </Alert>
        )}

        <div className="text-muted small mt-2">
          Replaces the wallets saved on this device, including names, hidden status and selected networks. Export a backup first if you want
          to keep the current list.
        </div>
      </Modal.Body>

      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide} disabled={busy}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} disabled={busy || !isValidPid(id)}>
          {busy ? (
            <>
              <Spinner size="sm" className="me-2" />
              Loading…
            </>
          ) : (
            'Load'
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
