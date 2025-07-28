import PropTypes from 'prop-types';
// react-bootstrap
import ProgressBar from 'react-bootstrap/ProgressBar';

// project-imports
import MainCard from 'components/MainCard';

// ==============================|| PROGRESS STAT CARD ||============================== //

export default function ProgressStatCard({ title, label, className, progress }) {
  return (
    <MainCard bodyClassName="ticket-visitor">
      <h3 className="mb-2">{title}</h3>
      <h5 className="text-muted f-w-300 mb-4">{label}</h5>
      <ProgressBar className="m-t-10">
        <ProgressBar {...progress} className={className} />
      </ProgressBar>
    </MainCard>
  );
}

ProgressStatCard.propTypes = { title: PropTypes.number, label: PropTypes.string, className: PropTypes.string, progress: PropTypes.any };
