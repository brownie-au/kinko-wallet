import PropTypes from 'prop-types';
import Col from 'react-bootstrap/Col';
import Row from 'react-bootstrap/Row';

// project-imports
import MainCard from 'components/MainCard';

// ==============================|| ANALYTICS SUMMARY CARD ||============================== //

export default function AnalyticsSummaryCard({ title, value, description, icon }) {
  return (
    <MainCard className="card-Impression">
      <Row className="align-items-center justify-between-center">
        <Col>
          <h5 className="mb-3">{title}</h5>
          <h3 className="mb-2 f-w-300">{value}</h3>
          <p className="mb-0 text-muted">{description}</p>
        </Col>
        <Col xs="auto">
          <i className={`${icon} text-white f-28`} />
        </Col>
      </Row>
    </MainCard>
  );
}

AnalyticsSummaryCard.propTypes = {
  title: PropTypes.string,
  value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  description: PropTypes.string,
  icon: PropTypes.string
};
