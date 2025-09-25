// src/components/PortfolioIdModal.jsx
import { useState, useCallback } from 'react';
import { Modal, Button, Form, Alert, Spinner } from 'react-bootstrap';
import { loadPortfolio, setSyncId } from '../services/syncService.js';
import { useWallets } from '../contexts/WalletContext.jsx';

export default function PortfolioIdModal({ show, onHide, onSuccess }) {
  const { replaceWallets } = useWallets();
  const [id, setId] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const normalise = useCallback((v) => (v || '').trim().toUpperCase(), []);

  const submit = async () => {
    const cleanId = normalise(id);
    if (!cleanId) return;

    try {
      setBusy(true);
      setErr('');

      // Load from remote store
      const { wallets } = await loadPortfolio(cleanId);

      // Persist the PID so it "sticks" across the app (Create/Update modal will read it)
      setSyncId(cleanId);

      // Persist the full list (including hidden) for Manage Wallets page
      try {
        const all = Array.isArray(wallets) ? wallets : [];
        const normalized = all.map((w) => ({
          address: String(w?.address || '').trim(),
          name: String(w?.name || '').trim(),
          hidden: !!w?.hidden,
        }));
        localStorage.setItem('wallets', JSON.stringify(normalized));

        // Update context with visible-only list for the rest of the app
        const visible = normalized
          .filter((w) => !w.hidden)
          .map(({ address, name }) => ({ address, name }));
        replaceWallets(visible);
      } catch {
        // Fallback: still try to update context even if LS write fails
        try {
          const visible = (Array.isArray(wallets) ? wallets : [])
            .filter((w) => !w?.hidden)
            .map(({ address, name }) => ({ address, name }));
          replaceWallets(visible);
        } catch { }
      }

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
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>Use Portfolio ID</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <Form.Group className="mb-3">
          <Form.Label>Enter Portfolio ID</Form.Label>
          <Form.Control
            value={id}
            onChange={onChange}
            onKeyDown={onKeyDown}
            placeholder="e.g. KJ8NR4MF"
            disabled={busy}
          />
        </Form.Group>

        {err && <Alert variant="danger" className="mb-0">{err}</Alert>}

        <div className="text-muted small mt-2">
          Loads wallets from the remote store and replaces current session.
        </div>
      </Modal.Body>

      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide} disabled={busy}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} disabled={busy || !id.trim()}>
          {busy ? (
            <>
              <Spinner size="sm" className="me-2" />Loading…
            </>
          ) : (
            'Load'
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
