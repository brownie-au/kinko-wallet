// POST /api/portfolios  -> { id, wallets }
const { put } = require('@vercel/blob');

function genId(len = 8) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += A[Math.floor(Math.random() * A.length)];
  return out;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const wallets = Array.isArray(body.wallets) ? body.wallets : [];
    const id = genId();
    const key = `portfolios/${id}.json`;

    await put(key, JSON.stringify({ id, wallets, updatedAt: Date.now() }), {
      access: 'public',
      contentType: 'application/json'
    });

    return res.status(200).json({ id, wallets });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'create_failed' });
  }
};
