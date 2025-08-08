import { useEffect, useState } from 'react';
import { Modal, Button, Form } from 'react-bootstrap';
import { getSyncId, savePortfolio, clearSyncId } from '../services/syncService.js';

export default function SyncModal({ show, onHide }) {
  const [id, setId] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (show) { setId(getSyncId()); setStatus(''); } }, [show]);

  const onCopy = () => navigator.clipboard?.writeText(id).catch(() => {});
  const onSave = async () => {
    try { setBusy(true); setStatus(''); await savePortfolio(id); setStatus('Saved.'); }
    catch { setStatus('Save failed.'); }
    finally { setBusy(false); }
  };
  const onLogout = () => { clearSyncId(); setId(''); setStatus('This device is logged out.'); };

  return (
    <Modal show={show} onHide={busy ? null : onHide} centered>
      <Modal.Header closeButton><Modal.Title>Synchronize Portfolio</Modal.Title></Modal.Header>
      <Modal.Body>
        <div className="mb-2">Your Portfolio ID</div>
        <div className="d-flex gap-2">
          <Form.Control value={id} readOnly placeholder="No Portfolio ID on this device" />
          <Button variant="outline-secondary" onClick={onCopy} disabled={!id}>Copy</Button>
        </div>

        <div className="d-flex gap-2 mt-3">
          <Button variant="primary" onClick={onSave} disabled={!id || busy}>Save Wallets</Button>
          <Button variant="outline-danger" onClick={onLogout} disabled={!id || busy}>Logout this Device</Button>
        </div>

        {status && <div className="mt-3">{status}</div>}
        <div className="text-muted mt-2" style={{ fontSize: 12 }}>
          Anyone with this ID can view & edit this portfolio. Keep it private.
        </div>
      </Modal.Body>
    </Modal>
  );
}
