// GET /api/portfolios/:id -> { id, wallets }
// PUT /api/portfolios/:id -> { id, wallets }
const { list, put } = require('@vercel/blob');

module.exports = async (req, res) => {
  const raw = (req.query && req.query.id ? String(req.query.id) : '').toUpperCase();
  if (!raw) return res.status(400).json({ error: 'missing id' });

  const key = `portfolios/${raw}.json`;

  try {
    if (req.method === 'GET') {
      const folder = await list({ prefix: 'portfolios/' });
      const item = folder.blobs.find(b => b.pathname.toUpperCase() === key.toUpperCase());
      if (!item) return res.status(404).json({ error: 'not found' });

      const r = await fetch(item.url);
      const json = await r.json();
      return res.status(200).json({ id: json.id || raw, wallets: Array.isArray(json.wallets) ? json.wallets : [] });
    }

    if (req.method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const wallets = Array.isArray(body.wallets) ? body.wallets : [];
      await put(key, JSON.stringify({ id: raw, wallets, updatedAt: Date.now() }), {
        access: 'public',
        contentType: 'application/json'
      });
      return res.status(200).json({ id: raw, wallets });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('[portfolios/:id] error', e);
    return res.status(500).json({ error: e.message || 'server_error' });
  }
};
