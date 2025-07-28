import PropTypes from 'prop-types';
// react-bootstrap
import Col from 'react-bootstrap/Col';
import Image from 'react-bootstrap/Image';
import Row from 'react-bootstrap/Row';

// project-imports
import MainCard from 'components/MainCard';

// ==============================|| INCOME OVERVIEW CARD ||============================== //

export default function IncomeOverviewCard({ image, value, icon, iconColor, label }) {
  return (
    <MainCard className="widget-focus" bodyClassName="p-sm-0">
      <Row className="align-items-center justify-content-center">
        <Col sm="auto">
          <Image src={image} className="rounded" />
        </Col>
        <Col className="p-l-0">
          <h4>
            ${value} <i className={`${icon} ${iconColor} f-22 m-l-5`} />
          </h4>
          <span>{label}</span>
        </Col>
      </Row>
    </MainCard>
  );
}

IncomeOverviewCard.propTypes = {
  image: PropTypes.string,
  value: PropTypes.string,
  icon: PropTypes.string,
  iconColor: PropTypes.string,
  label: PropTypes.string
};
