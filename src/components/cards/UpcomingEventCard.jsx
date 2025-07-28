import PropTypes from 'prop-types';
// react-bootstrap
import Badge from 'react-bootstrap/Badge';
import Col from 'react-bootstrap/Col';
import Row from 'react-bootstrap/Row';

// project-imports
import MainCard from 'components/MainCard';

// =============================|| UPCOMING EVENT CARD ||============================== //

export default function UpcomingEventCard({ title, percent, value, label, description, icon, badge }) {
  return (
    <MainCard className="card-event">
      <Row className="align-items-center justify-content-center">
        <Col>
          <h5 className="m-0">{title}</h5>
        </Col>
        <Col xs="auto">
          <Badge className="bg-brand-color-2 text-white f-14 f-w-400 float-end" {...badge}>
            {percent}
          </Badge>
        </Col>
      </Row>

      <h2 className="mt-2 f-w-300">
        {value}
        <sub className="text-muted f-14">{label}</sub>
      </h2>
      <h6 className="text-muted mt-3 mb-0">{description}</h6>
      <i className={`${icon} text-info f-50`} />
    </MainCard>
  );
}

UpcomingEventCard.propTypes = {
  title: PropTypes.string,
  percent: PropTypes.string,
  value: PropTypes.number,
  label: PropTypes.string,
  description: PropTypes.string,
  icon: PropTypes.string,
  badge: PropTypes.any
};
