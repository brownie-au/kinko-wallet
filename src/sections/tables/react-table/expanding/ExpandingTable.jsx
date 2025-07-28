import PropTypes from 'prop-types';
import { Fragment, useEffect, useMemo, useState } from 'react';

// react-bootstrap
import Badge from 'react-bootstrap/Badge';
import Spinner from 'react-bootstrap/Spinner';
import Stack from 'react-bootstrap/Stack';
import Table from 'react-bootstrap/Table';

// third-party
import {
  flexRender,
  useReactTable,
  getExpandedRowModel,
  getCoreRowModel,
  getPaginationRowModel,
  getFilteredRowModel
} from '@tanstack/react-table';

// project-imports
import MainCard from 'components/MainCard';
import LinearWithLabel from 'components/@extended/progress/LinearWithLabel';
import SortingData from 'components/third-party/react-table/SortingData';
import DebouncedInput from 'components/third-party/react-table/DebouncedInput';
import TablePagination from 'components/third-party/react-table/Pagination';
import makeData from 'data/react-table';
import mockData from 'utils/mock-data';

// ==============================|| RENDER - SUB TABLE ||============================== //

function RenderSubComponent() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);

  const columns = useMemo(
    () => [
      {
        header: 'Name',
        accessorKey: 'fullName'
      },
      {
        header: 'Email',
        accessorKey: 'email'
      },
      {
        header: 'Age',
        accessorKey: 'age',
        meta: {
          className: 'text-end'
        }
      },
      {
        header: 'Status',
        accessorKey: 'status',
        cell: (cell) => {
          switch (cell.getValue()) {
            case 'Complicated':
              return (
                <Badge bg="light-danger" pill>
                  Complicated
                </Badge>
              );
            case 'Relationship':
              return (
                <Badge bg="light-success" pill>
                  Relationship
                </Badge>
              );
            case 'Single':
            default:
              return (
                <Badge bg="light-info" pill>
                  Single
                </Badge>
              );
          }
        }
      },
      {
        header: 'Profile Progress',
        accessorKey: 'progress',
        cell: (props) => <LinearWithLabel value={props.getValue()} />
      }
    ],
    []
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setData(makeData(mockData(1).number.status(1, 5)));
      setLoading(false);
    }, 500);

    return () => {
      clearTimeout(timer);
    };
  }, []);

  return <TableSubRows {...{ columns, data, loading }} />;
}

function TableSubRows({ columns, data, loading }) {
  const table = useReactTable({
    data,
    columns,
    getRowCanExpand: () => true,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel()
  });

  if (loading) {
    return (
      <>
        {[0, 1, 2].map((item) => (
          <tr key={item}>
            <td />
            {[0, 1, 2, 3, 4].map((col) => (
              <td key={col}>
                <Spinner animation="border" variant="primary" size="sm" />
              </td>
            ))}
          </tr>
        ))}
      </>
    );
  }

  return (
    <>
      {table.getRowModel().rows.map((row, index) => (
        <tr key={index}>
          <td />
          {row.getVisibleCells().map((cell) => (
            <td key={cell.id} {...cell.column.columnDef.meta}>
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function ReactTable({ columns, data }) {
  const [globalFilter, setGlobalFilter] = useState('');

  const table = useReactTable({
    data,
    columns,
    state: { globalFilter },
    getRowCanExpand: () => true,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel()
  });

  let headers = [];
  table.getAllColumns().forEach((column) => {
    const key = column.columnDef;

    if (typeof key === 'string') {
      headers.push({
        label: typeof column.columnDef.header === 'string' ? column.columnDef.header : '#',
        key
      });
    }
  });

  return (
    <MainCard title="Expanding Table" className="table-card">
      <Stack direction="horizontal" className="justify-content-between align-items-center flex-wrap p-4" gap={2}>
        <SortingData getState={table.getState} setPageSize={table.setPageSize} />
        <div className="datatable-search">
          <DebouncedInput value={globalFilter ?? ''} onFilterChange={(value) => setGlobalFilter(String(value))} />
        </div>
      </Stack>
      <Table responsive className="mb-0 border-top">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id}>{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <Fragment key={row.id}>
              <tr>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} {...cell.column.columnDef.meta}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
              {row.getIsExpanded() && <RenderSubComponent />}
            </Fragment>
          ))}
        </tbody>
      </Table>
      <TablePagination
        setPageSize={table.setPageSize}
        setPageIndex={table.setPageIndex}
        getState={table.getState}
        getPageCount={table.getPageCount}
        initialPageSize={10}
        totalEntries={50}
      />
    </MainCard>
  );
}

// ==============================|| REACT TABLE - EXPANDING TABLE ||============================== //

export default function ExpandingTable() {
  const data = makeData(50);

  const columns = useMemo(
    () => [
      {
        id: 'expander',
        header: () => null,
        cell: ({ row }) => {
          return row.getCanExpand() ? (
            <i
              className={`ti ${row.getIsExpanded() ? 'ti-chevron-down' : 'ti-chevron-right'} fs-5 cursor-pointer`}
              style={{ color: row.getIsExpanded() ? '#0d6efd' : '#6c757d' }}
              onClick={row.getToggleExpandedHandler()}
            />
          ) : (
            <i className="ti ti-ban fs-5" style={{ color: '#6c757d' }} />
          );
        }
      },
      {
        header: 'Name',
        accessorKey: 'fullName'
      },
      {
        header: 'Email',
        accessorKey: 'email'
      },
      {
        header: 'Age',
        accessorKey: 'age',
        meta: {
          className: 'text-end'
        }
      },
      {
        header: 'Status',
        accessorKey: 'status',
        cell: (cell) => {
          switch (cell.getValue()) {
            case 'Complicated':
              return <Badge bg="light-danger">Complicated</Badge>;
            case 'Relationship':
              return <Badge bg="light-success">Relationship</Badge>;
            case 'Single':
            default:
              return <Badge bg="light-info">Single</Badge>;
          }
        }
      },
      {
        header: 'Profile Progress',
        accessorKey: 'progress',
        cell: (props) => <LinearWithLabel value={props.getValue()} />
      }
    ],
    []
  );

  return <ReactTable {...{ columns, data }} />;
}

TableSubRows.propTypes = { columns: PropTypes.array, data: PropTypes.array, loading: PropTypes.bool };

ReactTable.propTypes = { columns: PropTypes.array, data: PropTypes.array };
