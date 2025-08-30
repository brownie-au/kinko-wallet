export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }
    const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    const hasKey = !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 8);
    return res.status(200).json({ ok: true, model, hasKey });
  } catch (e) {
    console.error('[api/ai/health] Error:', e?.message || e);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
}
