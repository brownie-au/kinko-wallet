import PropTypes from 'prop-types';
// react-bootstrap
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Badge from 'react-bootstrap/Badge';

// project-imports
import MainCard from 'components/MainCard';

// ==============================|| PROFIT SUMMARY CARD ||============================== //

export default function ProfitSummaryCard({ title, icon, value, badgevalue, color, description }) {
  return (
    <MainCard className="profit-bar">
      <Row>
        <Col>
          <h5 className="f-w-300">{title}</h5>
          <h3 className="text-success f-w-400 m-t-10">${value}</h3>
        </Col>
        <Col>
          <i className={`${icon} text-white f-20 float-end`} />
        </Col>
      </Row>
      <h6 className="m-t-20 text-muted">
        <Badge className={`${color} text-white m-r-10`}>{badgevalue}</Badge>
        {description}
      </h6>
    </MainCard>
  );
}

ProfitSummaryCard.propTypes = {
  title: PropTypes.string,
  icon: PropTypes.string,
  value: PropTypes.string,
  badgevalue: PropTypes.string,
  color: PropTypes.string,
  description: PropTypes.string
};
