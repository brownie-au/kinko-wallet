import PropTypes from 'prop-types';
// react-bootstrap
import Col from 'react-bootstrap/Col';
import Row from 'react-bootstrap/Row';
import Stack from 'react-bootstrap/Stack';

// project-imports
import MainCard from 'components/MainCard';

// ==============================|| RATING OVERVIEW CARD ||============================== //

export default function RatingOverviewCard({ icon1, icon2, value1, value2, color }) {
  return (
    <MainCard title="Project Rating">
      <Row className="align-items-center justify-content-center">
        <Col xs={6}>
          <Stack as="h2" direction="horizontal" className="f-w-300 align-items-center float-left">
            {value1} <i className={`${icon1} f-14 m-l-10 text-warning`} />
          </Stack>
        </Col>
        <Col xs={6} className="text-end">
          <Stack as="h6" direction="horizontal" className="f-w-300 align-items-center float-end">
            {value2} <i className={`${icon2} ${color} f-24 m-l-10`} />
          </Stack>
        </Col>
      </Row>
    </MainCard>
  );
}

RatingOverviewCard.propTypes = {
  icon1: PropTypes.string,
  icon2: PropTypes.string,
  value1: PropTypes.number,
  value2: PropTypes.number,
  color: PropTypes.string
};
