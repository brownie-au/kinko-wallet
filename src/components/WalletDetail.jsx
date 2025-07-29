import React, { useState, useEffect } from 'react';
import { Button, Badge, Table } from 'react-bootstrap';
import { useParams } from 'react-router-dom';
import { FiCopy, FiGrid, FiEye, FiEyeOff } from 'react-icons/fi';
import { fetchPulsechainTokens } from '../api/pulsechain';
import { getPLSBalance, getTokenBalances, getTokenPrices } from '../services/pulsechainService';

const WalletDetail = () => {
  const { address } = useParams();

  const [walletName, setWalletName] = useState('Unknown Wallet');
  const [activeNetworks, setActiveNetworks] = useState([]);
  const [privacy, setPrivacy] = useState(false);
  const [tokens, setTokens] = useState([]);

  // === Environment flag for Live API ===
  const useLiveAPI = import.meta.env.VITE_USE_LIVE_API === 'true';

  // --- Load wallet name ---
  useEffect(() => {
    const savedWallets = JSON.parse(localStorage.getItem('wallets') || '[]');
    const wallet = savedWallets.find(
      (w) => w.address.toLowerCase() === address.toLowerCase()
    );
    if (wallet) {
      setWalletName(wallet.name || `Wallet ${address.slice(0, 6)}...${address.slice(-4)}`);
    }
  }, [address]);

  // --- Load tokens: Mock or Live API ---
  useEffect(() => {
    if (useLiveAPI) {
      fetchPulsechainTokens(address)
        .then(setTokens)
        .catch((err) => console.error('Error fetching tokens:', err));
    } else {
      import('../mock/pulsechain-wallet.json')
        .then((data) => setTokens(data.default || []))
        .catch((err) => console.error('Error loading mock tokens:', err));
    }
  }, [address, useLiveAPI]);

  const formatValue = (value) => (privacy ? '****' : `$${value.toLocaleString()}`);
  const toggleNetwork = (network) => {
    setActiveNetworks((prev) =>
      prev.includes(network) ? prev.filter((n) => n !== network) : [...prev, network]
    );
  };

  return (
    <div className="p-4" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="fw-bold mb-1">{walletName}</h2>
          <div className="d-flex align-items-center text-muted" style={{ fontSize: '0.9rem' }}>
            {address}
            <Button
              size="sm"
              variant="link"
              className="ms-2 p-0"
              onClick={() => navigator.clipboard.writeText(address)}
            >
              <FiCopy />
            </Button>
          </div>
        </div>
        <div className="d-flex gap-3 align-items-center">
          <Button variant="outline-secondary" className="rounded-circle p-2">
            <FiGrid />
          </Button>
          <Button
            variant="outline-secondary"
            className="rounded-circle p-2"
            onClick={() => setPrivacy(!privacy)}
          >
            {privacy ? <FiEyeOff /> : <FiEye />}
          </Button>
          <h2 className="mb-0 fw-bold" style={{ fontSize: '2rem' }}>
            {formatValue(11555)}
          </h2>
        </div>
      </div>

      {/* Active Networks */}
      <div className="mb-3">
        {['PulseChain', 'Ethereum', 'Base'].map((net) => (
          <Badge
            key={net}
            bg={activeNetworks.includes(net) ? 'primary' : 'secondary'}
            className="me-2 px-3 py-2"
            style={{ cursor: 'pointer', borderRadius: '20px', fontSize: '0.85rem' }}
            onClick={() => toggleNetwork(net)}
          >
            {net}
          </Badge>
        ))}
      </div>

      {/* Token Table */}
      <Table striped bordered hover variant="dark" className="rounded">
        <thead style={{ background: '#1e1e1e' }}>
          <tr>
            <th>Token</th>
            <th>Price</th>
            <th>Amount</th>
            <th>Value</th>
            <th>24h</th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((token, idx) => (
            <tr key={idx}>
              <td className="fw-semibold">
                {token.symbol} <small className="text-muted">({token.name})</small>
              </td>
              <td>{formatValue(token.price)}</td>
              <td>{privacy ? '****' : token.balance.toLocaleString()}</td>
              <td>{formatValue(token.value)}</td>
              <td style={{ color: token.change24h >= 0 ? 'lime' : 'red' }}>
                {token.change24h.toFixed(2)}%
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
};

export default WalletDetail;
