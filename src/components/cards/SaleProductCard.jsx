import PropTypes from 'prop-types';
// react-bootstrap
import Col from 'react-bootstrap/Col';
import Image from 'react-bootstrap/Image';
import Row from 'react-bootstrap/Row';

// project-imports
import MainCard from 'components/MainCard';

// =============================|| SALE PRODUCT CARD ||============================== //

export default function SaleProductCard({ image, value, label, color }) {
  return (
    <MainCard className={color}>
      <Row className=" align-items-center justify-content-center">
        <Col xs="auto">
          <Image src={image} alt="activity-user" />
        </Col>
        <Col>
          <h2 className="text-white f-w-300">{value}</h2>
          <h5 className="text-white">{label}</h5>
        </Col>
      </Row>
    </MainCard>
  );
}

SaleProductCard.propTypes = {
  image: PropTypes.string,
  value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  label: PropTypes.string,
  color: PropTypes.string
};
