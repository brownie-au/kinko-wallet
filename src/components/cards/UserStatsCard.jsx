import PropTypes from 'prop-types';
// react-bootstrap
import Badge from 'react-bootstrap/Badge';

// project-imports
import MainCard from 'components/MainCard';

// ==============================|| USER STATS CARD ||============================== //

export default function UserStatsCard({ title, count, percentage, badge, label }) {
  return (
    <MainCard>
      <h5 className="m-b-15">{title}</h5>
      <h4 className="mb-3 f-w-300">{count}</h4>
      <span className="text-muted">
        <Badge className="bg-brand-color-1 text-white f-12 f-w-40  me-2" {...badge}>
          {percentage}%
        </Badge>
        {label}
      </span>
    </MainCard>
  );
}

UserStatsCard.propTypes = {
  title: PropTypes.string,
  count: PropTypes.number,
  percentage: PropTypes.number,
  badge: PropTypes.any,
  label: PropTypes.string
};
