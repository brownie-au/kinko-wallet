// src/components/kw-HexStakingHeaderContainer.jsx
import React, { useMemo, useEffect, useState } from 'react';
import KwHexStakingHeader from './kw-HexStakingHeader.jsx';
import { computeHexStakingStats } from '../services/hexStakingStats';

/**
 * NEW (optional) prop supported:
 *   gridRows: the exact rows you render in the table (post-format).
 * If you pass gridRows, we’ll read the “YIELD” and “% APY” columns from there
 * so the tiles ALWAYS match the table, with no dependency on chain RPC.
 */

const HEARTS_PER_HEX = 1e8;
const SHARES_PER_TSHARE = 1e12;

const toNum = (v) => {
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
        const m = v.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
        if (m) return Number(m[0]);
    }
    try { if (typeof v === 'bigint') return Number(v); } catch { }
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};
const pick = (o, keys) => { for (const k of keys) if (o && o[k] !== undefined && o[k] !== null) return o[k]; };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** DexScreener-backed price caches (no Moralis). */
function readHexPriceUsdFromCaches(override, updatedAt) {
    if (typeof override === 'number' && override > 0) return override;
    try {
        const k1 = localStorage.getItem('kw:lastHexPriceUsd');
        if (k1) { const v = Number(k1); if (v > 0) return v; }

        for (const key of [
            'kw:dexscreener:prices:v1', // { HEX: 0.01 }
            'kw:dex:prices:v1',
            'kw:topTokensCache'         // { tokens: [{symbol:'HEX', priceUsd:...}] }
        ]) {
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            const obj = JSON.parse(raw);
            if (key === 'kw:topTokensCache' && Array.isArray(obj?.tokens)) {
                const token = obj.tokens.find(t => (t?.symbol || '').toUpperCase() === 'HEX');
                const v = Number(token?.priceUsd);
                if (v > 0) return v;
            } else {
                const v = Number(obj?.HEX ?? obj?.hex ?? obj?.['hex:pls']);
                if (v > 0) return v;
            }
        }

        for (const key of ['kw:tokenPrices:v1', 'kw:prices:bySymbol', 'kw:prices:spot:v1']) {
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            const map = JSON.parse(raw);
            const v = Number(map?.HEX ?? map?.hex ?? map?.['hex:pls']);
            if (v > 0) return v;
        }

        if (typeof window !== 'undefined') {
            const v = Number(window.__KW_HEX_PRICE_USD);
            if (v > 0) return v;
        }
    } catch { }
    return 0;
}

/* ----------------- Aggregation from grid rows (preferred) ----------------- */
function readAggsFromGridRows(gridRows = []) {
    if (!Array.isArray(gridRows) || gridRows.length === 0) return null;

    let apySum = 0, apyCount = 0, yieldSum = 0, principalSum = 0;

    for (const r of gridRows) {
        // "% APY" column
        const apyRaw = pick(r, [
            'apyPct', 'apy', 'percentApy', 'apy_percentage', '%APY', '% APY', 'APY %', 'APY%', 'percent',
            'apyDisplay', 'percentDisplay'
        ]);
        const apyPct = toNum(apyRaw);
        if (apyPct || apyPct === 0) { apySum += apyPct; apyCount += 1; }

        // "YIELD" column
        const yieldRaw = pick(r, ['yieldHex', 'yield', 'interestHex', 'interest', 'payoutHex', 'accruedHex', 'yieldDisplay']);
        const yieldHex = toNum(yieldRaw);
        yieldSum += yieldHex;

        // "PRINCIPAL (HEX)" column
        const principalRaw = pick(r, ['principalHex', 'principal', 'principalDisplay']);
        const principalHex = toNum(principalRaw);
        principalSum += principalHex;
    }

    return {
        avgApyPct: apyCount ? (apySum / apyCount) : 0,
        totalYieldHex: yieldSum,
        totalPrincipalHex: principalSum,
        source: 'gridRows'
    };
}

