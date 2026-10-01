'use client';

import {
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnOrderState,
  type ColumnSizingState,
  type ColumnVisibilityState,
  type columnResizingState,
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

// An unsized column before the row actions takes any width the sized columns leave, so each
// column keeps exactly the width it was given.
const FILLER_CELL_CLASS = 'w-auto p-0';

type PageSize = 10 | 20 | 30 | 40 | 50;

// Widths are saved to sync storage, which limits writes per minute, so keyboard resizing is
// saved once the presses stop and dragging once it ends.
const COLUMN_SIZING_SAVE_DELAY_MS = 400;

const IDLE_COLUMN_RESIZING: columnResizingState = {
  columnSizingStart: [],
  deltaOffset: null,
  deltaPercentage: null,
  isResizingColumn: false,
  startOffset: null,
  startSize: null,
};

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
  /** Changing this (e.g. the folder ID) returns to `initialPageIndex` and clears the selection. */
  resetKey?: string | null;
  /** Page shown after `resetKey` changes, e.g. the page saved on a history entry (default 0). */
  initialPageIndex?: number;
  /** Called with the page index whenever it changes. */
  onPageIndexChange?: (pageIndex: number) => void;
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
  /** Enables saved searches, which need to know and change the folder the manager shows. */
  savedSearchContext?: DataTableSavedSearchContext;
}

export type DataTableSavedSearchContext = {
  /** The folder shown; null is the top level. */
  currentFolderId: string | null;
  /** IDs of folders that exist now, to skip stale folder IDs in saved searches. */
  folderIds: ReadonlySet<string>;
  onNavigateToFolder: (folderId: string | null) => void;
};

