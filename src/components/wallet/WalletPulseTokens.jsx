// src/components/wallet/WalletPulseTokens.jsx
import { useEffect, useState } from 'react';
import { fetchPulsechainTokens } from '@/services/pulsechainService';

const CHIP_KEY = 'kinko.wallet.chainChip'; // persists across navigation

export default function WalletPulseTokens({ address }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chip, setChip] = useState(() => localStorage.getItem(CHIP_KEY) || 'all');

  useEffect(() => { localStorage.setItem(CHIP_KEY, chip); }, [chip]);

  async function loadTokens(force = false) {
    if (!address) return;
    setLoading(true);
    try {
      const data = await fetchPulsechainTokens(address, { force }); // ← uses 10-min cache
      setRows(data);
    } finally {
      setLoading(false);
    }
  }

  // load on mount + when the wallet address changes
  useEffect(() => { loadTokens(false); }, [address]);

  return (
    <div>
      <div className="toolbar">
        <div className="chips">
          <button className={chip==='all'?'active':''}        onClick={() => setChip('all')}>All</button>
          <button className={chip==='ethereum'?'active':''}   onClick={() => setChip('ethereum')}>Ethereum</button>
          <button className={chip==='pulsechain'?'active':''} onClick={() => setChip('pulsechain')}>PulseChain</button>
          <button className={chip==='base'?'active':''}       onClick={() => setChip('base')}>Base</button>
        </div>
        <button onClick={() => loadTokens(true)}>Refresh</button>
      </div>

      {loading ? (
        <div>Loading PRC-20…</div>
      ) : (
        <table className="tokens">
          {/* render your rows here */}
          <thead><tr><th>Token</th><th>Price</th><th>Amount</th><th>Value</th><th>Contract</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.address}-${i}`}>
                <td>{r.symbol}</td>
                <td>{r.price ? `$${r.price.toFixed(4)}` : 'US$0.00'}</td>
                <td>{r.amount ?? r.balance}</td>
                <td>{r.value ? `$${r.value.toFixed(2)}` : 'US$0.00'}</td>
                <td>{r.address === 'native' ? 'native' : r.address}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
