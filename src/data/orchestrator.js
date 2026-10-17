import { normalizeWallets } from '../utils/walletRecords.js';
// src/data/orchestrator.js
// Background refresh orchestrator: on mount and every 10 minutes, refreshes
// balances, prices and tx history for all wallets across supported chains.
import DataClient from './dataClient';

const TEN_MIN = 10 * 60 * 1000;

const DEBUG_CACHE =
  String(import.meta?.env?.VITE_DEBUG_CACHE || '').toLowerCase() === 'true' ||
  (typeof localStorage !== 'undefined' && localStorage.getItem('DEBUG_CACHE') === 'true');
const dlog = (...a) => {
  if (DEBUG_CACHE) console.log('%c[ORCH]', 'color:#c6f', ...a);
};

let intervalId = null;
let running = false;
let lastSuccessAt = 0;
let lastErrorAt = 0;
let lastRunAt = 0;
let inflightCount = 0;
let currentRunPromise = null;
let visibilityListener = null;
let onlineListener = null;

function getWalletsFromLocal() {
  try {
    const raw = localStorage.getItem('wallets');
    const arr = raw ? JSON.parse(raw) : [];
    return normalizeWallets(Array.isArray(arr) ? arr : []).filter((w) => !w.hidden);
  } catch {
    return [];
  }
}

async function performRefresh({ force = false } = {}) {
  const wallets = getWalletsFromLocal();
  const addrs = wallets.map((w) => w.address.toLowerCase());
  const activeChains = [...new Set(wallets.flatMap((w) => w.networks))];
  const jobs = [];

  // Prices per chain
  for (const c of activeChains)
    jobs.push(async () => {
      inflightCount++;
      try {
        await DataClient.refreshPrice(c, { force });
      } finally {
        inflightCount--;
      }
    });

  // Balances + Tx per (wallet, chain)
  for (const wallet of wallets) {
    const addr = wallet.address.toLowerCase();
    for (const c of wallet.networks) {
      jobs.push(async () => {
        inflightCount++;
        try {
          await DataClient.refreshBalances(c, addr, { force });
        } finally {
          inflightCount--;
        }
      });
      jobs.push(async () => {
        inflightCount++;
        try {
          await DataClient.refreshTxs(c, addr, 'all', { force });
        } finally {
          inflightCount--;
        }
      });
    }
  }

  // Await actual completion and bound concurrent provider calls.
  let cursor = 0,
    failures = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, jobs.length) }, async () => {
      while (cursor < jobs.length) {
        const job = jobs[cursor++];
        try {
          await job();
        } catch (e) {
          failures++;
          lastErrorAt = Date.now();
          dlog('job error', e?.message);
        }
      }
    })
  );
  if (!failures) lastSuccessAt = Date.now();
  dlog('refresh completed', { wallets: addrs.length, chains: activeChains.length });
}

async function runOnce({ force = false } = {}) {
  if (running) return currentRunPromise;
  running = true;
  lastRunAt = Date.now();
  inflightCount = 0;

  const execPromise = (async () => {
    try {
      await performRefresh({ force });
    } catch (e) {
      lastErrorAt = Date.now();
      dlog('orchestrator error', e?.message || e);
    } finally {
      running = false;
      try {
        // update global status meta key
        const status = { running, lastRunAt, lastSuccessAt, lastErrorAt, inflightCount };
        await DataClient.write('meta:lastUpdated:orchestrator', { payload: status, version: 1, ttlMs: TEN_MIN });
      } catch {}
    }
  })();

  currentRunPromise = execPromise;
  execPromise.finally(() => {
    currentRunPromise = null;
  });

  return execPromise;
}

export function startOrchestrator() {
  if (intervalId) return; // already started
  dlog('start');
  runOnce({ force: false }); // immediate background refresh
  intervalId = setInterval(() => runOnce({ force: false }), TEN_MIN);

  // visibility/online triggers
  const onVis = () => {
    if (document.visibilityState === 'visible') runOnce({ force: false });
  };
  const onOnline = () => runOnce({ force: false });
  visibilityListener = onVis;
  onlineListener = onOnline;
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('online', onOnline);
}

export function stopOrchestrator() {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
  if (visibilityListener) document.removeEventListener('visibilitychange', visibilityListener);
  if (onlineListener) window.removeEventListener('online', onlineListener);
  visibilityListener = null;
  onlineListener = null;
}

export function getOrchestratorStatus() {
  return { running, lastRunAt, lastSuccessAt, lastErrorAt, inflightCount };
}

export async function runGlobalRefresh({ force = true } = {}) {
  if (running && currentRunPromise) {
    try {
      await currentRunPromise;
    } catch {}
  }
  return runOnce({ force });
}
