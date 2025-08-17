// react-bootstrap
import Col from 'react-bootstrap/Col';
import Row from 'react-bootstrap/Row';

// NEW: KPI + Balance Chart (keep these)
import {
  PortfolioValueCard,
  PnLCard,
  FearGreedCard,
  PortfolioBalanceChart
} from '../../../sections/dashboard/default';

// ================================|| DASHBOARD - DEFAULT ||============================== //

export default function DefaultPage() {
  return (
    <Row>
      {/* ---- Top Row: KPIs ---- */}
      <Col md={6} xl={4}>
        <PortfolioValueCard />
      </Col>
      <Col md={6} xl={4}>
        <PnLCard />
      </Col>
      <Col md={12} xl={4}>
        <FearGreedCard />
      </Col>

      {/* ---- Balance History: full width ---- */}
      <Col xs={12} className="mt-3">
        <PortfolioBalanceChart />
      </Col>

      {/* Intentionally removed:
         - SocialStatsCard tiles (FB/Twitter/Google)
         - RatingCard
         - StatIndicatorCard (TOTAL IDEAS / TOTAL LOCATION)
      */}
    </Row>
  );
}
