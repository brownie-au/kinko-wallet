import PropTypes from 'prop-types';
// react-bootstrap
import Image from 'react-bootstrap/Image';

// project-imports
import MainCard from 'components/MainCard';

// ==============================|| VISITOR GROWTH TRACKER CARD ||============================== //

export default function VisitorGrowthTrackerCard({ title, value, description, avatar1, avatar2, bgClass }) {
  return (
    <MainCard className={`${bgClass} visitor text-center`}>
      <Image className="img-female" src={avatar1} alt="visitor-user" />
      <h5 className="text-white m-0">{title}</h5>
      <h3 className="text-white m-t-10 f-w-300">{value}</h3>
      <span className="text-white">{description}</span>
      <Image className="img-men" src={avatar2} alt="visitor-user" />
    </MainCard>
  );
}

VisitorGrowthTrackerCard.propTypes = {
  title: PropTypes.string,
  value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  description: PropTypes.string,
  avatar1: PropTypes.string,
  avatar2: PropTypes.string,
  bgClass: PropTypes.string
};
