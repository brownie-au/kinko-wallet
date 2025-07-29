import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, Table, ButtonGroup, Button, Spinner } from 'react-bootstrap';
import { fetchMoralisTokens } from '../../services/moralisService';

const CHAIN_OPTIONS = [
  { label: 'PulseChain', value: 'pulse' },   // Moralis doesn't support pulse, but add for future
  { label: 'Ethereum', value: 'eth' },
  { label: 'Base', value: 'base' }
];

export default function WalletDetail() {
  const { address = "" } = useParams();
  const [tokens, setTokens] = useState([]);
  const [chain, setChain] = useState('eth');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    fetchMoralisTokens(address, chain)
      .then(setTokens)
      .finally(() => setLoading(false));
  }, [address, chain]);

  return (
    <div className="container-fluid px-0">
      <h2 style={{ fontWeight: 600, letterSpacing: 1 }}>Mine</h2>
      <div style={{ fontSize: 14, color: '#888', marginBottom: 18 }}>
        {address}
      </div>

      {/* Chain selector */}
      <ButtonGroup style={{ marginBottom: 18 }}>
        {CHAIN_OPTIONS.map(opt => (
          <Button
            key={opt.value}
            variant={opt.value === chain ? 'primary' : 'outline-secondary'}
            onClick={() => setChain(opt.value)}
            disabled={opt.value === 'pulse'} // Only allow eth/base for now
          >
            {opt.label}
          </Button>
        ))}
      </ButtonGroup>

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
                  <th>TOKEN</th>
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
                    <td colSpan={6} className="text-center text-muted">
                      No tokens found for this wallet on {CHAIN_OPTIONS.find(o => o.value === chain).label}.
                    </td>
                  </tr>
                ) : (
                  tokens.map(token => (
                    <tr key={token.token_address}>
                      <td>
                        <img
                          src={`https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${token.token_address}/logo.png`}
                          alt=""
                          onError={e => e.target.style.display='none'}
                          style={{ width: 28, height: 28, marginRight: 8, borderRadius: 4, background: "#222" }}
                        />
                      </td>
                      <td>{token.name || "-"}</td>
                      <td style={{ textAlign: "right" }}>{parseFloat(token.balance / 10 ** token.decimals).toLocaleString()}</td>
                      <td style={{ textAlign: "right" }}>{token.symbol}</td>
                      <td style={{ textAlign: "right" }}>{token.decimals}</td>
                      <td style={{ fontSize: 12, wordBreak: "break-all" }}>{token.token_address}</td>
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
