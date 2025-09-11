// src/sections/dashboard/history/TransactionHistoryCard.jsx
/* eslint-disable import/no-relative-parent-imports */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Row, Col, Form, Button } from 'react-bootstrap';

import { useWallets } from '../../../contexts/WalletContext.jsx';
import useTxHistory from '../../../hooks/useTxHistory.js';
import { ChainSelector, ChainBadge } from '../../../components/ChainUI';
import TokenLogo from '../../../components/TokenLogo';
import DataClient from '../../../data/dataClient';
import { startOrchestrator } from '../../../data/orchestrator';

const CHAINS = ['all', 'eth', 'pulse', 'bsc', 'polygon', 'base'];

// helper to translate chain code -> numeric chainId for TokenLogo
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
  const hdr = ['date','chain','type','token','amount','from','to','tx'];
  const lines = [hdr.join(',')];
  for (const r of rows) {
    const date = fmtDate(r.timeStamp).replace(/,/g, '');
    const type = r.kind === 'erc20' ? (r.direction === 'in' ? 'receive' : 'send') : (r.class || 'tx');
    const token = r.token?.symbol || '';
    const amount = r.amount != null ? String(r.amount) : '';
    lines.push([date, r.chain, type, token, amount, r.from || '', r.to || '', r.hash].map((v) => `"${String(v || '').replace(/"/g, '""')}"`).join(','));
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
  const [days, setDays] = useState(30);
  const [page, setPage] = useState(1);
  // data comes from centralized client/cache layer
  const { rows: mergedRows, loading, error, refreshNow } = useTxHistory({ wallets, chain, days, page });
  const [rows, setRows] = useState([]);
  const [walletFilter, setWalletFilter] = useState('all');
  const abortRef = useRef({ dead: false });

  const chainsParam = useMemo(() => (chain === 'all' ? ['eth','pulse','bsc','polygon','base'] : [chain]), [chain]);

  useEffect(() => { try { startOrchestrator(); } catch {} setRows(mergedRows || []); }, [mergedRows]);

  const filtered = useMemo(() => {
    const s = (q || '').trim().toLowerCase();
    const base = walletFilter === 'all' ? rows : rows.filter((r) => (r.wallet || '').toLowerCase() === walletFilter);
    if (!s) return base;
    return base.filter((r) =>
      (r.token?.symbol || '').toLowerCase().includes(s) ||
      (r.hash || '').toLowerCase().includes(s) ||
      (r.from || '').toLowerCase().includes(s) ||
      (r.to || '').toLowerCase().includes(s)
    );
  }, [rows, q, walletFilter]);

  // ---------- USD pricing (native via DataClient.getPrice; ERC-20 via Dexscreener) ----------
  const [usdByKey, setUsdByKey] = useState(new Map()); // key: `${chain}:${addrOrNative}` -> priceUSD
  useEffect(() => {
    let dead = false;
    const run = async () => {
      try {
        // collect requirements from current filtered set
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

        // native prices per chain
        await Promise.all(Array.from(wantChains).map(async (c) => {
          try {
            const p = await DataClient.getPrice(c);
            const usd = Number(p?.usd || 0);
            if (usd > 0) next.set(`${c}:native`, usd);
          } catch {}
        }));

        // ERC-20 prices via Dexscreener batch
        for (const [c, addrs] of wantContractsByChain.entries()) {
          const list = Array.from(addrs);
          for (let i = 0; i < list.length; i += 25) {
            const batch = list.slice(i, i + 25);
            try {
              const url = `https://api.dexscreener.com/latest/dex/tokens/${batch.join(',')}`;
              const r = await fetch(url);
              if (!r.ok) continue;
              const j = await r.json();
              const pairs = Array.isArray(j?.pairs) ? j.pairs : [];
              // choose highest liquidity per token
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
            } catch {}
          }
        }

        if (!dead) setUsdByKey(next);
      } catch {}
    };
    if (filtered.length) run();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered.map(r => `${r.chain}|${r.kind}|${r.token?.address||'native'}`).join(',')]);

  // ---- address helpers: copy + wallet names ----
  const nameByAddr = useMemo(() => {
    const m = new Map();
    try {
      for (const w of wallets || []) {
        const a = (w.address || '').toLowerCase();
        if (a) m.set(a, (w.name || '').trim());
      }
    } catch {}
    return m;
  }, [wallets]);

  const copyToClipboard = (text) => {
    try { navigator.clipboard.writeText(text); } catch {}
  };

  // Summary by day (count of txs)
  const summary = useMemo(() => {
    const byDay = new Map();
    for (const r of rows) {
      const d = new Date((r.timeStamp || 0) * 1000);
      const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      byDay.set(k, (byDay.get(k) || 0) + 1);
    }
    const daysArr = [...byDay.entries()].sort((a,b) => (a[0] < b[0] ? 1 : -1));
    const total = rows.length;
    const last7 = daysArr.slice(0, 7).reduce((s, [,n]) => s + n, 0);
    return { total, last7 };
  }, [rows]);

  return (
    <Card className="shadow-sm">
      <Card.Header>
        <div className="d-flex align-items-center justify-content-between">
          <div>
            <h5 className="mb-0">Transaction History</h5>
            <small className="text-muted">Last {days} days · {summary.total} tx · {summary.last7} in last 7 days</small>
          </div>
          <div className="d-flex align-items-center gap-2">
            <Form.Select size="sm" value={days} onChange={(e) => { setPage(1); setDays(Number(e.target.value)||30); }} style={{ width: 120 }}>
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
              <option value={180}>180 days</option>
            </Form.Select>
            <ChainSelector value={chain} onChange={(v) => { setPage(1); setChain(v); }} />
            <Button size="sm" variant="outline-secondary" onClick={refreshNow} disabled={loading}>Refresh</Button>
          </div>
        </div>
      </Card.Header>
      <Card.Body className="p-0">
        <div className="p-3 d-flex justify-content-between align-items-center flex-wrap gap-2">
          <div className="d-flex align-items-center gap-2">
            <Form.Select size="sm" value={walletFilter} onChange={(e) => setWalletFilter(e.target.value)} style={{ width: 200 }}>
              <option value="all">All wallets</option>
              {wallets.map((w) => (
                <option key={w.address} value={(w.address || '').toLowerCase()}>{w.name || 'Wallet'} ({shortAddr((w.address||'').toLowerCase())})</option>
              ))}
            </Form.Select>
            <Form.Control placeholder="Search token, address, hash" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 360 }} />
          </div>
          <div className="d-flex align-items-center gap-2">
            <Button size="sm" variant="outline-secondary" onClick={() => exportCsv(filtered)} disabled={!filtered.length}>Export CSV</Button>
            <Button size="sm" variant="outline-secondary" onClick={() => setPage((p) => p + 1)} disabled={loading}>Load more</Button>
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
                <th style={{ width: '24%' }}>From → To</th>
                <th style={{ width: '10%' }} className="text-end">Fee</th>
                <th style={{ width: '8%' }}>Link</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="py-4 text-center text-muted">Loading…</td></tr>
              )}
              {!loading && !error && filtered.length === 0 && (
                <tr><td colSpan={6} className="py-4 text-center text-muted">No transactions</td></tr>
              )}
              {!loading && error && (
                <tr><td colSpan={6} className="py-4 text-center text-danger">{error}</td></tr>
              )}
              {!loading && !error && filtered.map((r, i) => {
                const type = r.type || (r.kind === 'erc20' ? 'erc20' : 'native');
                return (
                  <tr key={`${r.hash}-${i}`}>
                    <td>{fmtDate(r.date || r.timeStamp)}<div className="mt-1"><ChainBadge chain={r.chain} /></div></td>
                    <td><span className="badge bg-secondary text-uppercase">{String(type).toUpperCase()}</span></td>
                    <td><div className="d-flex align-items-center gap-2"><TokenLogo chainId={chainIdOf(r.chain)} address={r.token?.address} size={20} /> <span>{r.token?.symbol || (type === 'native' ? 'NATIVE' : '')}</span></div></td>
                    <td className="text-end">{r.amount != null ? r.amount : ''}{(() => { try { const c = r.kind === 'erc20' && r.token?.address ? `${String(r.chain).toLowerCase()}:${String(r.token.address).toLowerCase()}` : `${String(r.chain).toLowerCase()}:native`; const p = usdByKey.get(c) || 0; const val = (Number(r.amount)||0) * Number(p||0); return val ? <div className="text-muted small">{toUsd(val)}</div> : null; } catch { return null; } })()}</td>
                    <td>
                      <div style={{ fontFamily: 'monospace' }}>{shortAddr(r.from)} → {shortAddr(r.to)}</div>
                    </td>
                    <td className="text-end">
                      {type === 'native' ? feeNative(r.chain, r.fee || r.feeWei) : ''}
                    </td>
                    <td>
                      <a href={r.link || r.explorer} target="_blank" rel="noreferrer">View 🔗↗</a>
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
