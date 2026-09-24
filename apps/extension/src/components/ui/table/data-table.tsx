'use client';

import {
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnOrderState,
  type ColumnVisibilityState,
  flexRender,
  type PaginationState,
  type RowData,
  type RowSelectionState,
  type SortingState,
  type Updater,
  useTable,
} from '@tanstack/react-table';
import * as React from 'react';

// Row actions stay pinned to the right edge so they remain reachable when the table scrolls.
const STICKY_COLUMN_ID = 'actions';
// The pinned cell must be opaque, so row tints are mixed into the page background instead of
// being translucent; the variants mirror TableRow hover/selected and folder rows (`is-folder`).
// Tailwind only sees literal class names, so the mixes are spelled out.
const stickyColumnClass = cn(
  'sticky right-0 z-10 border-l bg-background',
  'group-hover:bg-[color-mix(in_srgb,var(--color-muted)_50%,var(--color-background))]',
  'group-[.is-folder]:bg-[color-mix(in_srgb,var(--color-muted)_50%,var(--color-background))]',
  'group-[.is-folder]:group-hover:bg-[color-mix(in_srgb,var(--color-muted)_70%,var(--color-background))]',
  'group-data-[state=selected]:bg-muted!',
);

type PageSize = 10 | 20 | 30 | 40 | 50;

interface DataTableProps<TData extends RowData> {
  columns: ColumnDef<BookmarkTableFeatures, TData>[];
  /** Current folder in the configured sort order. */
  data: TData[];
  /** Current folder in the browser's own order, shown when "Browser order" is on. */
  browserOrderData: TData[];
  /** Every bookmark; filters search all of them unless "Current folder only" is checked. */
  allData: TData[];
  getRowId: (row: TData) => string;
  canSelectRow?: (row: TData) => boolean;
  /** Changing this (e.g. the folder ID) returns to the first page and clears the selection. */
  resetKey?: string | null;
  facetOptions: DataTableFacetOptions;
  /**
   * Renders actions for the selection. `rows` are the selected rows visible under the current
   * filters; `hiddenCount` selected rows are hidden by filters and must not be acted on.
   */
  renderSelectionActions?: (
    rows: TData[],
    hiddenCount: number,
    clearSelection: () => void,
  ) => React.ReactNode;
  onRowClick?: (row: TData) => void;
  /** Rows that open on click also open with Enter or Space when focused. */
  isRowActivatable?: (row: TData) => boolean;
  rowClassName?: (row: TData) => string;
}

function resolveUpdater<T>(updater: Updater<T>, previous: T): T {
  return typeof updater === 'function' ? (updater as (old: T) => T)(previous) : updater;
}

