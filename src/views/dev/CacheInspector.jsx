// src/views/dev/CacheInspector.jsx
import { useEffect, useState } from 'react';
import { Card } from 'react-bootstrap';
import { idbKeys } from '../../data/idb';
import DataClient from '../../data/dataClient';

export default function CacheInspector() {
  const [keys, setKeys] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [value, setValue] = useState(null);

  const refresh = async () => { setKeys(await idbKeys()); };
  useEffect(() => { refresh(); }, []);

  const open = async (k) => { setExpanded(k); const rec = await DataClient.read(k); setValue(rec); };

  return (
    <div className="container my-4">
      <h4>Cache Inspector</h4>
      <p className="text-muted">Debug: show IDB keys, lastUpdated, in-flight jobs.</p>
      <button type="button" className="btn btn-sm btn-outline-secondary mb-3" onClick={refresh}>Refresh</button>
      <div className="row">
        <div className="col-4">
          <Card><Card.Body>
            <ul className="list-unstyled">
              {keys.map((k) => (
                <li key={k}>
                  <button type="button" className="btn btn-link p-0" onClick={() => open(k)}>{k}</button>
                </li>
              ))}
            </ul>
          </Card.Body></Card>
        </div>
        <div className="col-8">
          <Card><Card.Body>
            <pre style={{ maxHeight: 520, overflow: 'auto' }}>{JSON.stringify(value, null, 2)}</pre>
          </Card.Body></Card>
        </div>
      </div>
    </div>
  );
}

