// src/services/aiAnalyzerService.js
/* Service for the AI Portfolio Analyzer:
   - Posts prompts+data to a local proxy (Gemini or your model of choice)
   - Small localStorage cache (15 min) keyed by inputs
   - Pure logic; no UI code here
*/

import { buildSystemPrompt, buildUserPrompt, RISK_LEVELS, TIMEFRAMES } from './aiPromptTemplates';

// ---------- Config ----------
const PROXY_URL =
    import.meta.env.VITE_AI_ANALYZER_URL ||
    import.meta.env.VITE_AI_PROXY_URL ||
    'http://localhost:6060/api/gemini/analyze'; // fallback to your existing dev proxy

const LS_PREFIX = 'kw:ai:analyzer:v1:'; // cache key prefix
const CACHE_TTL_MS = 15 * 60 * 1000;     // 15 minutes

// ---------- Utils ----------
function safeJson(obj) {
    try { return JSON.stringify(obj); } catch { return '{}'; }
}
function djb2Hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
    // convert to unsigned 32-bit string
    return (h >>> 0).toString(36);
}
function cacheKeyFor(payload) {
    return LS_PREFIX + djb2Hash(safeJson(payload));
}
function readCache(key) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const obj = JSON.parse(raw);
        if (!obj || !obj.updatedAt) return null;
        if (Date.now() - Number(obj.updatedAt) > CACHE_TTL_MS) return null;
        return obj.data;
    } catch { return null; }
}
function writeCache(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify({ updatedAt: Date.now(), data }));
    } catch { }
}
async function postJSON(url, body) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: safeJson(body)
    });
    if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`AI proxy HTTP ${res.status} ${txt ? `- ${txt.slice(0, 160)}` : ''}`);
    }
    return res.json().catch(async () => ({ text: await res.text() }));
}

// ---------- Public API ----------
/**
 * Analyze a live portfolio with optional user inputs.
 * @param {Object} args
 * @param {Object} args.portfolio - { totalUsd:number, assets:[], chains:[] }
 * @param {string} [args.objective]
 * @param {number} [args.riskIndex=2] - 0..4 maps to Very Low..Very High
 * @param {string} [args.timeframe='5y'] - '1y'|'3y'|'5y'
 * @param {boolean} [args.force=false] - bypass cache
 * @returns {Promise<Object>} model response (shape depends on your proxy)
 */
export async function analyzePortfolio({
    portfolio,
    objective = '',
    riskIndex = 2,
    timeframe = '5y',
    force = false
} = {}) {
    const riskLabel = RISK_LEVELS[riskIndex] || 'Medium';
    const timeframeLabel = TIMEFRAMES[timeframe] || '5+ years';

    const system = buildSystemPrompt({ riskLabel, timeframeLabel });
    const user = buildUserPrompt({ portfolio, objective });

    const payload = {
        system,
        user,
        // Include raw for advanced server-side prompting if desired
        data: { portfolio, objective, riskIndex, timeframe }
    };

    const key = cacheKeyFor(payload);
    if (!force) {
        const hit = readCache(key);
        if (hit) return hit;
    }

    const out = await postJSON(PROXY_URL, payload);

    // Normalise a minimal, predictable shape while preserving raw:
    const normalised = {
        overviewHtml: out?.overviewHtml ?? null,
        observationsHtml: out?.observationsHtml ?? null,
        scorecard: out?.scorecard ?? null, // expect { components:[], total:number }
        breakdownHtml: out?.breakdownHtml ?? null,
        news: out?.news ?? null,
        raw: out
    };

    writeCache(key, normalised);
    return normalised;
}

/** Manually clear all analyzer caches. */
export function clearAiAnalyzerCache() {
    try {
        const keys = Object.keys(localStorage);
        for (const k of keys) {
            if (k && k.startsWith(LS_PREFIX)) localStorage.removeItem(k);
        }
    } catch { }
}
