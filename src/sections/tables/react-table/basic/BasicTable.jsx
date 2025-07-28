import PropTypes from 'prop-types';
import { useMemo, useState } from 'react';

// react-bootstrap
import Badge from 'react-bootstrap/Badge';
import Stack from 'react-bootstrap/Stack';
import Table from 'react-bootstrap/Table';

// third-party
import { flexRender, useReactTable, getCoreRowModel, getPaginationRowModel, getFilteredRowModel } from '@tanstack/react-table';

// project-imports
import MainCard from 'components/MainCard';
import LinearWithLabel from 'components/@extended/progress/LinearWithLabel';
import TablePagination from 'components/third-party/react-table/Pagination';
import SortingData from 'components/third-party/react-table/SortingData';
import DebouncedInput from 'components/third-party/react-table/DebouncedInput';
import makeData from 'data/react-table';

// ==============================|| REACT TABLE ||============================== //

function ReactTable({ columns, data, striped }) {
  const [globalFilter, setGlobalFilter] = useState('');

  const table = useReactTable({
    data,
    state: { globalFilter },
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel()
  });

  let headers = [];
  table.getAllColumns().map((columns) =>
    headers.push({
      label: typeof columns.columnDef.header === 'string' ? columns.columnDef.header : '#',
      // @ts-ignore
      key: columns.columnDef.accessorKey
    })
  );

  return (
    <MainCard title="Basic Table" className="table-card">
      <Stack direction="horizontal" className="justify-content-between align-items-center p-4 flex-wrap gap-2">
        <SortingData getState={table.getState} setPageSize={table.setPageSize} />
        <div className="datatable-search">
          <DebouncedInput value={globalFilter ?? ''} onFilterChange={(value) => setGlobalFilter(String(value))} />
        </div>
      </Stack>
      <Table className="mb-0 border-top" hover responsive>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id} {...header.column.columnDef.meta}>
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody {...(striped && { className: 'striped' })}>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} {...cell.column.columnDef.meta}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
      <TablePagination
        setPageSize={table.setPageSize}
        setPageIndex={table.setPageIndex}
        getState={table.getState}
        getPageCount={table.getPageCount}
        initialPageSize={10}
        totalEntries={25}
      />
    </MainCard>
  );
}

// ==============================|| BASIC TABLE ||============================== //

export default function BasicTable({ striped, title }) {
  const data = makeData(25);

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
        id: 'age',
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
          const status = cell.getValue();
          let variant;
          switch (status) {
            case 'Complicated':
              variant = 'light-danger';
              break;
            case 'Relationship':
              variant = 'light-success';
              break;
            case 'Single':
            default:
              variant = 'light-info';
              break;
          }
          return <Badge bg={variant}>{status}</Badge>;
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

  return <ReactTable {...{ data, columns, title, striped }} />;
}

ReactTable.propTypes = { columns: PropTypes.array, data: PropTypes.array, striped: PropTypes.bool };

BasicTable.propTypes = { striped: PropTypes.bool, title: PropTypes.string };
