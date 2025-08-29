// src/services/aiQuickTipsService.js
/* Generate short, actionable portfolio tips.
   - First, we *attempt* to call the existing AI analyzer with a quickTips flag.
   - If there's no AI response, we fall back to deterministic tips derived from the live snapshot.
   - Results are cached in localStorage for ~15 minutes with a stable signature.
*/
import { analyzePortfolio } from './aiAnalyzerService';

const LS_KEY = 'kw:ai:quicktips:v1';
const TTL_MS = 15 * 60 * 1000;

function round(n, d = 2) {
    const x = Number(n) || 0;
    const p = 10 ** d;
    return Math.round(x * p) / p;
}

function buildSummary(portfolio) {
    const assets = Array.isArray(portfolio?.assets) ? portfolio.assets : [];
    const total = Number(portfolio?.totalUsd || 0);

    // chain weights
    const by = { eth: 0, pulse: 0, base: 0, other: 0 };
    for (const a of assets) {
        const chain = String(a?.chain || '').toLowerCase();
        const val = Number(a?.valueUsd) || 0;
        if (val <= 0) continue;
        if (chain.startsWith('eth') || chain === 'ethereum') by.eth += val;
        else if (chain === 'pulse' || chain.startsWith('pls')) by.pulse += val;
        else if (chain.startsWith('base')) by.base += val;
        else by.other += val;
    }

    const sorted = [...assets]
        .filter(a => (Number(a.valueUsd) || 0) > 0)
        .sort((a, b) => Number(b.valueUsd) - Number(a.valueUsd));

    const top = sorted.slice(0, 8).map(a => ({
        symbol: a.symbol || a.name || '—',
        chain: String(a.chain || '').toLowerCase(),
        valueUsd: Number(a.valueUsd) || 0
    }));

    const topTotal = top.reduce((s, r) => s + r.valueUsd, 0);
    const top1 = top[0]?.valueUsd || 0;
    const top3 = top.slice(0, 3).reduce((s, r) => s + r.valueUsd, 0);

    return {
        totalUsd: total,
        chainUsd: by,
        chainPct: {
            eth: total > 0 ? (by.eth / total) * 100 : 0,
            pulse: total > 0 ? (by.pulse / total) * 100 : 0,
            base: total > 0 ? (by.base / total) * 100 : 0,
            other: total > 0 ? (by.other / total) * 100 : 0
        },
        top,
        concentration: {
            top1Pct: total > 0 ? (top1 / total) * 100 : 0,
            top3Pct: total > 0 ? (top3 / total) * 100 : 0,
            topSharePct: total > 0 ? (topTotal / total) * 100 : 0
        }
    };
}

function signatureFrom(summary, riskIndex, timeframe, objective) {
    // Compact signature so cache survives small numeric jitter
    const chains = ['eth', 'pulse', 'base', 'other']
        .map(k => `${k}:${Math.round(summary.chainPct[k] * 10) / 10}`)
        .join('|');
    const tops = summary.top.slice(0, 5)
        .map(t => `${t.symbol}:${Math.round(((t.valueUsd / (summary.totalUsd || 1)) * 100) * 10) / 10}`)
        .join('|');
    return `${chains}#${tops}#r${riskIndex}#t${timeframe}#o${(objective || '').slice(0, 40)}`;
}

function readCache(sig) {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return null;
        const obj = JSON.parse(raw);
        const hit = obj?.[sig];
        if (!hit) return null;
        if (Date.now() - (hit.updatedAt || 0) > TTL_MS) return null;
        return hit.tips;
    } catch { return null; }
}

function writeCache(sig, tips) {
    try {
        const raw = localStorage.getItem(LS_KEY);
        const obj = raw ? JSON.parse(raw) : {};
        obj[sig] = { tips, updatedAt: Date.now() };
        // prune a bit
        const keys = Object.keys(obj);
        if (keys.length > 10) {
            keys.sort((a, b) => (obj[b].updatedAt || 0) - (obj[a].updatedAt || 0));
            for (const k of keys.slice(10)) delete obj[k];
        }
        localStorage.setItem(LS_KEY, JSON.stringify(obj));
    } catch { /* ignore */ }
}

function fallbackTips(summary, riskIndex, timeframe, objective) {
    const tips = [];
    const { chainPct, concentration } = summary;

    // Concentration nudges
    if (concentration.top1Pct >= 40) {
        tips.push(`High position concentration: top holding ≈ ${round(concentration.top1Pct, 1)}% of total. Consider trimming/risk controls.`);
    } else if (concentration.top3Pct >= 70) {
        tips.push(`Top 3 positions ≈ ${round(concentration.top3Pct, 1)}% of portfolio. Review diversification.`);
    }

    // Chain exposure nudges
    const chainPairs = [
        ['eth', 'Ethereum'],
        ['pulse', 'PulseChain'],
        ['base', 'Base'],
    ];
    for (const [key, label] of chainPairs) {
        if (chainPct[key] >= 70) {
            tips.push(`${label} exposure is heavy at ≈ ${round(chainPct[key], 1)}%. Ensure this matches your thesis and timeframe.`);
            break;
        }
    }

    // Risk & timeframe hints
    const tfLabel = String(timeframe || '5y');
    if (riskIndex >= 3) {
        tips.push(`Risk set to ${['Very Low', 'Low', 'Medium', 'High', 'Very High'][riskIndex]} — predefine drawdown limits and rebalance rules.`);
    } else if (riskIndex <= 1) {
        tips.push(`Risk set to ${['Very Low', 'Low', 'Medium', 'High', 'Very High'][riskIndex]} — growth may be slower; deploy dry powder on pullbacks.`);
    }
    if (tfLabel !== '5y') {
        tips.push(`Timeframe ${tfLabel}: align position sizes to catalysts within this horizon.`);
    }

    // Objective echo
    if (objective) tips.push(`Stay consistent with objective: “${objective.slice(0, 120)}${objective.length > 120 ? '…' : ''}”`);

    // Ensure 3–5 lines
    return tips.slice(0, 5);
}

export async function getQuickTips({ portfolio, riskIndex = 2, timeframe = '5y', objective = '', force = false }) {
    const summary = buildSummary(portfolio || {});
    const sig = signatureFrom(summary, riskIndex, timeframe, objective);

    if (!force) {
        const cached = readCache(sig);
        if (cached && Array.isArray(cached) && cached.length) return cached;
    }

    // Try AI first (non-breaking if backend ignores the flag)
    try {
        const resp = await analyzePortfolio({
            portfolio,
            objective,
            riskIndex,
            timeframe,
            quickTipsOnly: true
        });
        const aiTips = Array.isArray(resp?.tips) ? resp.tips.filter(Boolean) : null;
        if (aiTips && aiTips.length) {
            writeCache(sig, aiTips);
            return aiTips;
        }
    } catch { /* fall through to deterministic tips */ }

    const tips = fallbackTips(summary, riskIndex, timeframe, objective);
    writeCache(sig, tips);
    return tips;
}
