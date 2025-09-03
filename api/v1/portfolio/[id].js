// api/v1/portfolio/[id].js
export default async function handler(req, res) {
  const URL   = process.env.KV_REST_API_URL;
  const TOKEN = process.env.KV_REST_API_TOKEN;
  if (!URL || !TOKEN) return res.status(500).json({ error: 'Missing Upstash env vars' });

  const rawId = (req.query.id || '').toString().trim().toUpperCase();
  if (!rawId) return res.status(400).json({ error: 'missing id' });
  const key = `kinko:portfolio:${rawId}`;

  try {
    if (req.method === 'GET') {
      const r = await fetch(`${URL}/get/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
      if (r.status === 404) return res.status(404).json({ error: 'not found' });
      const j = await r.json();
      const obj = j?.result ? JSON.parse(j.result) : null;
      if (!obj) return res.status(404).json({ error: 'not found' });
      return res.status(200).json({
        wallets: Array.isArray(obj.wallets) ? obj.wallets : [],
        updatedAt: obj.updatedAt || 0,
        checksum: obj.checksum || null
      });
    }

    if (req.method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const wallets = Array.isArray(body.wallets) ? body.wallets : [];
      const record = { wallets, updatedAt: Date.now(), checksum: null };
      const payload = encodeURIComponent(JSON.stringify(record));
      const put = await fetch(`${URL}/set/${encodeURIComponent(key)}/${payload}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}` }
      });
      const ok = (await put.json())?.result === 'OK';
      if (!ok) return res.status(500).json({ ok: false, error: 'kv set failed' });
      return res.status(200).json({ ok: true, updatedAt: record.updatedAt });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    console.error('[/api/v1/portfolio/:id]', e);
    return res.status(500).json({ error: e?.message || 'server_error' });
  }
}
