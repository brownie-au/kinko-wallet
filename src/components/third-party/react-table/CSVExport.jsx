import PropTypes from 'prop-types';
// react-bootstrap
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Tooltip from 'react-bootstrap/Tooltip';

// third-party
import { CSVLink } from 'react-csv';
// ==============================|| REACT TABLE - CSV EXPORT ||============================== //

export default function CSVExport({ data, filename, headers }) {
  return (
    <>
      {/* @ts-ignore https://github.com/react-csv/react-csv/issues/335 */}
      <CSVLink data={data} filename={filename} headers={headers}>
        <OverlayTrigger overlay={<Tooltip>CSV Export</Tooltip>}>
          <i className="ti ti-download me-1 text-secondary f-20" />
        </OverlayTrigger>
      </CSVLink>
    </>
  );
}

CSVExport.propTypes = { data: PropTypes.array, filename: PropTypes.string, headers: PropTypes.any };
