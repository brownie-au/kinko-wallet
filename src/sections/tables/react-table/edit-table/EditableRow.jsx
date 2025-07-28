import PropTypes from 'prop-types';
import { useMemo, useState } from 'react';

// react-bootstrap
import Table from 'react-bootstrap/Table';

// third-party
import { useReactTable, getCoreRowModel, flexRender } from '@tanstack/react-table';

// project-imports
import MainCard from 'components/MainCard';
import EditRow from 'components/third-party/react-table/EditRow';
import CSVExport from 'components/third-party/react-table/CSVExport';
import makeData from 'data/react-table';

// ==============================|| REACT TABLE ||============================== //

function ReactTable({ columns, data, setData }) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    debugTable: true
  });

  const headers = [];
  table.getAllColumns().forEach((column) => {
    const accessorKey = column.columnDef.accessorKey;
    headers.push({
      label: typeof column.columnDef.header === 'string' ? column.columnDef.header : '#',
      key: accessorKey ?? ''
    });
  });

  return (
    <MainCard
      title="Editable Row"
      secondary={
        <CSVExport {...{ data: table.getRowModel().flatRows.map((row) => row.original), headers, filename: 'editable-row.csv' }} />
      }
      className="table-card"
    >
      <Table hover responsive className="mb-0">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id} {...header.column.columnDef.meta} className={`${header.column.columnDef.meta?.className}`}>
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <EditRow
              key={row.id}
              row={row}
              onSave={(updatedData) => {
                setData((prev) => prev.map((item) => (item.id === row.original.id ? { ...item, ...updatedData } : item)));
              }}
            />
          ))}
        </tbody>
      </Table>
    </MainCard>
  );
}

// ==============================|| REACT TABLE - EDITABLE ROW ||============================== //

export default function EditableRow() {
  const [data, setData] = useState(() => makeData(10));

  const columns = useMemo(
    () => [
      {
        header: 'Name',
        accessorKey: 'fullName',
        dataType: 'text'
      },
      {
        header: 'Email',
        accessorKey: 'email',
        dataType: 'text'
      },
      {
        header: 'Age',
        accessorKey: 'age',
        dataType: 'number',
        meta: { className: 'text-end' }
      },
      {
        header: 'Visits',
        accessorKey: 'visits',
        dataType: 'number',
        meta: { className: 'text-end' }
      },
      {
        header: 'Status',
        accessorKey: 'status',
        dataType: 'select'
      },
      {
        header: 'Profile Progress',
        accessorKey: 'progress',
        dataType: 'progress'
      },
      { header: 'Actions', dataType: 'actions', meta: { className: 'text-center' } }
    ],
    []
  );

  return <ReactTable {...{ data, columns, setData }} />;
}

ReactTable.propTypes = { columns: PropTypes.array, data: PropTypes.array, setData: PropTypes.any };
