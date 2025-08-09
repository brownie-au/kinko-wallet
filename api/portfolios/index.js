// POST /api/portfolios  -> { id, wallets }
// Creates a new portfolio id with current wallets payload
import { put } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { wallets = [] } = req.body || {};
    const id = genId(8);
    const key = `portfolios/${id}.json`;

    await put(key, JSON.stringify({ id, wallets, updatedAt: Date.now() }), {
      access: 'public',
      contentType: 'application/json'
    });

    return res.status(200).json({ id, wallets });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'create failed' });
  }
}

function genId(len = 8) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}
