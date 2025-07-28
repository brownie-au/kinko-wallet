import PropTypes from 'prop-types';

// react-bootstrap
import Form from 'react-bootstrap/Form';

// ==============================|| SORTING - SELECT COLUMN SORTING ||============================== //

export default function SelectColumnSorting({ getState, getAllColumns, setSorting }) {
  const sortingState = getState().sorting;

  const handleSortChange = (columnId) => {
    if (!columnId) {
      setSorting([]);
    } else {
      const isCurrentlySorted = sortingState.length > 0 && sortingState[0].id === columnId;
      setSorting(isCurrentlySorted ? [] : [{ id: columnId, desc: false }]);
    }
  };

  return (
    <Form>
      <Form.Select value={sortingState.length > 0 ? sortingState[0].id : []} onChange={(e) => handleSortChange(e.target.value)}>
        {getAllColumns().map(
          (column) =>
            column.columnDef &&
            column.getCanSort() && (
              <option
                key={column.id}
                value={column.id}
                onClick={() =>
                  setSorting(
                    getState().sorting.length > 0 && column.id === getState().sorting[0].id ? [] : [{ id: column.id, desc: false }]
                  )
                }
              >
                {column.columnDef.header}
              </option>
            )
        )}
      </Form.Select>
    </Form>
  );
}

SelectColumnSorting.propTypes = { getState: PropTypes.func, getAllColumns: PropTypes.func, setSorting: PropTypes.func };
