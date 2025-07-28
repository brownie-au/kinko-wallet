import PropTypes from 'prop-types';
// react-bootstrap
import Stack from 'react-bootstrap/Stack';

// project-imports
import MainCard from 'components/MainCard';

// =============================|| IMPRESSION METRICS CARD ||============================== //

export default function ImpressionMetricsCard({ icon, color, value, label }) {
  return (
    <MainCard>
      <Stack direction="horizontal" className="align-items-center gap-4">
        <i className={`${icon} ${color} f-30`} />
        <Stack className="text-end">
          <h3 className="f-w-300">{value}</h3>
          <h5 className="d-block text-uppercase text-muted">{label}</h5>
        </Stack>
      </Stack>
    </MainCard>
  );
}

ImpressionMetricsCard.propTypes = { icon: PropTypes.string, color: PropTypes.string, value: PropTypes.number, label: PropTypes.string };
