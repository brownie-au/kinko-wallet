// server/geminiProxy.js
import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import fetch from 'node-fetch';

const app = express();
const PORT = process.env.PORT || 6060;

app.use(cors({ origin: true }));
app.use(express.json({ limit: '1mb' }));

const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

function toHtml(s = '') {
  // Minimal markdown-ish to HTML for readability
  return String(s)
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
}

async function callGemini({ system, user, data, model = DEFAULT_MODEL }) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

  const mustReturn = `Return a compact JSON object with keys: 
  overviewHtml (string, HTML),
  observationsHtml (string, HTML),
  breakdownHtml (string, HTML),
  scorecard (object with { total:number, components:[] }),
  news (array or object).`;

  const contents = [
    { role: 'user', parts: [{ text: `${user || ''}\n\n${mustReturn}` }] }
  ];

  const body = {
    system_instruction: system ? { role: 'system', parts: [{ text: system }] } : undefined,
    contents,
    generationConfig: {
      temperature: 0.3,
      topK: 32,
      topP: 0.9
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Gemini HTTP ${res.status} ${t?.slice(0, 200)}`);
  }
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.map((p) => p?.text || '').join('\n') || '';

  // Try JSON first
  try {
    const parsed = JSON.parse(text);
    return parsed;
  } catch {}

  // Fallback to simple HTML in overview only
  return { overviewHtml: toHtml(text) };
}

app.post('/api/gemini/analyze', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { system, user, data, model } = req.body || {};
    const out = await callGemini({ system, user, data, model });
    return res.status(200).json(out);
  } catch (e) {
    console.error('[gemini/analyze] Error:', e?.message || e);
    return res.status(500).json({ error: 'Gemini proxy failed', detail: e?.message || String(e) });
  }
});

app.get('/api/gemini/health', (req, res) => {
  const hasKey = !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 8);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true, model: DEFAULT_MODEL, hasKey });
});

app.listen(PORT, () => {
  console.log(`Gemini proxy listening on http://localhost:${PORT}`);
});

