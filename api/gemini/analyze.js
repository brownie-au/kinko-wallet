// api/gemini/analyze.js
// Vercel Serverless function: POST only

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY not set' });

    const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    const { system, user, data } = req.body || {};

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

    const mustReturn = `Return a compact JSON object with keys: overviewHtml (HTML string), observationsHtml (HTML string), breakdownHtml (HTML string), scorecard (object with { total:number, components:[] }), news (array).`;

    const body = {
      system_instruction: system ? { role: 'system', parts: [{ text: system }] } : undefined,
      contents: [{ role: 'user', parts: [{ text: `${user || ''}\n\n${mustReturn}` }] }],
      generationConfig: { temperature: 0.3, topK: 32, topP: 0.9 }
    };

    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      return res.status(502).json({ error: `Gemini HTTP ${r.status}`, detail: t?.slice(0, 200) });
    }
    const json = await r.json();
    const text = json?.candidates?.[0]?.content?.parts?.map((p) => p?.text || '').join('\n') || '';

    try {
      const parsed = JSON.parse(text);
      return res.status(200).json(parsed);
    } catch {}

    // Fallback: place full text in overviewHtml so UI shows something
    const safe = String(text).replace(/\n\n/g, '<br/><br/>').replace(/\n/g, '<br/>');
    return res.status(200).json({ overviewHtml: safe, raw: json });
  } catch (e) {
    console.error('[api/gemini/analyze] Error:', e?.message || e);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