/* ----------------- Aggregation from raw stakes (fallback) ----------------- */
function rowApyYieldOrDerive(row, currentDay, payoutPerTShareDailyHex) {
    const apyRaw = pick(row, ['apyPct', 'apy', 'percentApy', 'apy_percentage', '%APY', '% APY', 'APY %', 'APY%', 'percent']);
    const yieldRaw = pick(row, ['yieldHex', 'yield', 'interestHex', 'interest', 'payoutHex', 'accruedHex']);
    let apyPct = toNum(apyRaw);
    let yieldHex = toNum(yieldRaw);

    const principalHex =
        toNum(pick(row, ['principalHex', 'principal'])) ||
        (toNum(pick(row, ['stakedHearts'])) / HEARTS_PER_HEX);

    if (!yieldHex) {
        const totalHex = toNum(pick(row, ['totalHex', 'total']));
        if (totalHex && principalHex && totalHex >= principalHex) yieldHex = totalHex - principalHex;
    }

    const tShares =
        toNum(pick(row, ['tShares', 'tshares'])) ||
        (toNum(pick(row, ['stakeShares'])) / SHARES_PER_TSHARE);

    const lockedDay = toNum(pick(row, ['lockedDay', 'lockDay', 'startDay']));
    const stakedDays = toNum(pick(row, ['stakedDays', 'termDays', 'days']));
    const elapsed = (currentDay && stakedDays) ? clamp(currentDay - lockedDay, 0, stakedDays) : 0;

    if (!yieldHex && tShares && elapsed && payoutPerTShareDailyHex) {
        yieldHex = tShares * toNum(payoutPerTShareDailyHex) * elapsed;
    }

    if (!apyPct && principalHex > 0 && elapsed > 0 && yieldHex > 0) {
        apyPct = (yieldHex / principalHex) / (elapsed / 365) * 100;
    }

    return { apyPct: toNum(apyPct), yieldHex: toNum(yieldHex), principalHex: toNum(principalHex) };
}

function readAggsFromRawStakes(stakes = [], currentDay, payoutPerTShareDailyHex) {
    if (!Array.isArray(stakes) || stakes.length === 0) return null;

    let apySum = 0, apyCount = 0, yieldSum = 0, principalSum = 0;

    for (const s of stakes) {
        const { apyPct, yieldHex, principalHex } =
            rowApyYieldOrDerive(s, currentDay, payoutPerTShareDailyHex);
        if (apyPct || apyPct === 0) { apySum += apyPct; apyCount += 1; }
        yieldSum += (yieldHex || 0);
        principalSum += (principalHex || 0);
    }

    return {
        avgApyPct: apyCount ? (apySum / apyCount) : 0,
        totalYieldHex: yieldSum,
        totalPrincipalHex: principalSum,
        source: 'rawStakes'
    };
}

/* ----------------- DOM helpers (visible table & ticker) ----------------- */
function findHeaderIndex(table, matchFn) {
    const thead = table.tHead || table.querySelector('thead');
    if (!thead) return -1;
    const headerRow = thead.rows?.[0] || thead.querySelector('tr');
    if (!headerRow) return -1;
    const headers = Array.from(headerRow.cells).map(c => (c.innerText || c.textContent || '').trim());
    for (let i = 0; i < headers.length; i++) {
        if (matchFn(headers[i])) return i;
    }
    return -1;
}
function parseCellNumber(text) {
    if (!text) return 0;
    const s = String(text).replace(/,/g, '').replace(/\bHEX\b/i, '').replace(/%/g, '').trim();
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
}

