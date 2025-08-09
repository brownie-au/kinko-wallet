// src/views/portfolio/index.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { getWalletCache } from '../../utils/walletCache'; // <-- reads sticky cache

/* ----------------------------------------------------------------------------
   1) Read wallets from localStorage (supports several keys/shapes)
---------------------------------------------------------------------------- */
const WALLET_STORAGE_KEYS = ['wallets', 'kinko:wallets', 'kinko_wallets', 'portfolio:wallets'];

function getStoredWallets() {
  for (const k of WALLET_STORAGE_KEYS) {
    try {
      const raw = localStorage.getItem(k);
      if (!raw) continue;

      const parsed = JSON.parse(raw);
      // possible shapes: [ {address,name}, ... ] OR { wallets:[...] } OR { someProp:[...] }
      const candidates = [];
      if (Array.isArray(parsed)) candidates.push(parsed);
      else if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.wallets)) candidates.push(parsed.wallets);
        Object.values(parsed).forEach((v) => Array.isArray(v) && candidates.push(v));
      }

      for (const arr of candidates) {
        const list = (arr || [])
          .map((w) => ({
            name: w?.name || w?.label || w?.title || 'Wallet',
            address: w?.address || w?.addr || w?.account || w?.publicKey || w?.public_key || w?.hash || w?.id || w?.wallet,
            chain: w?.chain || 'eth'
          }))
          .filter((w) => w.address);
        if (list.length) return list;
      }
    } catch {
      /* ignore and try next key */
    }
  }
  return [];
}

/* ----------------------------------------------------------------------------
   2) Fetch tokens per wallet (OPTIONAL)
   Leave as-is for now; once you have a real fetcher, return:
   [{ symbol, name, amount, priceUsd, valueUsd }, ...]
---------------------------------------------------------------------------- */
async function fetchTokensForWallet(/* { address, chain } */) {
  // TODO: replace with your real wallet-detail fetcher.
  return [];
}

/* ----------------------------------------------------------------------------
   3) UI bits
---------------------------------------------------------------------------- */
function SummaryBar({ totalUsd = 0, walletCount = 0, change24h = 0 }) {
  return (
    <div
      style={{
        position: 'sticky',
        top: 72,
        zIndex: 10,
        background: 'var(--pc-sidebar-background)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 8,
        padding: '12px 16px',
        marginBottom: 16
      }}
      className="container"
    >
      <div className="d-flex flex-wrap gap-3 align-items-center">
        <strong style={{ fontSize: 18 }}>Total:&nbsp;${totalUsd.toLocaleString()}</strong>
        <span>
          •&nbsp;24h:&nbsp;
          <span style={{ color: change24h >= 0 ? '#16c784' : '#ea3943' }}>
            {change24h >= 0 ? '+' : ''}
            {change24h.toFixed(2)}%
          </span>
        </span>
        <span>•&nbsp;Wallets:&nbsp;{walletCount}</span>
      </div>
    </div>
  );
}

function BreakdownRow({ name, value }) {
  return (
    <div className="d-flex justify-content-between">
      <span className="text-muted">{name}</span>
      <span className="text-muted">{value}</span>
    </div>
  );
}

