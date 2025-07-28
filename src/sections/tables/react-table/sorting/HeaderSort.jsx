import PropTypes from 'prop-types';
// react-bootstrap
import Stack from 'react-bootstrap/Stack';

var SortType;

(function (SortType) {
  SortType['ASC'] = 'asc';
  SortType['DESC'] = 'desc';
})(SortType || (SortType = {}));

function SortToggler({ type }) {
  return (
    <Stack className="ms-2 text-secondary opacity-50">
      <i className={`ti ti-caret-up-filled ${type === SortType.ASC ? 'text-dark' : ''}`} />
      <i className={`ti ti-caret-down-filled mt-n1 ${type === SortType.DESC ? 'text-dark' : ''}`} />
    </Stack>
  );
}

// ==============================|| SORTING - HEADER SORT ||============================== //

export default function HeaderSort({ column, sort }) {
  return (
    <div {...(sort && { onClick: column.getToggleSortingHandler() })}>
      {{
        asc: <SortToggler type={SortType.ASC} />,
        desc: <SortToggler type={SortType.DESC} />
      }[column.getIsSorted()] ?? <SortToggler />}
    </div>
  );
}

SortToggler.propTypes = { type: PropTypes.any };

HeaderSort.propTypes = { column: PropTypes.object, sort: PropTypes.bool };
