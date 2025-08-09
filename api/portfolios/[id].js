// GET /api/portfolios/:id -> { id, wallets }
// PUT /api/portfolios/:id -> { id, wallets }
module.exports = async (req, res) => {
  const URL = process.env.KV_REST_API_URL;
  const TOKEN = process.env.KV_REST_API_TOKEN;
  if (!URL || !TOKEN) return res.status(500).json({ error: 'Missing KV env vars' });

  const raw = (req.query && req.query.id ? String(req.query.id) : '').toUpperCase();
  if (!raw) return res.status(400).json({ error: 'missing id' });

  const key = `portfolios:${raw}`;

  try {
    if (req.method === 'GET') {
      const r = await fetch(`${URL}/get/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${TOKEN}` }
      });
      if (r.status === 404) return res.status(404).json({ error: 'not found' });
      if (!r.ok) throw new Error(`KV get ${r.status}`);
      const j = await r.json();              // { result: "<json string>" }
      const data = j && j.result ? JSON.parse(j.result) : null;
      if (!data) return res.status(404).json({ error: 'not found' });
      return res.status(200).json({ id: data.id || raw, wallets: Array.isArray(data.wallets) ? data.wallets : [] });
    }

    if (req.method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const wallets = Array.isArray(body.wallets) ? body.wallets : [];
      const record = { id: raw, wallets, updatedAt: Date.now() };
      const r = await fetch(`${URL}/set/${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: JSON.stringify(record) })
      });
      if (!r.ok) throw new Error(`KV set ${r.status}`);
      return res.status(200).json({ id: raw, wallets });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('[portfolios/:id] error', e);
    return res.status(500).json({ error: e.message || 'server_error' });
  }
};
