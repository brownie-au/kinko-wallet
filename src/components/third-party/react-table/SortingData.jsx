import PropTypes from 'prop-types';
import { useEffect } from 'react';

// react-bootstrap
import Form from 'react-bootstrap/Form';

// ==============================|| REACT TABLE - SORTING DATA ||============================== //

export default function SortingData({ getState, setPageSize }) {
  useEffect(() => setPageSize(10), [setPageSize]);

  const handleChange = (event) => {
    setPageSize(Number(event.target.value));
  };

  return (
    <div className="datatable-dropdown">
      <label>
        <Form.Select className="datatable-selector" name="per-page" value={getState().pagination.pageSize} onChange={handleChange}>
          <option value="5">5</option>
          <option value="10">10</option>
          <option value="15">15</option>
          <option value="20">20</option>
          <option value="25">25</option>
        </Form.Select>
        entries per page
      </label>
    </div>
  );
}

SortingData.propTypes = { getState: PropTypes.func, setPageSize: PropTypes.func };
