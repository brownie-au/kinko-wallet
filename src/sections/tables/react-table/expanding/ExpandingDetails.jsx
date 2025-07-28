import PropTypes from 'prop-types';
import { Fragment, useMemo, useState } from 'react';

// react-bootstrap
import Badge from 'react-bootstrap/Badge';
import Stack from 'react-bootstrap/Stack';
import Table from 'react-bootstrap/Table';

// third-party
import {
  useReactTable,
  flexRender,
  getExpandedRowModel,
  getCoreRowModel,
  getPaginationRowModel,
  getFilteredRowModel
} from '@tanstack/react-table';

// project-imports
import ExpandingUserDetail from './ExpandingUserDetailsTable';
import MainCard from 'components/MainCard';
import LinearWithLabel from 'components/@extended/progress/LinearWithLabel';
import DebouncedInput from 'components/third-party/react-table/DebouncedInput';
import SortingData from 'components/third-party/react-table/SortingData';
import TablePagination from 'components/third-party/react-table/Pagination';
import makeData from 'data/react-table';

// ==============================|| REACT TABLE ||============================== //

function ReactTable({ data, columns }) {
  const [globalFilter, setGlobalFilter] = useState('');

  const table = useReactTable({
    data,
    state: { globalFilter },
    columns,
    getRowCanExpand: () => true,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel()
  });

  return (
    <MainCard title="Expanding User Details" className="table-card">
      <Stack direction="horizontal" className="justify-content-between align-items-center flex-wrap p-4" gap={2}>
        <SortingData getState={table.getState} setPageSize={table.setPageSize} />
        <div className="datatable-search">
          <DebouncedInput value={globalFilter ?? ''} onFilterChange={(value) => setGlobalFilter(String(value))} />
        </div>
      </Stack>
      <Table responsive className="border-top">
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
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
              {row.getIsExpanded() && !row.getIsGrouped() && (
                <tr>
                  <td colSpan={row.getVisibleCells().length + 2}>
                    <ExpandingUserDetail data={row.original} />
                  </td>
                </tr>
              )}
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

// ==============================|| EXPANDING - EXPANDING DETAILS ||============================== //

export default function ExpandingDetails() {
  const data = makeData(50);

  const columns = useMemo(
    () => [
      {
        id: 'expander',
        header: () => null,
        cell: ({ row }) => (
          <i
            className={`ti ${row.getIsExpanded() ? 'ti-chevron-down' : 'ti-chevron-right'} fs-5`}
            onClick={row.getToggleExpandedHandler()}
          />
        )
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
        },
        cell: ({ getValue }) => <div>{getValue()}</div>
      },
      {
        header: 'Status',
        accessorKey: 'status',
        cell: ({ getValue }) => {
          const status = getValue();
          return (
            <Badge bg={status === 'Complicated' ? 'light-danger' : status === 'Relationship' ? 'light-success' : 'light-info'}>
              {status}
            </Badge>
          );
        }
      },
      {
        header: 'Profile Progress',
        accessorKey: 'progress',
        cell: (props) => <LinearWithLabel value={Number(props.getValue())} />
      }
    ],
    []
  );

  return <ReactTable columns={columns} data={data} />;
}

ReactTable.propTypes = { data: PropTypes.array, columns: PropTypes.array };
