import PropTypes from 'prop-types';
// react-bootstrap
import Col from 'react-bootstrap/Col';
import Image from 'react-bootstrap/Image';
import Row from 'react-bootstrap/Row';

// project-imports
import MainCard from 'components/MainCard';

// ==============================|| BUSINESS SNAPSHOT CARD ||============================== //

export default function BusinessSnapshotCard({ value, title, image, className }) {
  return (
    <MainCard>
      <Row className="align-items-center justify-content-center">
        <Col>
          <h3 className={className}>{value}</h3>
          <h5>{title}</h5>
        </Col>
        <Col className="text-end">
          <Image src={image} alt="activity-user" className="wid-80" />
        </Col>
      </Row>
    </MainCard>
  );
}

BusinessSnapshotCard.propTypes = {
  value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  title: PropTypes.string,
  image: PropTypes.string,
  className: PropTypes.string
};
