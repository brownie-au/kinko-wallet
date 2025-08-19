// src/views/navigation/dashboard/Default.jsx

import Col from 'react-bootstrap/Col';
import Row from 'react-bootstrap/Row';

// ⬇️ Import directly (skip the barrel to avoid path issues)
import PortfolioValueCard from '../../../sections/dashboard/default/PortfolioValueCard';
import PnLCard from '../../../sections/dashboard/default/PnLCard';
import FearGreedCard from '../../../sections/dashboard/default/FearGreedCard';
import PortfolioBalanceChart from '../../../sections/dashboard/default/PortfolioBalanceChart';
import TopTokensRow from '../../../sections/dashboard/default/TopTokensRow.jsx';

export default function DefaultPage() {
  return (
    <Row>
      {/* KPI Row */}
      <Col md={6} xl={4}><PortfolioValueCard /></Col>
      <Col md={6} xl={4}><PnLCard /></Col>
      <Col md={12} xl={4}><FearGreedCard /></Col>

      {/* Top Tokens Row */}
      <Col xs={12} className="mt-3">
        <TopTokensRow />
      </Col>

      {/* Balance Chart */}
      <Col xs={12} className="mt-3">
        <PortfolioBalanceChart />
      </Col>
    </Row>
  );
}