function readAvgApyFromDom() {
    try {
        const tables = Array.from(document.querySelectorAll('table'));
        for (const table of tables) {
            const apyIdx = findHeaderIndex(table, h => h.toUpperCase().includes('APY'));
            if (apyIdx === -1) continue;
            const tbody = table.tBodies?.[0] || table.querySelector('tbody');
            if (!tbody) continue;
            const rows = Array.from(tbody.rows);
            if (!rows.length) continue;
            let sum = 0, count = 0;
            for (const tr of rows) {
                const cell = tr.cells[apyIdx];
                if (!cell) continue;
                sum += parseCellNumber(cell.innerText || cell.textContent);
                count++;
            }
            if (count > 0) return sum / count;
        }
    } catch { }
    return null;
}
function readTotalYieldFromDom() {
    try {
        const tables = Array.from(document.querySelectorAll('table'));
        for (const table of tables) {
            const yieldIdx = findHeaderIndex(table, h => h.trim().toUpperCase() === 'YIELD');
            if (yieldIdx === -1) continue;
            const tbody = table.tBodies?.[0] || table.querySelector('tbody');
            if (!tbody) continue;
            const rows = Array.from(tbody.rows);
            if (!rows.length) continue;
            let sum = 0;
            for (const tr of rows) {
                const cell = tr.cells[yieldIdx];
                if (!cell) continue;
                sum += parseCellNumber(cell.innerText || cell.textContent);
            }
            return sum;
        }
    } catch { }
    return null;
}
function readTotalHexFromDom() {
    try {
        const tables = Array.from(document.querySelectorAll('table'));
        for (const table of tables) {
            const totalHexIdx = findHeaderIndex(table, h => h.trim().toUpperCase() === 'TOTAL (HEX)');
            if (totalHexIdx === -1) continue;
            const tbody = table.tBodies?.[0] || table.querySelector('tbody');
            if (!tbody) continue;
            const rows = Array.from(tbody.rows);
            if (!rows.length) continue;
            let sum = 0;
            for (const tr of rows) {
                const cell = tr.cells[totalHexIdx];
                if (!cell) continue;
                sum += parseCellNumber(cell.innerText || cell.textContent);
            }
            return sum; // total of visible TOTAL (HEX) column
        }
    } catch { }
    return null;
}
function readHexPriceUsdFromDomTicker() {
    try {
        // Scan a limited set of likely containers first
        const scopes = document.querySelectorAll('header, .kw-ticker, .ticker, .app-header, body');
        for (const scope of scopes) {
            const txt = (scope.innerText || scope.textContent || '').toUpperCase();
            // e.g., "HEX USD $0.0111"
            const m = txt.match(/HEX\s+USD\s*\$?\s*([0-9]*\.?[0-9]+)/i);
            if (m && m[1]) {
                const n = Number(m[1]);
                if (Number.isFinite(n) && n > 0) return n;
            }
        }
    } catch { }
    return null;
}

