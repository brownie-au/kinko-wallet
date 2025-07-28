import PropTypes from 'prop-types';
// react-bootstrap
import Card from 'react-bootstrap/Card';
import Col from 'react-bootstrap/Col';
import Row from 'react-bootstrap/Row';

// ==============================|| NEW PRODUCTS INDICATOR CARD ||============================== //

export default function NewProductsIndicatorCard({ icon, title, value, iconColor }) {
  return (
    <Card className="table-card">
      <Row className="row-table">
        <Col xs="auto" className={`${iconColor} text-white p-t-50 p-b-50`}>
          <i className={`${icon} f-30`} />
        </Col>
        <Col className="text-center">
          <p className="text-uppercase d-block m-b-10">{title}</p>
          <h3 className="f-w-300">{value}</h3>
        </Col>
      </Row>
    </Card>
  );
}

NewProductsIndicatorCard.propTypes = {
  icon: PropTypes.string,
  title: PropTypes.string,
  value: PropTypes.number,
  iconColor: PropTypes.string
};
