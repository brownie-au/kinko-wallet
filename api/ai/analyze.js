// api/ai/analyze.js (CommonJS)
// POST-only. Accepts: { objective, riskIndex, timeframe, portfolio }
// Builds a compact prompt, calls Gemini server-side, normalizes output.

const RISK_LEVELS = ['Very Low', 'Low', 'Medium', 'High', 'Very High'];
const TIMEFRAMES = { '1y': '1 year', '3y': '3 years', '5y': '5+ years' };

// In-memory 15 min cache (per instance)
const CACHE = new Map();
const CACHE_TTL = 15 * 60 * 1000;

function stableStringify(obj) {
  const seen = new WeakSet();
  const sort = (x) => {
    if (!x || typeof x !== 'object') return x;
    if (seen.has(x)) return null;
    seen.add(x);
    if (Array.isArray(x)) return x.map(sort);
    return Object.keys(x)
      .sort()
      .reduce((acc, k) => {
        acc[k] = sort(x[k]);
        return acc;
      }, {});
  };
  return JSON.stringify(sort(obj));
}
function djb2Hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return (h >>> 0).toString(36);
}
function cacheGet(key) {
  const it = CACHE.get(key);
  if (!it) return null;
  if (Date.now() - it.t > CACHE_TTL) {
    CACHE.delete(key);
    return null;
  }
  return it.v;
}
function cacheSet(key, value) {
  CACHE.set(key, { t: Date.now(), v: value });
}

function summarizePortfolio(portfolio) {
  const assets = Array.isArray(portfolio?.assets) ? portfolio.assets : [];
  const byChain = {};
  let total = 0;
  for (const a of assets) {
    const chain = String(a?.chain || 'unknown').toLowerCase();
    const usd = Number(a?.valueUsd || 0);
    total += usd;
    byChain[chain] = (byChain[chain] || 0) + usd;
  }
  const chainSummary = Object.entries(byChain)
    .map(([k, v]) => ({ chain: k, usd: v, pct: total > 0 ? Math.round((v / total) * 1000) / 10 : 0 }))
    .sort((a, b) => b.usd - a.usd);
  const top = [...assets]
    .sort((a, b) => (b?.valueUsd || 0) - (a?.valueUsd || 0))
    .slice(0, 8)
    .map((a) => ({
      symbol: a?.symbol || a?.name || 'Asset',
      chain: a?.chain || 'unknown',
      usd: Number(a?.valueUsd || 0),
      pct: total > 0 ? Math.round(((a?.valueUsd || 0) / total) * 1000) / 10 : 0
    }));
  return { total, chainSummary, topPositions: top };
}

function fallbackFromInput({ objective, riskIndex, timeframe, portfolio }) {
  const { total, chainSummary, topPositions } = summarizePortfolio(portfolio);
  const chainBullets = chainSummary.map((c) => `• ${c.chain}: $${Math.round(c.usd).toLocaleString()} (${c.pct}%)`).join('<br/>');
  const topBullets = topPositions
    .map((t) => `• ${t.symbol} on ${t.chain}: $${Math.round(t.usd).toLocaleString()} (${t.pct}%)`)
    .join('<br/>');
  const overviewHtml = `
    <h3>Overview</h3>
    <p>Total USD: $${Math.round(total).toLocaleString()}</p>
    <p><strong>Objective:</strong> ${objective || '—'}</p>
    <p><strong>Risk:</strong> ${RISK_LEVELS[riskIndex] || 'Medium'} | <strong>Timeframe:</strong> ${TIMEFRAMES[timeframe] || '5+ years'}</p>
    <h4>Chain Weights</h4>
    <p>${chainBullets || '• n/a'}</p>
    <h4>Top Positions</h4>
    <p>${topBullets || '• n/a'}</p>
  `;
  const breakdownHtml = `<h3>Breakdown</h3><p>${chainBullets || '• n/a'}</p>`;
  const observationsHtml = `<h3>Observations</h3><ul><li>Conservative fallback output (no AI response). Your inputs were still considered.</li></ul>`;
  // Simple concentration heuristic: penalize if top position > 40% or top2 > 65%
  const conc = topPositions;
  const top1 = conc[0]?.pct || 0;
  const top2 = (conc[0]?.pct || 0) + (conc[1]?.pct || 0);
  let totalScore = 80;
  if (top1 > 40) totalScore -= 20;
  if (top2 > 65) totalScore -= 15;
  const scorecard = { total: Math.max(0, Math.min(100, Math.round(totalScore))), components: [{ name: 'Concentration', score: Math.max(0, 100 - Math.round(top1)) }] };
  return { overviewHtml, breakdownHtml, observationsHtml, scorecard, news: null, usage: { model: 'fallback' } };
}

