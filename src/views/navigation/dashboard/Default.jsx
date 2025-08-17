// react-bootstrap
import Col from 'react-bootstrap/Col';
import Row from 'react-bootstrap/Row';

// keep these existing cards for lower rows
import SocialStatsCard from 'components/cards/SocialStatsCard';
import StatIndicatorCard from 'components/cards/StatIndicatorCard';
import { RatingCard, RecentUsersCard } from 'sections/dashboard/default';

// NEW: KPI + Balance Chart
import {
  PortfolioValueCard,
  PnLCard,
  FearGreedCard,
  PortfolioBalanceChart
} from '../../../sections/dashboard/default';

// ===============================|| STAT INDICATOR CARD - DATA ||============================== //

const statIndicatorData = [
  { icon: 'ph ph-lightbulb-filament', value: '235', label: 'TOTAL IDEAS', iconColor: 'text-success' },
  { icon: 'ph ph-map-pin-line', value: '26', label: 'TOTAL LOCATION', iconColor: 'text-primary' }
];

// ===============================|| SOCIAL STATS CARD - DATA ||============================== //

const socialStatsData = [
  {
    icon: 'ti ti-brand-facebook-filled text-primary',
    count: '12,281',
    percentage: '+7.2%',
    color: 'text-success',
    stats: [
      { label: 'Target', value: '35,098', progress: { now: 60, className: 'bg-brand-color-1' } },
      { label: 'Duration', value: '3,539', progress: { now: 45, className: 'bg-brand-color-2' } }
    ]
  },
  {
    icon: 'ti ti-brand-twitter-filled text-info',
    count: '11,200',
    percentage: '+6.2%',
    color: 'text-primary',
    stats: [
      { label: 'Target', value: '34,185', progress: { now: 40, className: 'bg-success' } },
      { label: 'Duration', value: '4,567', progress: { now: 70 } }
    ]
  },
  {
    icon: 'ti ti-brand-google-filled text-danger',
    count: '10,500',
    percentage: '+5.9%',
    color: 'text-primary',
    stats: [
      { label: 'Target', value: '25,998', progress: { now: 80, className: 'bg-brand-color-1' } },
      { label: 'Duration', value: '7,753', progress: { now: 50, className: 'bg-brand-color-2' } }
    ]
  }
];

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

      {/* ---- Balance History: full width, replaces map + old Earnings ---- */}
      <Col xs={12} className="mt-3">
        <PortfolioBalanceChart />
      </Col>

      {/* ---- Keep your existing rows below (can refine later) ---- */}
      {socialStatsData.map((item, index) => (
        <Col key={index} md={index === 0 ? 12 : 6} xl={4}>
          <SocialStatsCard {...item} />
        </Col>
      ))}

      <Col md={6} xl={4}>
        <RatingCard />
      </Col>
      <Col md={6} xl={8}>
        {/* You previously showed EarningChart + StatIndicatorCard here.
            Since Earnings moved to Balance History, we keep only the indicators. */}
        <StatIndicatorCard data={statIndicatorData} />
      </Col>
    </Row>
  );
}
