// POST /api/portfolios -> { id, wallets }
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const URL = process.env.KV_REST_API_URL;
  const TOKEN = process.env.KV_REST_API_TOKEN;
  if (!URL || !TOKEN) return res.status(500).json({ error: 'Missing KV env vars' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const wallets = Array.isArray(body.wallets) ? body.wallets : [];

    const id = genId(8);
    const key = `portfolios:${id}`;
    const record = { id, wallets, updatedAt: Date.now() };

    // Upstash KV: set key -> JSON string
    const r = await fetch(`${URL}/set/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(record) })
    });
    if (!r.ok) throw new Error(`KV set ${r.status}`);

    return res.status(200).json({ id, wallets });
  } catch (e) {
    console.error('POST /portfolios error', e);
    return res.status(500).json({ error: e.message || 'create_failed' });
  }
};

function genId(len = 8) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = ''; for (let i = 0; i < len; i++) out += A[Math.floor(Math.random() * A.length)];
  return out;
}
