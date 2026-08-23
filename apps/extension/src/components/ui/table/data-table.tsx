'use client';

import {
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnVisibilityState,
  flexRender,
  type RowData,
  type SortingState,
  useTable,
} from '@tanstack/react-table';
import * as React from 'react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { DataTableToolbar } from '@/components/ui/table/data-table-toolbar';
import { DataTablePagination } from './data-table-pagination';
import {
  bookmarkTableFeatures,
  type BookmarkTableFeatures,
} from './table-features';

interface DataTableProps<TData extends RowData> {
  columns: ColumnDef<BookmarkTableFeatures, TData>[];
  data: TData[];
  onRowClick?: (row: TData) => void;
  rowClassName?: (row: TData) => string;
  currentFolderId?: string;
}

export function DataTable<TData extends RowData>({
  columns,
  data,
  onRowClick,
  rowClassName,
  currentFolderId,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  // Hide technical columns by default for cleaner UX
  const [columnVisibility, setColumnVisibility] = React.useState<ColumnVisibilityState>({
    id: false,
    parentId: false,
    dateGroupModified: false,
    unmodifiable: false,
  });
  const [rowSelection, setRowSelection] = React.useState({});

  const table = useTable({
    features: bookmarkTableFeatures,
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
  });

  return (
    <div className="space-y-4">
      <DataTableToolbar table={table} currentFolderId={currentFolderId} />
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  className={rowClassName?.(row.original)}
                  onClick={() => onRowClick?.(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination table={table} />
    </div>
  );
}
