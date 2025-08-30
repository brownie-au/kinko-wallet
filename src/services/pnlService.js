// src/services/pnlService.js
// Minimal PnL snapshot service (frontend-only).
// Stores one portfolio USD snapshot per day in kinkoCache (IndexedDB/localStorage).

import { getCachedJSON, setCachedJSON } from '../utils/kinkoCache';

const KEY = 'pnl:snapshots:v1';
const MAX_POINTS = 1000; // safety cap

function isoDateOnly(d = new Date()) {
  // local date (not UTC) so YTD aligns with the user's local year
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${yr}-${mo}-${da}`;
}

function load() {
  const data = getCachedJSON(KEY) || { points: [] };
  if (!Array.isArray(data.points)) data.points = [];
  return data;
}

function save(data) {
  try {
    setCachedJSON(KEY, data);
  } catch (e) {
    // non-fatal

    console.warn('pnlService save failed:', e);
  }
}

export function recordSnapshotIfNeeded(currentUsd) {
  const now = new Date();
  const today = isoDateOnly(now);

  const data = load();
  const last = data.points[data.points.length - 1];

  // Only push one point per local day, and only if we have a valid value
  const val = Number(currentUsd);
  if (!Number.isFinite(val)) return;

  if (!last || last.date !== today) {
    data.points.push({ date: today, valueUsd: val });
    if (data.points.length > MAX_POINTS) data.points.splice(0, data.points.length - MAX_POINTS);
    save(data);
  } else {
    // same day → keep the earliest snapshot; do nothing
  }
}

// Helper to find portfolio value at/after a target date
function valueAtOrAfter(data, targetISO) {
  const pts = data.points;
  for (let i = 0; i < pts.length; i += 1) {
    if (pts[i].date >= targetISO) return pts[i].valueUsd;
  }
  // if nothing on/after target, fall back to very first point (so ALL works)
  return pts.length ? pts[0].valueUsd : 0;
}

function rangeStartISO(rangeKey) {
  const now = new Date();

  switch ((rangeKey || '').toLowerCase()) {
    case '7d': {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return isoDateOnly(d);
    }
    case '1m': {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      return isoDateOnly(d);
    }
    case '3m': {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 3);
      return isoDateOnly(d);
    }
    case '1y': {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      return isoDateOnly(d);
    }
    case 'ytd': {
      const d = new Date(now);
      d.setMonth(0, 1);
      return isoDateOnly(d);
    }
    case 'all':
    default:
      return '0000-01-01';
  }
}

// MAIN: get PnL for a range (uses provided currentUsd if given; else last snapshot).
export function getPnL(rangeKey, currentUsdOverride) {
  const data = load();
  const pts = data.points;

  const currentValue = Number.isFinite(Number(currentUsdOverride))
    ? Number(currentUsdOverride)
    : pts.length
      ? pts[pts.length - 1].valueUsd
      : 0;

  const startISO = rangeStartISO(rangeKey);
  const baseValue = valueAtOrAfter(data, startISO);

  const pnlUsd = currentValue - baseValue;
  const pnlPct = baseValue > 0 ? (pnlUsd / baseValue) * 100 : 0;

  return {
    range: (rangeKey || 'ytd').toLowerCase(),
    baseValue,
    currentValue,
    pnlUsd,
    pnlPct
  };
}

// Optional: expose raw points (e.g., if you later want a tiny sparkline)
export function getSnapshots() {
  return load().points;
}
