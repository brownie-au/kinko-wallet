// src/utils/rateLimitNotifier.js
// Tiny pub/sub for global rate-limit notices

const listeners = new Set();
let visible = false;
let message = 'Temporarily rate-limited, retrying…';

export function onRateLimit(cb) {
  listeners.add(cb);
  // push current state
  try { cb(visible, message); } catch {}
  return () => listeners.delete(cb);
}

export function showRateLimitNotice(msg) {
  message = msg || message;
  if (!visible) {
    visible = true;
    for (const cb of listeners) {
      try { cb(true, message); } catch {}
    }
  }
}

export function hideRateLimitNotice() {
  if (visible) {
    visible = false;
    for (const cb of listeners) {
      try { cb(false, message); } catch {}
    }
  }
}

export const rateLimitNotifier = {
  on: onRateLimit,
  show: showRateLimitNotice,
  hide: hideRateLimitNotice
};

