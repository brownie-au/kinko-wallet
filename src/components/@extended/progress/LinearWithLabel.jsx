import PropTypes from 'prop-types';
// react-bootstrap
import ProgressBar from 'react-bootstrap/ProgressBar';
import Stack from 'react-bootstrap/Stack';

// ==============================|| PROGRESS - LINEAR WITH LABEL ||============================== //

export default function LinearWithLabel({ value, ...others }) {
  return (
    <Stack direction="horizontal" className="align-items-center justify-content-between" gap={2}>
      <ProgressBar now={value} {...others} className="w-100" />
      <span className="text-end">{`${Math.round(value)}%`}</span>
    </Stack>
  );
}

LinearWithLabel.propTypes = { value: PropTypes.number, others: PropTypes.any };