const NO_FOLDER_IDS: ReadonlySet<string> = new Set();

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
  initialPageIndex = 0,
  onPageIndexChange,
  facetOptions,
  renderSelectionActions,
  onRowClick,
  isRowActivatable,
  rowClassName,
  savedSearchContext,
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
  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>({});
  const [savedColumnSizing, setSavedColumnSizing] = React.useState<ColumnSizingState>({});
  const [columnResizing, setColumnResizing] =
    React.useState<columnResizingState>(IDLE_COLUMN_RESIZING);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [applyToCurrentFolder, setApplyToCurrentFolder] = React.useState(false);
  const [isTableViewLoaded, setIsTableViewLoaded] = React.useState(false);
  const tableFrameRef = React.useRef<HTMLDivElement>(null);
  const [tableWidth, setTableWidth] = React.useState<number>();

  React.useEffect(() => {
    const frame = tableFrameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => setTableWidth(entry.contentRect.width));
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);
  const spaceHiddenColumnIds = React.useMemo(
    () => getSpaceHiddenColumnIds(tableWidth),
    [tableWidth],
  );

  React.useEffect(() => {
    let active = true;
    getBookmarkTableView().then((view) => {
      if (!active) return;
      setSorting(view.sorting);
      setColumnVisibility(view.columnVisibility);
      setColumnOrder(view.columnOrder);
      setPagination({ pageIndex: 0, pageSize: view.pageSize });
      setBrowserOrder(view.browserOrder);
      setColumnSizing(view.columnSizing);
      setSavedColumnSizing(view.columnSizing);
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
      columnSizing: savedColumnSizing,
    }).catch((error) => console.error('Failed to save bookmark table view:', error));
  }, [
    browserOrder,
    columnOrder,
    columnVisibility,
    isTableViewLoaded,
    pagination.pageSize,
    savedColumnSizing,
    sorting,
  ]);

  const isResizingColumn = columnResizing.isResizingColumn !== false;
  React.useEffect(() => {
    if (isResizingColumn) return;
    const timer = setTimeout(() => setSavedColumnSizing(columnSizing), COLUMN_SIZING_SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [columnSizing, isResizingColumn]);

  // Navigating to another folder starts on its first page (or, going Back, on the page that was
  // open) with nothing selected. The page is read when the key changes, not tracked.
  const initialPageIndexRef = React.useRef(initialPageIndex);
  initialPageIndexRef.current = initialPageIndex;
  // biome-ignore lint/correctness/useExhaustiveDependencies: resetKey is the trigger.
  React.useEffect(() => {
    setPagination((previous) => ({ ...previous, pageIndex: initialPageIndexRef.current }));
    setRowSelection({});
  }, [resetKey]);

  const onPageIndexChangeRef = React.useRef(onPageIndexChange);
  onPageIndexChangeRef.current = onPageIndexChange;
  React.useEffect(() => {
    onPageIndexChangeRef.current?.(pagination.pageIndex);
  }, [pagination.pageIndex]);

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

  const savedSearchFolderId = savedSearchContext?.currentFolderId ?? null;
  const currentSavedSearchQuery = React.useMemo(
    () =>
      captureSavedSearchQuery({
        columnFilters,
        sorting,
        currentFolderOnly: applyToCurrentFolder,
        currentFolderId: savedSearchFolderId,
      }),
    [applyToCurrentFolder, columnFilters, savedSearchFolderId, sorting],
  );
  const savedSearchContextRef = React.useRef(savedSearchContext);
  savedSearchContextRef.current = savedSearchContext;
  // Saved searches hold only the query, so the table filters the live bookmarks with it.
  const applySavedSearch = React.useCallback(
    (query: SavedSearchQuery) => {
      const context = savedSearchContextRef.current;
      const resolved = resolveSavedSearchQuery(query, context?.folderIds ?? NO_FOLDER_IDS);
      setColumnFilters(resolved.columnFilters);
      setSorting(resolved.sorting);
      setApplyToCurrentFolder(resolved.folderId !== undefined);
      if (resolved.folderId !== undefined) context?.onNavigateToFolder(resolved.folderId);
      goToFirstPage();
      return { missingFolderCount: resolved.missingFolderCount };
    },
    [goToFirstPage],
  );

  const resetView = React.useCallback(() => {
    setSorting([]);
    setColumnVisibility({ ...DEFAULT_BOOKMARK_TABLE_VIEW.columnVisibility });
    setColumnOrder([...DEFAULT_BOOKMARK_TABLE_VIEW.columnOrder]);
    setPagination({ pageIndex: 0, pageSize: DEFAULT_BOOKMARK_TABLE_VIEW.pageSize });
    setBrowserOrder(DEFAULT_BOOKMARK_TABLE_VIEW.browserOrder);
    setColumnSizing({});
    setSavedColumnSizing({});
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

  // Columns the table shows, in order: saved visibility minus columns hidden for lack of room.
  const effectiveColumnVisibility = React.useMemo<ColumnVisibilityState>(
    () => ({
      ...columnVisibility,
      ...Object.fromEntries(
        [...spaceHiddenColumnIds, ...INTERNAL_BOOKMARK_COLUMN_IDS].map((id) => [id, false]),
      ),
    }),
    [columnVisibility, spaceHiddenColumnIds],
  );
  const visibleColumnIds = React.useMemo(
    () => columnOrder.filter((id) => effectiveColumnVisibility[id] !== false),
    [columnOrder, effectiveColumnVisibility],
  );
  const renderedColumnSizing = React.useMemo(
    () => getRenderedColumnSizing(columnSizing, visibleColumnIds, tableWidth),
    [columnSizing, tableWidth, visibleColumnIds],
  );
  // Size updates arrive relative to the rendered widths (Title may be filling spare room); only
  // widths the user actually set are kept.
  const renderedColumnSizingRef = React.useRef(renderedColumnSizing);
  renderedColumnSizingRef.current = renderedColumnSizing;
  const handleColumnSizingChange = React.useCallback((updater: Updater<ColumnSizingState>) => {
    const rendered = renderedColumnSizingRef.current;
    setColumnSizing((previous) =>
      toSavedColumnSizing(resolveUpdater(updater, rendered), rendered, previous),
    );
  }, []);

  const table = useTable({
    features: bookmarkTableFeatures,
    data: displayedData,
    columns,
    getRowId: (row) => getRowId(row),
    enableRowSelection: canSelectRow ? (row) => canSelectRow(row.original) : true,
    autoResetPageIndex: false,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    onColumnSizingChange: handleColumnSizingChange,
    onColumnResizingChange: setColumnResizing,
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
      // Filter-only columns (the URL domain) are never displayed. Columns hidden for lack of
      // room keep the saved preference and return when the table is wide enough.
      columnVisibility: effectiveColumnVisibility,
      columnSizing: renderedColumnSizing,
      columnResizing,
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

  // Selection is keyed by bookmark ID and belongs to the rows the table can show: the current
  // folder, or every bookmark while filters search all of them. A refresh keeps selected rows that
  // are still there, wherever they moved in the list, and drops rows that were deleted or moved
  // out of the folder. Changing folders clears it (see `resetKey`).
  const displayedRowsById = React.useMemo(
    () => new Map(displayedData.map((row) => [getRowId(row), row])),
    [displayedData, getRowId],
  );
  React.useEffect(() => {
    setRowSelection((previous) => {
      const selectedIds = Object.keys(previous).filter((id) => previous[id]);
      const keptIds = selectedIds.filter((id) => displayedRowsById.has(id));
      if (keptIds.length === Object.keys(previous).length) return previous;
      return Object.fromEntries(keptIds.map((id) => [id, true]));
    });
  }, [displayedRowsById]);
  const selectedRows = Object.keys(rowSelection)
    .filter((id) => rowSelection[id])
    .map((id) => displayedRowsById.get(id))
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
        spaceHiddenColumnIds={spaceHiddenColumnIds}
        savedSearches={
          savedSearchContext
            ? { currentQuery: currentSavedSearchQuery, onApply: applySavedSearch }
            : undefined
        }
      />
      {selectedRows.length > 0 &&
        renderSelectionActions?.(visibleSelectedRows, hiddenSelectedCount, clearSelection)}
      <div ref={tableFrameRef} className="rounded-md border">
        <MoveDisabledReasonContext.Provider value={moveDisabledReason}>
          {/* Fixed layout applies the column sizes as given; the table only grows past the frame
              (and scrolls) when the columns need more room than it has. */}
          <Table className="table-fixed" style={{ minWidth: table.getTotalSize() }}>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <React.Fragment key={header.id}>
                      {header.column.id === STICKY_COLUMN_ID && (
                        <TableHead aria-hidden="true" className={FILLER_CELL_CLASS} />
                      )}
                      <TableHead
                        style={{ width: header.getSize() }}
                        className={cn(
                          header.column.getCanResize() && 'relative truncate',
                          header.column.id === STICKY_COLUMN_ID &&
                            'sticky right-0 z-10 border-l bg-background',
                        )}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanResize() && <DataTableColumnResizer header={header} />}
                      </TableHead>
                    </React.Fragment>
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
                        <React.Fragment key={cell.id}>
                          {cell.column.id === STICKY_COLUMN_ID && (
                            <TableCell aria-hidden="true" className={FILLER_CELL_CLASS} />
                          )}
                          <TableCell
                            className={cn(
                              cell.column.getCanResize() && 'truncate',
                              cell.column.id === STICKY_COLUMN_ID && stickyColumnClass,
                            )}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        </React.Fragment>
                      ))}
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={table.getVisibleLeafColumns().length + 1}
                    className="h-24 text-center"
                  >
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