function TokenRow({ token }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="container"
      style={{
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 10,
        padding: 14,
        marginBottom: 10,
        background: 'rgba(255,255,255,0.02)'
      }}
    >
      <div className="d-flex justify-content-between align-items-center">
        <div className="d-flex align-items-center gap-2">
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(255,255,255,0.08)' }} />
          <div>
            <div style={{ fontWeight: 600 }}>{token.symbol}</div>
            <div className="text-muted" style={{ fontSize: 12 }}>{token.name || token.symbol}</div>
          </div>
        </div>

        <div className="d-flex gap-4">
          <div className="text-end">
            <div className="text-muted" style={{ fontSize: 12 }}>Price</div>
            <div>${(token.priceUsd ?? 0).toLocaleString()}</div>
          </div>
          <div className="text-end">
            <div className="text-muted" style={{ fontSize: 12 }}>Amount</div>
            <div>{(token.amount ?? 0).toLocaleString()}</div>
          </div>
          <div className="text-end">
            <div className="text-muted" style={{ fontSize: 12 }}>Value</div>
            <div>${(token.valueUsd ?? 0).toLocaleString()}</div>
          </div>
          <button className="btn btn-sm btn-outline-secondary" onClick={() => setOpen((v) => !v)}>
            {open ? 'Hide' : 'Expand'}
          </button>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed rgba(255,255,255,0.08)' }}>
          <div className="text-muted mb-2" style={{ fontSize: 12 }}>Balance Breakdown</div>
          {(token.breakdown || []).map((row, i) => (
            <BreakdownRow key={i} name={row.label} value={row.value} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------------
   4) Aggregate tokens across wallets
---------------------------------------------------------------------------- */
function aggregateTokensFromWallets(walletTokensMap) {
  // walletTokensMap: [{ wallet, tokens:[...] }]
  const bySymbol = new Map();

  for (const { wallet, tokens } of walletTokensMap) {
    for (const t of tokens) {
      const key = (t.symbol || '').toUpperCase();
      if (!key) continue;

      if (!bySymbol.has(key)) {
        bySymbol.set(key, {
          symbol: key,
          name: t.name || key,
          priceUsd: t.priceUsd ?? 0,
          amount: 0,
          valueUsd: 0,
          breakdown: []
        });
      }
      const agg = bySymbol.get(key);
      agg.amount += Number(t.amount || 0);
      const value = Number(t.valueUsd ?? (t.amount || 0) * (t.priceUsd || 0));
      agg.valueUsd += value;
      agg.priceUsd = t.priceUsd ?? agg.priceUsd;

      agg.breakdown.push({
        label: wallet.name,
        value: `${(t.amount || 0).toLocaleString()} ${key}`
      });
    }
  }

  return Array.from(bySymbol.values()).sort((a, b) => (b.valueUsd || 0) - (a.valueUsd || 0));
}

/* ----------------------------------------------------------------------------
   5) Page — read sticky cache first, then (optional) background refresh
---------------------------------------------------------------------------- */
export default function PortfolioOverview() {
  const [wallets, setWallets] = useState([]);
  const [tokenRows, setTokenRows] = useState([]);
  const [loading, setLoading] = useState(false);   // shows only during background refresh

  // Load wallet list
  useEffect(() => {
    setWallets(getStoredWallets());
  }, []);

  // Prefill from cache immediately (sticky)
  useEffect(() => {
    if (!wallets.length) {
      setTokenRows([]);
      return;
    }
    const cachedLists = wallets.map((w) => {
      const snap = getWalletCache(w.address);
      return { wallet: w, tokens: snap?.tokens || [] };
    });
    setTokenRows(aggregateTokensFromWallets(cachedLists));
  }, [wallets]);

  // Optional: background refresh using your real fetcher
  useEffect(() => {
    let alive = true;
    async function refresh() {
      if (!wallets.length) return;
      setLoading(true);
      try {
        const lists = await Promise.all(
          wallets.map(async (w) => {
            const tokens = await fetchTokensForWallet(w); // TODO wire this
            return { wallet: w, tokens: tokens || [] };
          })
        );

        // Only replace if we actually fetched something
        const any = lists.some((l) => (l.tokens || []).length);
        if (alive && any) {
          setTokenRows(aggregateTokensFromWallets(lists));
        }
      } catch (e) {
        // background errors can be silent
        console.debug('Portfolio refresh error:', e?.message || e);
      } finally {
        alive && setLoading(false);
      }
    }
    refresh();
    return () => { alive = false; };
  }, [wallets]);

  const totalUsd = useMemo(() => tokenRows.reduce((s, t) => s + (t.valueUsd || 0), 0), [tokenRows]);

  return (
    <div className="py-3">
      <SummaryBar totalUsd={totalUsd} change24h={0.0} walletCount={wallets.length} />

      <div className="container">
        <div className="d-flex align-items-center justify-content-between mb-2">
          <h5 className="mb-0">Top Tokens</h5>
          {loading && <small className="text-muted">Refreshing…</small>}
        </div>

        {tokenRows.length === 0 && !loading && (
          <div className="text-muted">No tokens found for your wallets.</div>
        )}

        {tokenRows.map((t, i) => (
          <TokenRow key={i} token={t} />
        ))}
      </div>
    </div>
  );
}
