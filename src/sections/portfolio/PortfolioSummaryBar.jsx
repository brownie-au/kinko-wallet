import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';

function pctBadge(change) {
  if (change == null) return <span className="badge bg-secondary">—</span>;
  const up = change >= 0;
  return (
    <span className={`badge ${up ? 'bg-success' : 'bg-danger'}`}>
      {up ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
    </span>
  );
}

export default function PortfolioSummaryBar({ totalUSD, change24hPct, walletCount }) {
  return (
    <div className="portfolio-summary sticky-top rounded px-3 py-2 mb-3">
      <Row className="align-items-center g-2">
        <Col sm="auto">
          <div className="h4 mb-0">
            Total: <span className="text-primary">{totalUSD}</span>
          </div>
        </Col>
        <Col sm="auto" className="text-muted">
          24h: {pctBadge(change24hPct)}
        </Col>
        <Col sm="auto" className="text-muted">
          Wallets: {walletCount}
        </Col>
      </Row>
    </div>
  );
}
