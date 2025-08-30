export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }
    // Only return path; do not echo headers/body
    return res.status(200).json({ pong: true, path: req.url });
  } catch (e) {
    console.error('[api/ai/ping] Error:', e?.message || e);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
}
