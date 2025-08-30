import { useEffect, useState } from 'react';
import { Modal, Button, Alert, Form, Spinner } from 'react-bootstrap';
import { createPortfolio, generatePortfolioId } from '../services/syncService.js';
import { useWallets } from '../contexts/WalletContext.jsx';

export default function CreatePortfolioIdModal({ show, onHide }) {
  const { wallets } = useWallets();
  const [id, setId] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (show) {
      setMsg('');
      setErr('');
    }
  }, [show]);

  const onCreateOrUpdate = async () => {
    try {
      setBusy(true);
      setMsg('');
      setErr('');
      const useId = id || generatePortfolioId();
      await createPortfolio(useId, wallets);
      setId(useId);
      setMsg(id ? 'Updated remote Portfolio.' : 'Created remote Portfolio.');
    } catch (e) {
      setErr(e?.message || 'Remote save failed.');
    } finally {
      setBusy(false);
    }
  };

  const copy = () => id && navigator.clipboard?.writeText(id).catch(() => {});

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>Create / Update Portfolio ID</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="mb-2">This writes your current wallets straight to the remote store.</p>
        <Form.Group className="mb-3">
          <Form.Label>Portfolio ID</Form.Label>
          <Form.Control
            value={id}
            onChange={(e) => setId(e.target.value.toUpperCase())}
            placeholder="Leave blank to generate"
            disabled={busy}
          />
          <div className="mt-2 d-flex gap-2">
            <Button variant="secondary" onClick={copy} disabled={!id || busy}>
              Copy
            </Button>
          </div>
        </Form.Group>
        {msg && (
          <Alert variant="success" className="mb-0">
            {msg}
          </Alert>
        )}
        {err && (
          <Alert variant="danger" className="mb-0">
            {err}
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide} disabled={busy}>
          Close
        </Button>
        <Button variant="primary" onClick={onCreateOrUpdate} disabled={busy}>
          {busy ? (
            <>
              <Spinner size="sm" className="me-2" />
              Working…
            </>
          ) : id ? (
            'Update Remote'
          ) : (
            'Create Remote'
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
