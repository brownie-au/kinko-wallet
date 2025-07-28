import PropTypes from 'prop-types';
// react-bootstrap
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Badge from 'react-bootstrap/Badge';

// project-imports
import MainCard from 'components/MainCard';

// ==============================|| ORDER SUMMARY CARD ||============================== //

export default function OrderSummaryCard({ title, description, icon, value, badgevalue, color }) {
  return (
    <MainCard>
      <Row>
        <Col>
          <i className={`${icon} align-middle f-30 text-success`} />
          <h6 className="m-t-50 m-b-0">{title}</h6>
        </Col>
        <Col className="text-end">
          <h3 className="text-success f-w-300">{value}</h3>
          <span className="text-muted d-block">{description}</span>
          <Badge className={`${color} text-white m-t-20`}>{badgevalue}</Badge>
        </Col>
      </Row>
    </MainCard>
  );
}

OrderSummaryCard.propTypes = {
  title: PropTypes.string,
  description: PropTypes.string,
  icon: PropTypes.string,
  value: PropTypes.number,
  badgevalue: PropTypes.number,
  color: PropTypes.string
};
