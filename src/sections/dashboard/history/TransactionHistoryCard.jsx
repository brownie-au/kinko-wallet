// src/sections/dashboard/history/TransactionHistoryCard.jsx
/* eslint-disable import/no-relative-parent-imports */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Row, Col, Form, Button } from 'react-bootstrap';

import { useWallets } from '../../../contexts/WalletContext.jsx';
import useTxHistory from '../../../hooks/useTxHistory.js';
import { ChainSelector } from '../../../components/ChainUI';

const CHAINS = ['all', 'eth', 'pulse', 'bsc', 'polygon', 'base'];

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
  const { rows: mergedRows, loading, error } = useTxHistory({ wallets, chain, days, page });
  const [rows, setRows] = useState([]);
  const [walletFilter, setWalletFilter] = useState('all');
  const abortRef = useRef({ dead: false });

  const chainsParam = useMemo(() => (chain === 'all' ? ['eth','pulse','bsc','polygon','base'] : [chain]), [chain]);

  useEffect(() => { setRows(mergedRows || []); }, [mergedRows]);

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
                    <td>{fmtDate(r.date || r.timeStamp)}<div className="text-muted" style={{ fontSize: 12 }}>{r.chain}</div></td>
                    <td><span className="badge bg-secondary text-uppercase">{String(type).toUpperCase()}</span></td>
                    <td>{r.token?.symbol || (type === 'native' ? 'NATIVE' : '')}</td>
                    <td className="text-end">{r.amount != null ? r.amount : ''}</td>
                    <td>
                      <div style={{ fontFamily: 'monospace' }}>{shortAddr(r.from)} → {shortAddr(r.to)}</div>
                    </td>
                    <td className="text-end">
                      {type === 'native' ? feeNative(r.chain, r.fee || r.feeWei) : ''}
                    </td>
                    <td>
                      <a href={r.link || r.explorer} target="_blank" rel="noreferrer">View ↗</a>
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
