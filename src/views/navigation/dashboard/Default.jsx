// src/views/navigation/dashboard/Default.jsx

import Col from 'react-bootstrap/Col';
import Row from 'react-bootstrap/Row';
import { Link } from 'react-router-dom';
import { useWallets } from '../../../contexts/WalletContext';

// ⬇️ Import directly (skip the barrel to avoid path issues)
import PortfolioValueCard from '../../../sections/dashboard/default/PortfolioValueCard';
import PnLCard from '../../../sections/dashboard/default/PnLCard';
import FearGreedCard from '../../../sections/dashboard/default/FearGreedCard';
import TopTokensRow from '../../../sections/dashboard/default/TopTokensRow.jsx';
import TransactionHistoryCard from '../../../sections/dashboard/history/TransactionHistoryCard.jsx';

export default function DefaultPage() {
  const { wallets } = useWallets();
  return (
    <Row>
      <Col xs={12} className="mb-3">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div>
            <h1 className="mb-1">Dashboard</h1>
            <p className="text-muted mb-0">Your watch-only portfolio at a glance. Values in USD.</p>
          </div>
          <Link className="btn btn-outline-primary" to="/portfolio">
            View portfolio
          </Link>
        </div>
        {!wallets.length && (
          <div className="kw-empty card mt-3">
            <h2 className="h5">Add your first wallet</h2>
            <p>Use a public address to start tracking. No connection or signature required.</p>
            <Link className="btn btn-primary align-self-center" to="/wallets/manage">
              Add a wallet
            </Link>
          </div>
        )}
      </Col>
      {/* KPI Row */}
      <Col md={6} xl={4}>
        <PortfolioValueCard />
      </Col>
      <Col md={6} xl={4}>
        <PnLCard />
      </Col>
      <Col md={12} xl={4}>
        <FearGreedCard />
      </Col>

      {/* Top Tokens Row */}
      <Col xs={12} className="mt-3">
        <TopTokensRow />
      </Col>

      {/* Balance Chart */}
      <Col xs={12} className="mt-3">
        <TransactionHistoryCard />
      </Col>
    </Row>
  );
}
