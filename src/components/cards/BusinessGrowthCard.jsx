import PropTypes from 'prop-types';
// project-imports
import MainCard from 'components/MainCard';

// =============================|| BUSINESS GROWTH CARD ||============================== //

export default function BusinessGrowthCard({ icon, iconsize, title, value, description, bgcolor, className }) {
  return (
    <MainCard className={bgcolor} bodyClassName="text-center text-white">
      <i className={`${icon} ${iconsize} m-b-20`} />
      <h5 className={className}>{title}</h5>
      <h3 className="text-white f-w-300">{value}</h3>
      <p className="mb-0">{description}</p>
    </MainCard>
  );
}

BusinessGrowthCard.propTypes = {
  icon: PropTypes.string,
  iconsize: PropTypes.string,
  title: PropTypes.string,
  value: PropTypes.string,
  description: PropTypes.string,
  bgcolor: PropTypes.string,
  className: PropTypes.string
};
