import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, Table, Spinner } from 'react-bootstrap';
import { getNativeBalance, getTokenBalances } from '../../services/moralisService';

export default function WalletDetail() {
  const { address = "" } = useParams();
  const [tokens, setTokens] = useState([]);
  const [native, setNative] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    Promise.all([
      getNativeBalance(address),
      getTokenBalances(address)
    ])
      .then(([nativeBalance, tokenList]) => {
        setNative(nativeBalance);
        setTokens(tokenList);
      })
      .catch(() => {
        setNative(null);
        setTokens([]);
      })
      .finally(() => setLoading(false));
  }, [address]);

  return (
    <div className="container-fluid px-0">
      <h2 style={{ fontWeight: 600, letterSpacing: 1, marginBottom: 8 }}>Ethereum Wallet</h2>
      <div style={{ fontSize: 14, color: '#888', marginBottom: 18, wordBreak: "break-all" }}>
        {address}
      </div>

      <div style={{
        fontSize: 18,
        fontWeight: 500,
        marginBottom: 16,
        color: 'var(--bs-primary, #35a0f4)'
      }}>
        {loading
          ? <Spinner size="sm" />
          : native !== null
            ? `${native.toLocaleString(undefined, { maximumFractionDigits: 6 })} ETH`
            : '—'}
      </div>

      <Card className="mb-4" style={{ background: 'var(--bs-card-bg, #23272b)' }}>
        <Card.Body className="p-0">
          {loading ? (
            <div className="d-flex justify-content-center align-items-center" style={{ height: 120 }}>
              <Spinner animation="border" role="status" />
            </div>
          ) : (
            <Table
              responsive
              className="mb-0"
              variant={document.body.classList.contains('dark') ? 'dark' : ''}
              style={{ minWidth: 700 }}
            >
              <thead>
                <tr>
                  <th>NAME</th>
                  <th style={{ textAlign: "right" }}>AMOUNT</th>
                  <th style={{ textAlign: "right" }}>SYMBOL</th>
                  <th style={{ textAlign: "right" }}>DECIMALS</th>
                  <th>CONTRACT</th>
                </tr>
              </thead>
              <tbody>
                {tokens.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center text-muted">
                      No ETH tokens found for this wallet.
                    </td>
                  </tr>
                ) : (
                  tokens.map(token => (
                    <tr key={token.contractAddress}>
                      <td>{token.name || "-"}</td>
                      <td style={{ textAlign: "right" }}>{parseFloat(token.balance).toLocaleString()}</td>
                      <td style={{ textAlign: "right" }}>{token.symbol}</td>
                      <td style={{ textAlign: "right" }}>{token.decimals}</td>
                      <td style={{ fontSize: 12, wordBreak: "break-all" }}>{token.contractAddress}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>
    </div>
  );
}