/* ----------------- Component ----------------- */
export default function KwHexStakingHeaderContainer({
    stakes,
    gridRows,                   // <-- NEW (optional): pass your table rows here
    currentHexDay,
    payoutPerTShareDailyHex,    // parent-supplied if available
    updatedAt,
    onRefresh,
    sticky = true,
    hexPriceUsdOverride
}) {
    // Debug: basic props
    console.debug('[KW HEX Header] props', {
        gridRows: Array.isArray(gridRows) ? gridRows.length : 0,
        stakes: Array.isArray(stakes) ? stakes.length : 0,
        currentHexDay,
        payoutPerTShareDailyHex_in: payoutPerTShareDailyHex,
        updatedAt
    });
    if (gridRows?.length) {
        const g = gridRows[0]; const p = {};
        ['principalHex', 'principal', 'principalDisplay', 'yieldHex', 'yield', 'yieldDisplay', 'apyPct', 'apy', 'percent', '% APY', '%APY', 'APY %', 'APY%', 'totalHex', 'total']
            .forEach(k => { if (g?.[k] !== undefined) p[k] = g[k]; });
        console.debug('[KW HEX Header] sample grid row', p);
    } else if (stakes?.length) {
        const r = stakes[0]; const p = {};
        ['principalHex', 'principal', 'stakedHearts', 'tShares', 'tshares', 'stakeShares', 'lockedDay', 'stakedDays', 'apyPct', 'yieldHex', 'totalHex']
            .forEach(k => { if (r?.[k] !== undefined) p[k] = r[k]; });
        console.debug('[KW HEX Header] sample raw row', p);
    }

    // Keep your existing computed stats for counts/cadence tiles
    const stats = useMemo(
        () => computeHexStakingStats(stakes, { currentDay: currentHexDay, payoutPerTShareDailyHex }),
        [stakes, currentHexDay, payoutPerTShareDailyHex]
    );

    // 1) Prefer aggregates from the actual grid rows
    const aggsFromGrid = useMemo(() => readAggsFromGridRows(gridRows), [gridRows]);

    // 2) Fallback to aggregates derived from raw stakes
    const aggsFromRaw = useMemo(
        () => readAggsFromRawStakes(stakes, currentHexDay, payoutPerTShareDailyHex),
        [stakes, currentHexDay, payoutPerTShareDailyHex]
    );

    const aggs = aggsFromGrid || aggsFromRaw || { avgApyPct: 0, totalYieldHex: 0, totalPrincipalHex: 0, source: 'none' };
    console.debug('[KW HEX Header] aggregates', aggs);

    /* ---------- compute from the rendered table & ticker (visible rows) ---------- */
    const [avgApyDom, setAvgApyDom] = useState(null);
    const [totalYieldDom, setTotalYieldDom] = useState(null);
    const [totalHexDom, setTotalHexDom] = useState(null);
    const [hexPriceDom, setHexPriceDom] = useState(null);

    useEffect(() => {
        const id = setTimeout(() => {
            const apy = readAvgApyFromDom();
            if (apy !== null && apy !== undefined) {
                console.debug('[KW HEX Header] avgApyPct (from DOM % APY)', apy);
                setAvgApyDom(apy);
            }
            const yld = readTotalYieldFromDom();
            if (yld !== null && yld !== undefined) {
                console.debug('[KW HEX Header] totalYieldHex (from DOM YIELD)', yld);
                setTotalYieldDom(yld);
            }
            const tot = readTotalHexFromDom();
            if (tot !== null && tot !== undefined) {
                console.debug('[KW HEX Header] totalHex (from DOM TOTAL (HEX))', tot);
                setTotalHexDom(tot);
            }
            const px = (typeof hexPriceUsdOverride === 'number' && hexPriceUsdOverride > 0)
                ? hexPriceUsdOverride
                : readHexPriceUsdFromDomTicker();
            if (px !== null && px !== undefined) {
                console.debug('[KW HEX Header] hexPriceUsd (from DOM ticker)', px);
                setHexPriceDom(px);
            }
        }, 150);
        return () => clearTimeout(id);
    }, [gridRows?.length, stakes?.length, updatedAt, hexPriceUsdOverride]);

    // Prefer DOM-derived values when available
    const finalAvgApyPct   = (avgApyDom   !== null && avgApyDom   !== undefined) ? avgApyDom   : aggs.avgApyPct;
    const finalTotalYield  = (totalYieldDom !== null && totalYieldDom !== undefined) ? totalYieldDom : aggs.totalYieldHex;
    const finalTotalHex    = (totalHexDom !== null && totalHexDom !== undefined)
        ? totalHexDom
        : (aggs.totalPrincipalHex + finalTotalYield);

    const hexPriceFromCache = useMemo(
        () => readHexPriceUsdFromCaches(hexPriceUsdOverride, updatedAt),
        [hexPriceUsdOverride, updatedAt]
    );
    const finalHexPriceUsd  = (hexPriceDom !== null && hexPriceDom !== undefined && hexPriceDom > 0)
        ? hexPriceDom
        : hexPriceFromCache;

    const totalUsd = (finalHexPriceUsd > 0) ? finalTotalHex * finalHexPriceUsd : 0;

    console.debug('[KW HEX Header] totals', {
        hexPriceUsd: finalHexPriceUsd,
        totalPrincipalHex: aggs.totalPrincipalHex,
        totalYieldHex: finalTotalYield,
        totalHex: finalTotalHex,
        totalUsd,
        source: aggs.source
    });

    return (
        <KwHexStakingHeader
            /* counts & cadence from your existing util */
            activeStakes={stats.activeStakes}
            totalTShares={stats.totalTShares}
            nextEndInDays={stats.nextEndInDays}
            avgStakeYears={stats.avgStakeYears}
            yieldPerDay={stats.yieldPerDay}
            yieldPerWeek={stats.yieldPerWeek}
            yieldPerMonth={stats.yieldPerMonth}
            yieldPerYear={stats.yieldPerYear}

            /* ✅ APY + Yield + USD driven by displayed table & ticker */
            avgApyPct={finalAvgApyPct}
            totalPrincipalHex={aggs.totalPrincipalHex}
            totalYieldHex={finalTotalYield}

            /* USD headline */
            hexPriceUsd={finalHexPriceUsd}
            totalUsd={totalUsd}
            totalHex={finalTotalHex}

            /* UI */
            updatedAt={updatedAt}
            onRefresh={onRefresh}
            sticky={sticky}
            alignControlsRight
            showUsdUnderTitle
        />
    );
}
