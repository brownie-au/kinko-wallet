import PropTypes from 'prop-types';
// react-bootstrap
import Form from 'react-bootstrap/Form';
import Stack from 'react-bootstrap/Stack';

// project-imports
import DebouncedInput from './DebouncedInput';

// ==============================|| FILTER - NUMBER FIELD ||============================== //

function NumberInput({ columnFilterValue, getFacetedMinMaxValues, setFilterValue }) {
  const minOpt = getFacetedMinMaxValues()?.[0];
  const min = Number(minOpt ?? '');

  const maxOpt = getFacetedMinMaxValues()?.[1];
  const max = Number(maxOpt);

  return (
    <Stack direction="horizontal" className="align-items-center g-2">
      <DebouncedInput
        inputStyle="wid-120"
        type="number"
        value={columnFilterValue?.[0] ?? ''}
        onFilterChange={(value) => setFilterValue((old) => [value, old?.[1]])}
        inputProps={{ ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) }}
      />

      <i className="ti ti-minus" style={{ marginLeft: 8, marginRight: 8 }} />

      <DebouncedInput
        inputStyle="wid-120"
        type="number"
        value={columnFilterValue?.[1] ?? ''}
        onFilterChange={(value) => setFilterValue((old) => [old?.[0], value])}
        inputProps={{ ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) }}
      />
    </Stack>
  );
}

// ==============================|| FILTER - TEXT FIELD ||============================== //

function TextInput({ columnId, columnFilterValue, header, setFilterValue }) {
  const dataListId = columnId + 'list';

  return (
    <Form.Control
      type="text"
      value={columnFilterValue ?? ''}
      onChange={(e) => setFilterValue(e.target.value)}
      placeholder={`Search ${header}`}
      list={dataListId}
    />
  );
}

// ==============================|| FILTER - INPUT ||============================== //

export default function Filter({ column, table }) {
  const firstValue = table.getPreFilteredRowModel().flatRows[0]?.getValue(column.id);

  const columnFilterValue = column.getFilterValue();

  return typeof firstValue === 'number' ? (
    <NumberInput
      columnFilterValue={columnFilterValue}
      getFacetedMinMaxValues={column.getFacetedMinMaxValues}
      setFilterValue={column.setFilterValue}
    />
  ) : (
    <TextInput
      columnId={column.id}
      columnFilterValue={columnFilterValue}
      setFilterValue={column.setFilterValue}
      header={column.columnDef.header}
    />
  );
}

NumberInput.propTypes = { columnFilterValue: PropTypes.number, getFacetedMinMaxValues: PropTypes.func, setFilterValue: PropTypes.func };

TextInput.propTypes = {
  columnId: PropTypes.string,
  columnFilterValue: PropTypes.string,
  header: PropTypes.string,
  setFilterValue: PropTypes.func
};

Filter.propTypes = { column: PropTypes.object, table: PropTypes.object };