async function callGemini({ system, user, model, key, timeoutMs = 30000 }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  const mustReturn = `Return JSON with keys: overviewHtml, breakdownHtml, observationsHtml, scorecard:{total,components:[{name,score,note?}]}, news.`;
  const body = {
    systemInstruction: system ? { role: 'system', parts: [{ text: system }] } : undefined,
    contents: [{ role: 'user', parts: [{ text: `${user}\n\n${mustReturn}` }] }],
    generationConfig: { temperature: 0.3, topK: 32, topP: 0.9, responseMimeType: 'application/json' }
  };
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: controller.signal
  }).catch((e) => ({ ok: false, status: 0, _err: e }));
  clearTimeout(id);
  if (!r?.ok) throw new Error(`Gemini HTTP ${r?.status || 0} ${r?._err?.message || ''}`);
  const json = await r.json();
  const text = json?.candidates?.[0]?.content?.parts?.map((p) => p?.text || '').join('\n') || '';
  try {
    const parsed = JSON.parse(text);
    return { parsed, raw: json };
  } catch (_) {
    return { text, raw: json };
  }
}

function buildPrompts({ objective, riskIndex, timeframe, portfolio, snapshot }) {
  const { chainSummary, topPositions, total } = summarizePortfolio(portfolio);
  const risk = RISK_LEVELS[riskIndex] || 'Medium';
  const tf = TIMEFRAMES[timeframe] || '5+ years';
  const chainsTxt = chainSummary.map((c) => `${c.chain}:${c.pct}%`).join(', ');
  const topTxt = topPositions.map((t) => `${t.symbol}(${t.chain}) ${t.pct}%`).join(', ');
  const system = `You are the Kinko Wallet AI portfolio assistant. Be direct and actionable. Avoid hallucinations.`;
  // Optional staking context (counts only to limit prompt size)
  let stakingLine = '';
  try {
    const hexPulse = snapshot?.stakingHex?.pulse;
    const hexEth = snapshot?.stakingHex?.eth;
    const ehex = snapshot?.stakingEhex;
    const countPulse = hexPulse ? (hexPulse.stakes?.length || hexPulse.rows?.length || 0) : 0;
    const countEth = hexEth ? (hexEth.stakes?.length || hexEth.rows?.length || 0) : 0;
    const countEhex = ehex ? Object.values(ehex.byAddr || {}).reduce((a, b) => a + (Array.isArray(b) ? b.length : 0), 0) : 0;
    const parts = [];
    if (countPulse) parts.push(`HEX stakes on Pulse: ${countPulse}`);
    if (countEth) parts.push(`HEX stakes on Ethereum: ${countEth}`);
    if (countEhex) parts.push(`eHEX stakes on Ethereum: ${countEhex}`);
    if (parts.length) stakingLine = `\nStaking: ${parts.join(', ')}.`;
  } catch {}
  const user = `Portfolio total USD ~ ${Math.round(total)}.
Chains: ${chainsTxt || 'n/a'}.
Top positions: ${topTxt || 'n/a'}.
Objective: ${objective || 'n/a'}.
Risk tolerance: ${risk}. Timeframe: ${tf}.
${stakingLine}

Produce:
1) overviewHtml: short HTML; headings + bullet lists only.
2) breakdownHtml: per-chain bullets.
3) observationsHtml: 5–8 tactical/strategic bullets.
4) scorecard JSON: { total 0..100, components: [{ name, score, note? }] }.
If unsure, make conservative estimates. Keep it concise.`;
  return { system, user };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS');
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }
    const { objective = '', riskIndex = 2, timeframe = '5y', portfolio } = req.body || {};
    if (!portfolio || !Array.isArray(portfolio.assets)) {
      return res.status(400).json({ ok: false, error: 'Invalid portfolio' });
    }

    const cacheKey = djb2Hash(
      stableStringify({ objective, riskIndex, timeframe, portfolio })
    );
    const cached = cacheGet(cacheKey);
    if (cached) return res.status(200).json({ ...cached, cacheKey });

    const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    let result;
    if (key) {
      const { system, user } = buildPrompts({ objective, riskIndex, timeframe, portfolio, snapshot: req.body?.snapshot });
      try {
        const out = await callGemini({ system, user, model, key, timeoutMs: 30000 });
        let payload = null;
        if (out.parsed) {
          payload = out.parsed;
        } else if (out.text) {
          // crude parse: wrap as overview
          const safe = String(out.text).replace(/\n\n/g, '<br/><br/>').replace(/\n/g, '<br/>');
          payload = { overviewHtml: safe };
        }
        result = {
          ok: true,
          overviewHtml: payload?.overviewHtml ?? null,
          breakdownHtml: payload?.breakdownHtml ?? null,
          observationsHtml: payload?.observationsHtml ?? null,
          scorecard: payload?.scorecard ?? null,
          news: payload?.news ?? null,
          usage: { model },
          raw: out.raw
        };
      } catch (e) {
        // fall back if Gemini fails
        result = { ok: true, ...fallbackFromInput({ objective, riskIndex, timeframe, portfolio }), warn: String(e?.message || e) };
      }
    } else {
      // no key: fallback output
      result = { ok: true, ...fallbackFromInput({ objective, riskIndex, timeframe, portfolio }), warn: 'GEMINI_API_KEY not set' };
    }

    cacheSet(cacheKey, result);
    return res.status(200).json({ ...result, cacheKey });
  } catch (e) {
    console.error('[api/ai/analyze] Error:', e?.message || e);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
}
