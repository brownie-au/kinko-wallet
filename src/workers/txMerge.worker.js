/* Tiny worker to merge tx rows with dedupe by hash and minimal sorting.
 * Message format: { existing: Row[], incoming: Row[], windowDays?: number }
 * Responds with: { rows: Row[] }
 */

function norm(ts, date) {
  let t = Number(ts || 0);
  if (!t && date) {
    const d = Date.parse(date);
    if (!Number.isNaN(d)) t = Math.floor(d / 1000);
  }
  return t;
}

function merge(existing, incoming, windowDays = 180) {
  const list = [];
  const seen = new Set();
  const add = (arr) => {
    for (const r of Array.isArray(arr) ? arr : []) {
      const h = String(r?.hash || '').toLowerCase();
      if (!h || seen.has(h)) continue;
      const ts = norm(r?.timeStamp, r?.date);
      list.push({ ...r, timeStamp: ts });
      seen.add(h);
    }
  };
  add(incoming);
  add(existing);
  list.sort((a, b) => (Number(b.timeStamp || 0) - Number(a.timeStamp || 0)) || String(b.hash||'').localeCompare(String(a.hash||'')) );
  const minMs = Date.now() - Number(windowDays||180) * 24*60*60*1000;
  return list.filter((r) => Number(r.timeStamp||0)*1000 >= minMs);
}

self.onmessage = (e) => {
  try {
    const { existing = [], incoming = [], windowDays = 180 } = e.data || {};
    const rows = merge(existing, incoming, windowDays);
    self.postMessage({ rows });
  } catch (err) {
    // on error, just echo existing
    self.postMessage({ rows: Array.isArray(e.data?.existing) ? e.data.existing : [] });
  }
};

