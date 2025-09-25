// src/components/CreatePortfolioIdModal.jsx
import { useEffect, useMemo, useState } from 'react';
import { Modal, Button, Alert, Form, Spinner } from 'react-bootstrap';
import {
  createPortfolio, savePortfolio,
  getSyncId, setSyncId, normalizePid
} from '../services/syncService.js';

function readAllWalletsFromLS() {
  try { const raw = localStorage.getItem('wallets'); const arr = raw ? JSON.parse(raw) : []; return Array.isArray(arr) ? arr : []; }
  catch { return []; }
}

export default function CreatePortfolioIdModal({ show, onHide }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [ok, setOk] = useState('');
  const [copied, setCopied] = useState(false);

  const wallets = useMemo(() => readAllWalletsFromLS(), [show]);
  const walletCount = wallets.length;

  const [pid, setPid] = useState('');
  useEffect(() => {
    if (!show) return;
    setErr(''); setInfo(''); setOk(''); setCopied(false);
    setPid(getSyncId());
  }, [show]);

  const normalizedPid = useMemo(() => normalizePid(pid), [pid]);
  const hasPid = normalizedPid.length > 0;
  const introHeadline = hasPid
    ? "You're updating your current remote portfolio."
    : 'Create a remote portfolio to sync these wallets.';
  const introSubline = hasPid
    ? 'To create a different portfolio, switch ID or logout first.'
    : 'We will generate a Portfolio ID after saving remotely.';
  const pidPlaceholder = hasPid
    ? 'Portfolio ID synced to this device.'
    : 'Click Create Remote to generate a new Portfolio ID.';


  async function doCreate() {
    setBusy(true);
    try {
      const { id: generatedId } = await createPortfolio(wallets);
      const newId = normalizePid(generatedId);
      if (!newId) throw new Error('Server did not return a valid Portfolio ID.');
      setSyncId(newId);
      setPid(newId);
      setOk('Created remote Portfolio.');
    } catch (e) { setErr(e?.message || 'Failed to create remote portfolio.'); }
    finally { setBusy(false); }
  }

  async function doUpdate() {
    setBusy(true);
    try {
      if (!hasPid) throw new Error('Missing Portfolio ID.');
      const result = await savePortfolio(normalizedPid, wallets);
      const updatedId = normalizePid(result?.id || normalizedPid);
      setSyncId(updatedId);
      setPid(updatedId);
      setOk('Updated remote Portfolio.');
    } catch (e) { setErr(e?.message || 'Failed to update remote portfolio.'); }
    finally { setBusy(false); }
  }

  const handlePrimary = async () => {
    setErr(''); setInfo(''); setOk(''); setCopied(false);
    if (walletCount === 0 && !hasPid) {
      setInfo('Add at least one wallet address to create a Portfolio ID.');
      return;
    }
    if (hasPid) await doUpdate(); else await doCreate();
  };

  const copy = async () => {
    try {
      if (!hasPid) return;
      await navigator.clipboard.writeText(normalizedPid);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { }
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton><Modal.Title>Create / Update Portfolio ID</Modal.Title></Modal.Header>
      <Modal.Body>
        <div className="mb-3" style={{ lineHeight: 1.4 }}>
          <div style={{ opacity: 0.92 }}><strong>{introHeadline}</strong></div>
          <div className="text-body-secondary">{introSubline}</div>
        </div>

        {walletCount === 0 && (
          <Alert variant="warning" className="py-2 px-3 mb-2" style={{
            background: 'color-mix(in srgb, var(--bs-warning, #ffc107) 22%, transparent)',
            borderColor: 'color-mix(in srgb, var(--bs-warning, #ffc107) 55%, transparent)',
            color: 'var(--bs-body-color)',
          }}>
            Add at least one wallet address to create a Portfolio ID.
          </Alert>
        )}

        <Alert variant="warning" className="py-2 px-3" style={{
          background: 'color-mix(in srgb, var(--bs-warning, #ffc107) 18%, transparent)',
          borderColor: 'color-mix(in srgb, var(--bs-warning, #ffc107) 55%, transparent)',
          color: 'var(--bs-body-color)',
        }}>
          <span role="img" aria-label="warning">⚠️</span>{' '}
          <strong>Keep this ID safe and private</strong> — anyone with it can view your saved addresses.
        </Alert>

        <div className="small text-body-secondary mb-2">Wallets saved: <span className="text-body">{walletCount}</span></div>

        <Form.Group className="mb-2">
          <Form.Label className="mb-1">Portfolio ID</Form.Label>
          <Form.Control type="text" value={normalizedPid} readOnly placeholder={pidPlaceholder} className="text-monospace" />
        </Form.Group>

        <div className="d-flex gap-2 mb-2">
          <Button variant="secondary" onClick={copy} disabled={!hasPid}>{copied ? 'Copied' : 'Copy'}</Button>
        </div>

        {err && <Alert variant="danger" className="py-2 px-3">{err}</Alert>}
        {info && <Alert variant="info" className="py-2 px-3">{info}</Alert>}
        {ok && <Alert variant="success" className="py-2 px-3">{ok}</Alert>}
      </Modal.Body>

      <Modal.Footer className="d-flex justify-content-between">
        <Button variant="secondary" onClick={onHide} disabled={busy}>Close</Button>
        <Button variant="primary" onClick={handlePrimary} disabled={busy || (!hasPid && walletCount === 0)}>
          {busy ? (<><Spinner as="span" animation="border" size="sm" className="me-2" />Saving...</>) : (hasPid ? 'Update Remote' : 'Create Remote')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

