'use client';

import {
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnOrderState,
  type ColumnVisibilityState,
  flexRender,
  type PaginationState,
  type RowData,
  type SortingState,
  useTable,
} from '@tanstack/react-table';
import * as React from 'react';

// Row actions stay pinned to the right edge so they remain reachable when the table scrolls.
const STICKY_COLUMN_ID = 'actions';
const stickyColumnClass = 'sticky right-0 z-10 border-l bg-background';

interface DataTableProps<TData extends RowData> {
  columns: ColumnDef<BookmarkTableFeatures, TData>[];
  data: TData[];
  allData: TData[];
  onRowClick?: (row: TData) => void;
  rowClassName?: (row: TData) => string;
}

export function DataTable<TData extends RowData>({
  columns,
  data,
  allData,
  onRowClick,
  rowClassName,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>(
    DEFAULT_BOOKMARK_TABLE_VIEW.sorting,
  );
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<ColumnVisibilityState>(
    DEFAULT_BOOKMARK_TABLE_VIEW.columnVisibility,
  );
  const [columnOrder, setColumnOrder] = React.useState<ColumnOrderState>(
    DEFAULT_BOOKMARK_TABLE_VIEW.columnOrder,
  );
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_BOOKMARK_TABLE_VIEW.pageSize,
  });
  const [rowSelection, setRowSelection] = React.useState({});
  const [applyToCurrentFolder, setApplyToCurrentFolder] = React.useState(false);
  const [isTableViewLoaded, setIsTableViewLoaded] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    getBookmarkTableView().then((view) => {
      if (!active) return;
      setSorting(view.sorting);
      setColumnVisibility(view.columnVisibility);
      setColumnOrder(view.columnOrder);
      setPagination({ pageIndex: 0, pageSize: view.pageSize });
      setIsTableViewLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    if (!isTableViewLoaded) return;
    void saveBookmarkTableView({
      version: 1,
      sorting,
      columnVisibility,
      columnOrder,
      pageSize: pagination.pageSize as 10 | 20 | 30 | 40 | 50,
    }).catch((error) => console.error('Failed to save bookmark table view:', error));
  }, [columnOrder, columnVisibility, isTableViewLoaded, pagination.pageSize, sorting]);

  const resetView = React.useCallback(() => {
    setSorting([]);
    setColumnVisibility({ ...DEFAULT_BOOKMARK_TABLE_VIEW.columnVisibility });
    setColumnOrder([...DEFAULT_BOOKMARK_TABLE_VIEW.columnOrder]);
    setPagination({ pageIndex: 0, pageSize: DEFAULT_BOOKMARK_TABLE_VIEW.pageSize });
    void resetBookmarkTableView().catch((error) =>
      console.error('Failed to reset bookmark table view:', error),
    );
  }, []);

  const displayedData = columnFilters.length > 0 && !applyToCurrentFolder ? allData : data;

  const table = useTable({
    features: bookmarkTableFeatures,
    data: displayedData,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnOrderChange: setColumnOrder,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnOrder,
      columnVisibility,
      pagination,
      rowSelection,
    },
  });

  return (
    <div className="min-w-0 space-y-4">
      <DataTableToolbar
        table={table}
        applyToCurrentFolder={applyToCurrentFolder}
        onApplyToCurrentFolderChange={setApplyToCurrentFolder}
        onResetView={resetView}
      />
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn(header.column.id === STICKY_COLUMN_ID && stickyColumnClass)}
                  >
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
                    <TableCell
                      key={cell.id}
                      className={cn(cell.column.id === STICKY_COLUMN_ID && stickyColumnClass)}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  {t('table_noResults')}
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
