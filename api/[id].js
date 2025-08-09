// GET  /api/portfolios/:id  -> { id, wallets }
// PUT  /api/portfolios/:id  -> { id, wallets }  (replace with payload)
import { put, head, list } from '@vercel/blob';

export default async function handler(req, res) {
  const { id = '' } = req.query || {};
  if (!id) return res.status(400).json({ error: 'missing id' });

  const key = `portfolios/${String(id).toUpperCase()}.json`;

  try {
    if (req.method === 'GET') {
      // Find exact key ignoring case (simple scan of the folder)
      const folder = await list({ prefix: 'portfolios/' });
      const item = folder.blobs.find(b => b.pathname.toUpperCase() === key.toUpperCase());
      if (!item) return res.status(404).json({ error: 'not found' });

      const resp = await fetch(item.url);
      const json = await resp.json();
      return res.status(200).json({ id: json.id || id, wallets: json.wallets || [] });
    }

    if (req.method === 'PUT') {
      const { wallets = [] } = req.body || {};
      await put(key, JSON.stringify({ id, wallets, updatedAt: Date.now() }), {
        access: 'public',
        contentType: 'application/json'
      });
      return res.status(200).json({ id, wallets });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'op failed' });
  }
}
