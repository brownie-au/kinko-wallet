/* eslint-disable import/no-relative-parent-imports */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Form, Button } from 'react-bootstrap';

import { useWallets } from '../../../contexts/WalletContext.jsx';
import useTxHistory from '../../../hooks/useTxHistory.js';
import { ChainSelector, ChainBadge } from '../../../components/ChainUI';
import TokenLogo from '../../../components/TokenLogo';
import DataClient from '../../../data/dataClient';
import { startOrchestrator } from '../../../data/orchestrator';
import { getSnapshot, putSnapshot, getMeta, putMeta, mergeRows, getPriceCached, putPriceCached } from '../../../utils/txCache';

const chainIdOf = (chain) => {
  switch (String(chain || '').toLowerCase()) {
    case 'pulse': return 369;
    case 'bsc': return 56;
    case 'polygon': return 137;
    case 'base': return 8453;
    case 'eth':
    case 'ethereum':
    default: return 1;
  }
};

function fmtDate(val) {
  try {
    if (typeof val === 'number') return new Date(val * 1000).toLocaleString();
    const t = Date.parse(val);
    if (!Number.isNaN(t)) return new Date(t).toLocaleString();
    const n = Number(val);
    return new Date((Number.isFinite(n) ? n : 0) * 1000).toLocaleString();
  } catch { return '-'; }
}
function shortAddr(a) { return a ? `${a.slice(0, 6)}...${a.slice(-4)}` : ''; }
function toUsd(n) {
  const x = Number(n) || 0;
  return `USD $${x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function feeNative(chain, feeWeiLike) {
  try {
    const sym = chain === 'pulse' ? 'PLS' : chain === 'bsc' ? 'BNB' : chain === 'polygon' ? 'MATIC' : 'ETH';
    const n = BigInt(feeWeiLike || '0');
    const whole = Number(n) / 1e18;
    return `${whole.toFixed(6)} ${sym}`;
  } catch { return ''; }
}

function exportCsv(rows) {
  const hdr = ['date', 'chain', 'type', 'token', 'amount', 'from', 'to', 'tx'];
  const lines = [hdr.join(',')];
  for (const r of rows) {
    const date = fmtDate(r.timeStamp).replace(/,/g, '');
    const type = r.kind === 'erc20' ? (r.direction === 'in' ? 'receive' : 'send') : (r.class || 'tx');
    const token = r.token?.symbol || '';
    const amount = r.amount != null ? String(r.amount) : '';
    lines.push([date, r.chain, type, token, amount, r.from || '', r.to || '', r.hash]
      .map((v) => `"${String(v || '').replace(/"/g, '""')}"`).join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'kinko-transactions.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function TransactionHistoryCard() {
  let ctx; try { ctx = useWallets(); } catch { ctx = undefined; }
  const fromCtx = Array.isArray(ctx?.wallets) ? ctx.wallets : [];
  const fromLS = (() => { try { return JSON.parse(localStorage.getItem('wallets') || '[]'); } catch { return []; } })();
  const wallets = (fromCtx.length ? fromCtx : fromLS);

  const [chain, setChain] = useState('all');
  const [q, setQ] = useState('');
  const [days, setDays] = useState(180);
  const [page, setPage] = useState(1);

  // Keep hook for compatibility, but disable auto network bootstrapping.
  useTxHistory({ wallets, chain, days, page, options: { disableAutoBootstrap: true } });
  const [rows, setRows] = useState([]);
  const [walletFilter, setWalletFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fromCache, setFromCache] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(0);
  const [syncWarn, setSyncWarn] = useState('');
  const deltaRef = useRef(false);
  const pollRef = useRef(null);
  const [deltaBump, setDeltaBump] = useState(0);

  useEffect(() => { try { startOrchestrator(); } catch { } }, []);

  const CHAINS = ['eth', 'pulse', 'bsc', 'polygon', 'base'];
  const effectiveChains = useMemo(() => (chain === 'all' ? CHAINS : [String(chain).toLowerCase()]), [chain]);
  const walletsByFilter = useMemo(() => {
    const list = Array.isArray(wallets) ? wallets : [];
    if (walletFilter === 'all') return list;
    return list.filter((w) => (w.address || '').toLowerCase() === String(walletFilter || '').toLowerCase());
  }, [wallets, walletFilter]);

  // First paint from cache
  useEffect(() => {
    let dead = false;
    const run = async () => {
      setError('');
      try {
        const parts = [];
        for (const c of effectiveChains) {
          for (const w of walletsByFilter) {
            const addr = (w.address || '').toLowerCase();
            if (!addr) continue;
            parts.push((async () => {
              const [snap, meta] = await Promise.all([
                getSnapshot(c, addr, days),
                getMeta(c, addr)
              ]);
              return { rows: Array.isArray(snap) ? snap : [], meta };
            })());
          }
        }
        const chunks = await Promise.all(parts);
        let merged = [];
        let latest = 0;
        for (const p of chunks) {
          merged = mergeRows(merged, p.rows, { windowDays: days });
          const t = Number(p?.meta?.updatedAt || 0);
          if (t > latest) latest = t;
        }
        if (!dead) {
          setRows(merged);
          setFromCache(true);
          setLastSyncAt(latest);
        }
      } catch (e) {
        if (!dead) setError(e?.message || 'Failed to load cache');
      }
    };
    run();
    return () => { dead = true; };
  }, [effectiveChains.join(','), walletsByFilter.map((w) => (w.address || '').toLowerCase()).join(','), days]);

  // Delta fetching: head-only page fetch for each (chain,wallet), then merge into cache
  useEffect(() => {
    let dead = false;
    const runDelta = async () => {
      if (dead) return;
      if (deltaRef.current) return;
      deltaRef.current = true;
      setLoading(true);
      setSyncWarn('');
      try {
        // unique pairs
        const uniq = new Set();
        const pairs = [];
        for (const c of effectiveChains) {
          for (const w of walletsByFilter) {
            const a = (w.address || '').toLowerCase();
            if (!a) continue;
            const k = `${c}:${a}`;
            if (uniq.has(k)) continue;
            uniq.add(k);
            pairs.push({ c, a });
          }
        }

        const bases = {
          eth: 'https://api.etherscan.io/api',
          bsc: 'https://api.bscscan.com/api',
          polygon: 'https://api.polygonscan.com/api',
          base: 'https://api.basescan.org/api',
          pulse: 'https://api.scan.pulsechain.com/api'
        };
        const hosts = {
          eth: 'https://etherscan.io',
          bsc: 'https://bscscan.com',
          polygon: 'https://polygonscan.com',
          base: 'https://basescan.org',
          pulse: 'https://scan.pulsechain.com'
        };
        const getKey = (c) => {
          try {
            return localStorage.getItem(`kw:explorerKey:${c}`) || import.meta.env[`VITE_${c.toUpperCase()}SCAN_KEY`] || import.meta.env[`VITE_${c.toUpperCase()}ERSCAN_KEY`] || '';
          } catch { return ''; }
        };

        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const backoff = async (fn, retries = 3) => {
          let i = 0; let last;
          const waits = [300, 700, 1500];
          for (;;) {
            try { return await fn(); } catch (e) {
              last = e;
              if (i >= retries) throw last;
              await sleep(waits[Math.min(i, waits.length - 1)]);
              i += 1;
            }
          }
        };
        async function fetchJson(url) {
          const r = await fetch(url);
          if (!r.ok) {
            const err = new Error(`HTTP ${r.status}`);
            err.status = r.status;
            throw err;
          }
          return r.json();
        }

        async function fetchDeltaFor(c, a) {
          const base = bases[c];
          if (!base) return { items: [], lastSeenTimestamp: 0 };
          const host = hosts[c];
          const key = getKey(c);
          const mk = (action) => `${base}?module=account&action=${action}&address=${a}&page=1&offset=50&sort=desc${key ? `&apikey=${encodeURIComponent(key)}` : ''}`;
          const [meta, snap] = await Promise.all([getMeta(c, a), getSnapshot(c, a, days)]);
          let sinceTs = Number(meta?.lastSeenTimestamp || 0);
          if (!sinceTs && Array.isArray(snap) && snap.length) sinceTs = Number(snap[0]?.timeStamp || 0);
          const all = [];
          // native
          try {
            const j = await backoff(() => fetchJson(mk('txlist')));
            const list = Array.isArray(j?.result) ? j.result : [];
            for (const t of list) {
              const ts = Number(t.timeStamp || 0);
              if (!ts) continue;
              all.push({
                chain: c,
                kind: 'native',
                hash: t.hash,
                timeStamp: ts,
                from: t.from,
                to: t.to,
                amount: Number(t.value || 0) / 1e18,
                feeWei: (() => { try { return String((BigInt(t.gasUsed||0) * BigInt(t.gasPrice||0))); } catch { return '0'; } })(),
                explorer: host ? `${host}/tx/${t.hash}` : undefined
              });
            }
          } catch {}
          // erc20
          try {
            const j = await backoff(() => fetchJson(mk('tokentx')));
            const list = Array.isArray(j?.result) ? j.result : [];
            for (const t of list) {
              const ts = Number(t.timeStamp || 0);
              if (!ts) continue;
              const dec = Number(t.tokenDecimal || 18);
              const amt = Number(t.value || 0) / (10 ** (Number.isFinite(dec) ? dec : 18));
              all.push({
                chain: c,
                kind: 'erc20',
                hash: t.hash,
                timeStamp: ts,
                from: t.from,
                to: t.to,
                amount: amt,
                token: { symbol: t.tokenSymbol || '', address: t.contractAddress },
                explorer: host ? `${host}/tx/${t.hash}` : undefined
              });
            }
          } catch {}
          const minTs = Math.floor(Date.now() / 1000) - Number(days || 180) * 24 * 60 * 60;
          const fresh = all.filter((it) => (Number(it.timeStamp || 0) > Number(sinceTs || 0)) && (Number(it.timeStamp || 0) >= minTs));
          const merged = mergeRows(snap, fresh, { windowDays: days });
          const lastSeenTimestamp = merged.length ? Number(merged[0].timeStamp || 0) : Number(sinceTs || 0);
          await putSnapshot(c, a, merged, { lastSeenTimestamp }, days);
          return { items: fresh, lastSeenTimestamp };
        }

        // small concurrency pool
        const MAX_C = 3;
        let i = 0;
        const results = [];
        async function worker() {
          while (i < pairs.length) {
            const cur = pairs[i++];
            try { results.push(await fetchDeltaFor(cur.c, cur.a)); } catch (e) { setSyncWarn('Some networks throttled; retrying later'); }
          }
        }
        const workers = Array.from({ length: Math.min(MAX_C, pairs.length) }, () => worker());
        await Promise.all(workers);

        // Rebuild merged view from snapshots
        const parts = await Promise.all(pairs.map(async ({ c, a }) => ({ rows: await getSnapshot(c, a, days), meta: await getMeta(c, a) })));
        let mergedAll = [];
        let latest = 0;
        for (const p of parts) {
          mergedAll = mergeRows(mergedAll, p.rows, { windowDays: days });
          const t = Number(p?.meta?.updatedAt || 0);
          if (t > latest) latest = t;
        }
        if (!dead) {
          setRows(mergedAll);
          setFromCache(false);
          setLastSyncAt(latest || Date.now());
        }
      } catch (e) {
        if (!dead) { setError(e?.message || 'Sync failed'); setSyncWarn('Sync error; showing cached data'); }
      } finally {
        if (!dead) setLoading(false);
        deltaRef.current = false;
      }
    };

    // run immediately, then poll every 10 minutes
    runDelta();
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(runDelta, 10 * 60 * 1000);
    return () => { dead = true; if (pollRef.current) clearInterval(pollRef.current); };
  }, [effectiveChains.join(','), walletsByFilter.map((w) => (w.address || '').toLowerCase()).join(','), days, deltaBump]);

  // Debounce search to avoid extra price fetches
  const [dq, setDq] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDq((q || '').trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const filtered = useMemo(() => {
    const s = dq;
    const base = (() => {
      if (walletFilter === 'all') return rows;
      const want = String(walletFilter || '').toLowerCase();
      return rows.filter((r) => {
        const from = String(r.from || '').toLowerCase();
        const to = String(r.to || '').toLowerCase();
        return from === want || to === want;
      });
    })();
    if (!s) return base;
    return base.filter((r) =>
      (r.token?.symbol || '').toLowerCase().includes(s) ||
      (r.hash || '').toLowerCase().includes(s) ||
      (r.from || '').toLowerCase().includes(s) ||
      (r.to || '').toLowerCase().includes(s)
    );
  }, [rows, dq, walletFilter]);

  const [usdByKey, setUsdByKey] = useState(new Map());
  useEffect(() => {
    let dead = false;
    const run = async () => {
      try {
        const wantChains = new Set();
        const wantContractsByChain = new Map();
        for (const r of filtered) {
          const c = String(r.chain || '').toLowerCase();
          wantChains.add(c);
          const addr = r.token?.address;
          if (r.kind === 'erc20' && addr) {
            const set = wantContractsByChain.get(c) || new Set();
            set.add(addr.toLowerCase());
            wantContractsByChain.set(c, set);
          }
        }
        const next = new Map(usdByKey);
        await Promise.all(Array.from(wantChains).map(async (c) => {
          try {
            const p = await DataClient.getPrice(c);
            const usd = Number(p?.usd || 0);
            if (usd > 0) next.set(`${c}:native`, usd);
          } catch { }
        }));
        for (const [c, addrs] of wantContractsByChain.entries()) {
          const list = Array.from(addrs);
          for (let i = 0; i < list.length; i += 25) {
            const batch = list.slice(i, i + 25);
            try {
              const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${batch.join(',')}`);
              if (!r.ok) continue;
              const j = await r.json();
              const pairs = Array.isArray(j?.pairs) ? j.pairs : [];
              const byAddr = new Map();
              for (const p of pairs) {
                const addr = (p?.baseToken?.address || '').toLowerCase();
                const liq = Number(p?.liquidity?.usd || 0);
                const prev = byAddr.get(addr);
                if (!prev || liq > prev.liq) byAddr.set(addr, { liq, usd: Number(p?.priceUsd || 0) });
              }
              for (const a of batch) {
                const info = byAddr.get(a.toLowerCase());
                const usd = Number(info?.usd || 0);
                if (usd > 0) next.set(`${c}:${a.toLowerCase()}`, usd);
              }
            } catch { }
          }
        }
        if (!dead) setUsdByKey(next);
      } catch { }
    };
    if (filtered.length) run();
    return () => { dead = true; };
  }, [filtered.map(r => `${r.chain}|${r.kind}|${r.token?.address || 'native'}`).join(',')]);

  const nameByAddr = useMemo(() => {
    const m = new Map();
    try {
      for (const w of wallets || []) {
        const a = (w.address || '').toLowerCase();
        if (a) m.set(a, (w.name || '').trim());
      }
    } catch { }
    return m;
  }, [wallets]);

  const copyToClipboard = (text) => {
    try { navigator.clipboard.writeText(String(text || '')); } catch { }
  };

  const summary = useMemo(() => {
    const byDay = new Map();
    for (const r of rows) {
      const d = new Date((r.timeStamp || 0) * 1000);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      byDay.set(k, (byDay.get(k) || 0) + 1);
    }
    const daysArr = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
    const total = rows.length;
    const last7 = daysArr.slice(0, 7).reduce((s, [, n]) => s + n, 0);
    return { total, last7 };
  }, [rows]);

  return (
    <Card className="shadow-sm">
      <Card.Header>
        <div className="d-flex align-items-center justify-content-between">
          <div>
            <h5 className="mb-0">Transaction History {fromCache ? <span className="badge bg-secondary ms-2">cached</span> : null}</h5>
            <small className="text-muted">Last {days} days · {summary.total} tx · {summary.last7} in last 7 days</small>
            <div className="text-muted small">
              Loaded from cache · Last sync: {lastSyncAt ? `${Math.max(0, Math.floor((Date.now() - lastSyncAt) / 1000))}s ago` : 'never'} · Auto-refresh: every 10 min
              {syncWarn ? <span className="ms-2 badge bg-warning text-dark">{syncWarn}</span> : null}
            </div>
          </div>
          <div className="d-flex align-items-center gap-2">
            <Form.Select
              size="sm"
              value={days}
              onChange={(e) => { setPage(1); setDays(Number(e.target.value) || 30); }}
              style={{ width: 120 }}
            >
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
              <option value={180}>180 days</option>
            </Form.Select>
            <ChainSelector value={chain} onChange={(v) => { setPage(1); setChain(v); }} />
            <Button size="sm" variant="outline-secondary" onClick={() => setDeltaBump((n) => n + 1)} disabled={loading}>Refresh</Button>
          </div>
        </div>
      </Card.Header>
      <Card.Body className="p-0">
        <div className="p-3 d-flex justify-content-between align-items-center flex-wrap gap-2">
          <div className="d-flex align-items-center gap-2">
            <Form.Select
              size="sm"
              value={walletFilter}
              onChange={(e) => setWalletFilter(e.target.value)}
              style={{ width: 200 }}
            >
              <option value="all">All wallets</option>
              {wallets.map((w) => (
                <option key={w.address} value={(w.address || '').toLowerCase()}>
                  {w.name || 'Wallet'} ({shortAddr((w.address || '').toLowerCase())})
                </option>
              ))}
            </Form.Select>
            <Form.Control
              placeholder="Search token, address, hash"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ maxWidth: 360 }}
            />
          </div>
          <div className="d-flex align-items-center gap-2">
            <Button size="sm" variant="outline-secondary" onClick={() => exportCsv(filtered)} disabled={!filtered.length}>
              Export CSV
            </Button>
            <Button size="sm" variant="outline-secondary" onClick={() => setPage((p) => p + 1)} disabled={loading}>
              Load more
            </Button>
          </div>
        </div>

        <div className="table-responsive">
          <table className="table table-hover mb-0 align-middle">
            <thead className="sticky-top" style={{ position: 'sticky', top: 0 }}>
              <tr>
                <th style={{ width: '18%' }}>Date</th>
                <th style={{ width: '10%' }}>Type</th>
                <th style={{ width: '18%' }}>Token</th>
                <th style={{ width: '12%' }} className="text-end">Amount</th>
                <th style={{ width: '12%' }}>From</th>
                <th style={{ width: '12%' }}>To</th>
                <th style={{ width: '10%' }} className="text-end">Fee</th>
                <th style={{ width: '8%' }}>Link</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={8} className="py-4 text-center text-muted">Loading…</td></tr>
              )}
              {!loading && !error && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-4 text-center text-muted">
                    {walletFilter !== 'all' ? 'No transactions for this wallet' : (fromCache ? 'No transactions' : 'No transactions (offline/cache empty)')}
                  </td>
                </tr>
              )}
              {!loading && error && (
                <tr><td colSpan={8} className="py-4 text-center text-danger">{error}</td></tr>
              )}
              {!loading && !error && filtered.map((r, i) => {
                const type = r.type || (r.kind === 'erc20' ? 'erc20' : 'native');
                const fromName = nameByAddr.get((r.from || '').toLowerCase()) || 'External';
                const toName = nameByAddr.get((r.to || '').toLowerCase()) || 'External';

                return (
                  <tr key={`${r.hash}-${i}`}>
                    <td>
                      {fmtDate(r.date || r.timeStamp)}
                      <div className="mt-1"><ChainBadge chain={r.chain} /></div>
                    </td>
                    <td>
                      <span className="badge bg-secondary text-uppercase">{String(type).toUpperCase()}</span>
                    </td>
                    <td>
                      <div className="d-flex align-items-center gap-2">
                        <TokenLogo chainId={chainIdOf(r.chain)} address={r.token?.address} size={20} />
                        <span>{r.token?.symbol || (type === 'native' ? 'NATIVE' : '')}</span>
                      </div>
                    </td>
                    <td className="text-end">
                      {r.amount != null ? r.amount : ''}
                      {(() => {
                        try {
                          const c = r.kind === 'erc20' && r.token?.address
                            ? `${String(r.chain).toLowerCase()}:${String(r.token.address).toLowerCase()}`
                            : `${String(r.chain).toLowerCase()}:native`;
                          const p = usdByKey.get(c) || 0;
                          const val = (Number(r.amount) || 0) * Number(p || 0);
                          return val ? <div className="text-muted small">{toUsd(val)}</div> : null;
                        } catch { return null; }
                      })()}
                    </td>
                    {/* From */}
                    <td style={{ fontFamily: 'monospace' }}>
                      <div className="text-muted small">{fromName}</div>
                      <div
                        role="button"
                        onClick={() => copyToClipboard(r.from)}
                        title={fromName}
                        style={{ cursor: 'pointer' }}
                      >
                        {shortAddr(r.from)}
                      </div>
                    </td>
                    {/* To */}
                    <td style={{ fontFamily: 'monospace' }}>
                      <div className="text-muted small">{toName}</div>
                      <div
                        role="button"
                        onClick={() => copyToClipboard(r.to)}
                        title={toName}
                        style={{ cursor: 'pointer' }}
                      >
                        {shortAddr(r.to)}
                      </div>
                    </td>
                    <td className="text-end">
                      {type === 'native' ? feeNative(r.chain, r.fee || r.feeWei) : ''}
                      {(() => {
                        try {
                          if (type !== 'native') return null;
                          const weiStr = String(r.fee || r.feeWei || '0');
                          const feeNativeAmt = Number(weiStr) / 1e18;
                          const price = Number(usdByKey.get(`${String(r.chain).toLowerCase()}:native`) || 0);
                          const usd = feeNativeAmt * price;
                          return usd ? <div className="text-muted small">{toUsd(usd)}</div> : null;
                        } catch { return null; }
                      })()}
                    </td>
                    <td>
                      <a href={r.link || r.explorer} target="_blank" rel="noreferrer">🔗 View ↗</a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card.Body>
    </Card>
  );
}
