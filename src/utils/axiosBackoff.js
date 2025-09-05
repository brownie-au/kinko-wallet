// src/utils/axiosBackoff.js
// Install an Axios response interceptor that retries 429/5xx with
// exponential backoff + jitter, and triggers a global rate-limit notice.

import { showRateLimitNotice, hideRateLimitNotice } from './rateLimitNotifier';

const DEFAULTS = {
  retries: 4, // total attempts = 1 + retries
  baseDelayMs: 800, // starting backoff
  maxDelayMs: 15_000, // cap individual delay
  totalCeilMs: 120_000 // optional overall ceiling per request chain
};

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function computeDelay(attempt, base, max) {
  // exponential backoff with full jitter
  const exp = Math.min(max, base * Math.pow(2, attempt));
  return Math.random() * exp; // 0..exp
}

function shouldRetry(status) {
  return status === 429 || status === 503 || status === 502 || status === 504;
}

export function installAxiosBackoff(axios, options = {}) {
  const cfg = { ...DEFAULTS, ...options };

  axios.interceptors.response.use(
    (resp) => {
      // success – clear any global message (in case it was shown)
      hideRateLimitNotice();
      return resp;
    },
    async (error) => {
      const resp = error?.response;
      const status = resp?.status;
      const config = error?.config || {};

      // Guard: only retry idempotent GETs (and requests that opt-in)
      const method = String(config.method || 'get').toLowerCase();
      const allow = config.__retryable === true || method === 'get';

      if (!resp || !shouldRetry(status) || !allow) {
        return Promise.reject(error);
      }

      // Respect Retry-After header if present (seconds)
      let retryAfterMs = 0;
      const ra = resp.headers?.['retry-after'] || resp.headers?.['Retry-After'];
      if (ra) {
        const n = Number(ra);
        if (Number.isFinite(n)) retryAfterMs = Math.min(cfg.maxDelayMs, Math.max(0, n * 1000));
      }

      const meta = (config.__rlMeta = config.__rlMeta || {
        attempts: 0,
        startedAt: Date.now()
      });

      if (meta.attempts >= cfg.retries) {
        return Promise.reject(error);
      }

      // show a friendly global notice on first retry
      if (meta.attempts === 0 && status === 429) {
        showRateLimitNotice('Temporarily rate-limited, retrying…');
      }

      meta.attempts += 1;

      // total ceiling safeguard
      if (cfg.totalCeilMs && Date.now() - meta.startedAt > cfg.totalCeilMs) {
        return Promise.reject(error);
      }

      const backoffMs = retryAfterMs || computeDelay(meta.attempts - 1, cfg.baseDelayMs, cfg.maxDelayMs);
      await sleep(backoffMs);

      // mark request as retryable to bypass method guard if needed next time
      config.__retryable = true;
      return axios(config);
    }
  );
}

