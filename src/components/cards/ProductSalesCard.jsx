import PropTypes from 'prop-types';
// react-bootstrap
import Col from 'react-bootstrap/Col';
import Image from 'react-bootstrap/Image';
import ProgressBar from 'react-bootstrap/ProgressBar';
import Row from 'react-bootstrap/Row';

// project-imports
import MainCard from 'components/MainCard';

// ==============================|| PRODUCT SALES CARD ||============================== //

export default function ProductSalesCard({ title, image, progress, value, amount }) {
  return (
    <MainCard>
      <Row className="align-items-center justify-content-center">
        <Col sm="auto">
          <Image src={image} className="img-fluid" />
        </Col>

        <Col>
          <h5 className="mb-3">{title}</h5>
          <h6 className="mb-0">
            ${amount} <span className="float-end">${value}</span>
          </h6>
          <ProgressBar className="m-t-10">
            <ProgressBar {...progress} />
          </ProgressBar>
        </Col>
      </Row>
    </MainCard>
  );
}

ProductSalesCard.propTypes = {
  title: PropTypes.string,
  image: PropTypes.string,
  progress: PropTypes.any,
  value: PropTypes.number,
  amount: PropTypes.number
};
