import { useState, Fragment } from 'react';
import Table from 'react-bootstrap/Table';
import Collapse from 'react-bootstrap/Collapse';
import Badge from 'react-bootstrap/Badge';

const short = (v) => (v?.length > 10 ? `${v.slice(0, 6)}…${v.slice(-4)}` : v);

function ChangeCell({ pct }) {
  if (pct == null) return <span className="text-muted">—</span>;
  const up = pct >= 0;
  return (
    <span className={up ? 'text-success' : 'text-danger'}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(2)}%
    </span>
  );
}

function TokenRow({ token, open, onToggle }) {
  return (
    <Fragment>
      <tr className="token-row" onClick={onToggle}>
        <td className="d-flex align-items-center gap-2">
          {token.iconUrl ? (
            <img src={token.iconUrl} alt="" width={22} height={22} style={{ borderRadius: 6, opacity: .95 }} />
          ) : (
            <span className="token-fallback" />
          )}
          <div>
            <div className="fw-semibold">{token.name}</div>
            <div className="text-muted small">{token.symbol}</div>
          </div>
        </td>
        <td>
          {token.priceUSD != null ? (
            <>
              US${token.priceUSD.toLocaleString(undefined, { maximumFractionDigits: 6 })}
              <div className="small"><ChangeCell pct={token.change24hPct} /></div>
            </>
          ) : '—'}
        </td>
        <td>{token.amount?.toLocaleString(undefined, { maximumFractionDigits: 6 }) ?? '—'}</td>
        <td className="text-end fw-semibold">
          {token.valueUSD != null ? `US$${token.valueUSD.toLocaleString()}` : '—'}{' '}
          <span className="ms-1 text-muted">{open ? '▴' : '▾'}</span>
        </td>
      </tr>

      <tr>
        <td colSpan={4} className="p-0">
          <Collapse in={open}>
            <div className="breakdown-row px-3 py-3">
              <div className="text-muted small mb-2">Balance Breakdown</div>
              <div className="d-flex flex-column gap-1">
                {token.breakdown?.length ? token.breakdown.map((b) => (
                  <div key={`${token.symbol}-${b.address}`} className="d-flex w-100">
                    <div className="flex-grow-1">
                      <span className="fw-medium">{b.walletName || short(b.address)}</span>{' '}
                      <Badge bg="secondary" pill>{short(b.address)}</Badge>
                    </div>
                    <div className="text-end flex-shrink-0">
                      <span className="text-muted small me-3">{b.amount?.toLocaleString(undefined, { maximumFractionDigits: 6 })} {token.symbol}</span>
                      <span className="fw-semibold">US${b.valueUSD?.toLocaleString()}</span>
                    </div>
                  </div>
                )) : (
                  <div className="text-muted">No breakdown data.</div>
                )}
              </div>
            </div>
          </Collapse>
        </td>
      </tr>
    </Fragment>
  );
}

export default function TokenList({ tokens }) {
  const [openId, setOpenId] = useState(null);
  const toggle = (id) => setOpenId((prev) => (prev === id ? null : id));

  return (
    <div className="portfolio-table table-responsive">
      <Table variant="dark" hover className="align-middle mb-0">
        <thead className="bg-dark">
          <tr>
            <th style={{ width: '38%' }}>Token</th>
            <th style={{ width: '22%' }}>Price</th>
            <th style={{ width: '20%' }}>Amount</th>
            <th className="text-end" style={{ width: '20%' }}>Value</th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((t) => (
            <TokenRow
              key={t.id || t.symbol}
              token={t}
              open={openId === (t.id || t.symbol)}
              onToggle={() => toggle(t.id || t.symbol)}
            />
          ))}
        </tbody>
      </Table>
    </div>
  );
}