export function DataTable<TData extends RowData>({
  columns,
  data,
  browserOrderData,
  allData,
  getRowId,
  canSelectRow,
  resetKey,
  facetOptions,
  renderSelectionActions,
  onRowClick,
  isRowActivatable,
  rowClassName,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>(DEFAULT_BOOKMARK_TABLE_VIEW.sorting);
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
  const [browserOrder, setBrowserOrder] = React.useState(DEFAULT_BOOKMARK_TABLE_VIEW.browserOrder);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
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
      setBrowserOrder(view.browserOrder);
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
      pageSize: pagination.pageSize as PageSize,
      browserOrder,
    }).catch((error) => console.error('Failed to save bookmark table view:', error));
  }, [
    browserOrder,
    columnOrder,
    columnVisibility,
    isTableViewLoaded,
    pagination.pageSize,
    sorting,
  ]);

  // Navigating to another folder starts on its first page with nothing selected.
  // biome-ignore lint/correctness/useExhaustiveDependencies: resetKey is the trigger.
  React.useEffect(() => {
    setPagination((previous) => ({ ...previous, pageIndex: 0 }));
    setRowSelection({});
  }, [resetKey]);

  const goToFirstPage = React.useCallback(
    () => setPagination((previous) => ({ ...previous, pageIndex: 0 })),
    [],
  );
  // Automatic page resets are off so data refreshes (moves, edits, external changes) keep the
  // current page; filter and sort changes still return to the first page.
  const handleColumnFiltersChange = React.useCallback(
    (updater: Updater<ColumnFiltersState>) => {
      setColumnFilters((previous) => resolveUpdater(updater, previous));
      goToFirstPage();
    },
    [goToFirstPage],
  );
  const handleSortingChange = React.useCallback(
    (updater: Updater<SortingState>) => {
      setSorting((previous) => resolveUpdater(updater, previous));
      goToFirstPage();
    },
    [goToFirstPage],
  );
  const handleBrowserOrderChange = React.useCallback(
    (enabled: boolean) => {
      setBrowserOrder(enabled);
      // Column sorting would hide the browser order the toggle is meant to show.
      if (enabled) setSorting([]);
      goToFirstPage();
    },
    [goToFirstPage],
  );
  const handleApplyToCurrentFolderChange = React.useCallback(
    (enabled: boolean) => {
      setApplyToCurrentFolder(enabled);
      goToFirstPage();
    },
    [goToFirstPage],
  );

  const resetView = React.useCallback(() => {
    setSorting([]);
    setColumnVisibility({ ...DEFAULT_BOOKMARK_TABLE_VIEW.columnVisibility });
    setColumnOrder([...DEFAULT_BOOKMARK_TABLE_VIEW.columnOrder]);
    setPagination({ pageIndex: 0, pageSize: DEFAULT_BOOKMARK_TABLE_VIEW.pageSize });
    setBrowserOrder(DEFAULT_BOOKMARK_TABLE_VIEW.browserOrder);
    void resetBookmarkTableView().catch((error) =>
      console.error('Failed to reset bookmark table view:', error),
    );
  }, []);

  const folderData = browserOrder ? browserOrderData : data;
  const showsAllBookmarks = columnFilters.length > 0 && !applyToCurrentFolder;
  const displayedData = showsAllBookmarks ? allData : folderData;
  const filterScope = applyToCurrentFolder ? folderData : allData;

  const moveDisabledReason = !browserOrder
    ? t('table_moveNeedsBrowserOrder')
    : sorting.length > 0
      ? t('table_moveNeedsNoColumnSort')
      : showsAllBookmarks
        ? t('table_moveNeedsFolderView')
        : null;

  const table = useTable({
    features: bookmarkTableFeatures,
    data: displayedData,
    columns,
    getRowId: (row) => getRowId(row),
    enableRowSelection: canSelectRow ? (row) => canSelectRow(row.original) : true,
    autoResetPageIndex: false,
    onSortingChange: handleSortingChange,
    onColumnFiltersChange: handleColumnFiltersChange,
    onColumnOrderChange: setColumnOrder,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnOrder,
      // The domain column only backs the URL domain filter and is never displayed.
      columnVisibility: { ...columnVisibility, [DOMAIN_COLUMN_ID]: false },
      pagination,
      rowSelection,
    },
  });

  // Keep the page in range when refreshes or deletions shrink the list.
  const pageCount = table.getPageCount();
  React.useEffect(() => {
    if (pagination.pageIndex > 0 && pagination.pageIndex >= pageCount) {
      setPagination((previous) => ({ ...previous, pageIndex: Math.max(0, pageCount - 1) }));
    }
  }, [pageCount, pagination.pageIndex]);

  // Selection is keyed by bookmark ID; drop IDs whose rows no longer exist.
  const rowsById = React.useMemo(
    () => new Map([...allData, ...folderData].map((row) => [getRowId(row), row])),
    [allData, folderData, getRowId],
  );
  const selectedRows = Object.keys(rowSelection)
    .filter((id) => rowSelection[id])
    .map((id) => rowsById.get(id))
    .filter((row): row is TData => row !== undefined);
  // Bulk actions only touch selected rows the current filters show (on any page), matching the
  // footer count; selected rows hidden by a filter are reported but never moved or deleted.
  const filteredRows = table.getFilteredRowModel().rows;
  const { visible: visibleSelectedRows, hiddenCount: hiddenSelectedCount } =
    partitionSelectionByVisibility(
      selectedRows,
      new Set(filteredRows.map((row) => row.id)),
      getRowId,
    );
  const clearSelection = React.useCallback(() => setRowSelection({}), []);

  return (
    <div className="min-w-0 space-y-4">
      <DataTableToolbar
        table={table}
        applyToCurrentFolder={applyToCurrentFolder}
        onApplyToCurrentFolderChange={handleApplyToCurrentFolderChange}
        onResetView={resetView}
        facetOptions={facetOptions}
        facetScope={filterScope}
        browserOrder={browserOrder}
        onBrowserOrderChange={handleBrowserOrderChange}
      />
      {selectedRows.length > 0 &&
        renderSelectionActions?.(visibleSelectedRows, hiddenSelectedCount, clearSelection)}
      <div className="rounded-md border">
        <MoveDisabledReasonContext.Provider value={moveDisabledReason}>
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className={cn(
                        header.column.id === STICKY_COLUMN_ID &&
                          'sticky right-0 z-10 border-l bg-background',
                      )}
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
                table.getRowModel().rows.map((row) => {
                  const activatable =
                    Boolean(onRowClick) && (isRowActivatable?.(row.original) ?? false);
                  return (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && 'selected'}
                      className={rowClassName?.(row.original)}
                      tabIndex={activatable ? 0 : undefined}
                      onClick={() => onRowClick?.(row.original)}
                      onKeyDown={(event) => {
                        if (!activatable || event.target !== event.currentTarget) return;
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onRowClick?.(row.original);
                        }
                      }}
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
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    {t('table_noResults')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </MoveDisabledReasonContext.Provider>
      </div>
      <DataTablePagination table={table} />
    </div>
  );
}
