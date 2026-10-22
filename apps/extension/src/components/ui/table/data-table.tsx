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
  'sticky right-0 z-10 border-l bg-card px-1',
  'group-hover:bg-[color-mix(in_srgb,var(--color-muted)_50%,var(--color-background))]',
  'group-[.is-folder]:bg-[color-mix(in_srgb,var(--color-muted)_50%,var(--color-background))]',
  'group-[.is-folder]:group-hover:bg-[color-mix(in_srgb,var(--color-muted)_70%,var(--color-background))]',
  'group-data-[state=selected]:bg-accent!',
);

// An unsized column before the row actions takes any width the sized columns leave, so each
// column keeps exactly the width it was given.
const FILLER_CELL_CLASS = 'w-auto p-0';

// The selection bar's height, kept up to date on the table's root for the rows' scroll margin.
const SELECTION_BAR_HEIGHT_PROPERTY = '--selection-bar-height';

/** Marks the frame around the grid, which takes focus when no row is left to focus. */
export const GRID_FRAME_ATTRIBUTE = 'data-grid-frame';

/** A row of the grid: a table row in the list view, a card in the cards view. */
const ROW_SELECTOR = '[data-row-id]';
const rowSelector = (rowId: string) => `[data-row-id="${CSS.escape(rowId)}"]`;

/** How many cards a row of the cards view holds, read from its grid. */
function cardColumns(card: HTMLElement): number {
  const grid = card.parentElement;
  if (!grid) return 1;
  return Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length);
}

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
  /**
   * The order `data` is in (the Sort Order setting): whether it is the browser's own order, and
   * its name. Without it, `data` is taken to be in another order.
   */
  dataOrder?: { browserOrder: boolean; label: string };
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
  /** Double-click: open a folder, or a bookmark in a tab. */
  onRowOpen?: (row: TData) => void;
  /** Middle-click: open a bookmark in a background tab. */
  onRowOpenInBackground?: (row: TData) => void;
  rowClassName?: (row: TData) => string;
  /** Drawn at the top of a row's card in the cards view, such as a stored cover. */
  cardMedia?: (row: TData) => React.ReactNode;
  /** Receives the table's selection commands, for the page's keyboard shortcuts. */
  handleRef?: React.Ref<DataTableHandle<TData>>;
  /** Wraps the table's frame, for example in a right-click menu. */
  renderFrame?: (frame: React.ReactElement) => React.ReactNode;
  /** Extra props for a row, such as drag and drop handlers. */
  getRowProps?: (row: TData) => React.HTMLAttributes<HTMLTableRowElement>;
  /** Accessible name of the grid. */
  label?: string;
  /** Enables saved searches, which need to know and change the folder the manager shows. */
  savedSearchContext?: DataTableSavedSearchContext;
  /** The search box, kept by the page (it is the address's `?q=`). */
  searchQuery: string;
  /** What the search box's query matches (`useSearchMatches`). */
  searchMatches: SearchMatches;
  onSearchQueryChange: (query: string) => void;
  /**
   * Shows a row in the folder the table switches to (Show in folder): clears the filters, opens
   * the page that holds it, selects it, and focuses it. A new object repeats the request.
   */
  revealRow?: DataTableRevealRequest | null;
  /** Told whether the table lists matches from every folder instead of the folder shown. */
  onShowsAllBookmarksChange?: (showsAll: boolean) => void;
}

/** Columns that already show a row's folder. */
const FOLDER_COLUMN_IDS = ['folderPath', 'parentId'];

/**
 * What the page's keyboard shortcuts ask of the table. The rows are a grid with one focused row
 * (roving tabindex) and a selection, as in Chrome's manager.
 */
export type DataTableHandle<TData> = {
  /** The selected rows the filters show, in display order; else the focused row; else none. */
  getCommandRows: () => TData[];
  /** Selects every selectable row the filters show, on every page. */
  selectAll: () => void;
  /** Clears the selection; false when nothing was selected. */
  clearSelection: () => boolean;
  /** Moves focus one row down or up (to the next page if needed) and selects that row. */
  moveFocus: (step: 1 | -1) => boolean;
  /** The rows of the page shown, in display order (the bookmark preview steps through them). */
  getPageRows: () => TData[];
  /**
   * Makes `rowId` the focused row and the only selected one, as the arrow keys do, without moving
   * keyboard focus; false when the filters do not show it.
   */
  selectRow: (rowId: string) => boolean;
  /**
   * The rows a right click on `rowId` acts on, as in Chrome: the selection when the row is in
   * it; otherwise the row alone, which becomes the selection.
   */
  targetRowsAt: (rowId: string) => TData[];
  /** Whether the rows are the folder in the browser's order, so a drop between rows reorders. */
  canReorderRows: () => boolean;
};

export type DataTableRevealRequest = {
  rowId: string;
  /** The `resetKey` (folder) the row is in; the request waits until the table shows it. */
  resetKey: string | null;
};

/** The column the page's search box filters. */
const SEARCH_COLUMN_ID = 'title';

export type DataTableSavedSearchContext = {
  /** The folder shown; null is the top level. */
  currentFolderId: string | null;
  /** IDs of folders that exist now, to skip stale folder IDs in saved searches. */
  folderIds: ReadonlySet<string>;
  onNavigateToFolder: (folderId: string | null) => void;
};

const NO_FOLDER_IDS: ReadonlySet<string> = new Set();

/**
 * Whether a mouse event on a row came from a control inside it (a button, link, checkbox, or a
 * menu rendered in a portal, whose React events still reach the row), which handles it itself.
 */
function isFromControl(event: React.MouseEvent): boolean {
  const target = event.target as Element | null;
  return Boolean(
    target?.closest?.(
      'button, a[href], input, [role="checkbox"], [role="menu"], [role="menuitem"]',
    ),
  );
}

function resolveUpdater<T>(updater: Updater<T>, previous: T): T {
  return typeof updater === 'function' ? (updater as (old: T) => T)(previous) : updater;
}

export function DataTable<TData extends RowData>({
  columns,
  data,
  browserOrderData,
  dataOrder,
  allData,
  getRowId,
  canSelectRow,
  resetKey,
  initialPageIndex = 0,
  onPageIndexChange,
  facetOptions,
  renderSelectionActions,
  onRowOpen,
  onRowOpenInBackground,
  rowClassName,
  cardMedia,
  handleRef,
  renderFrame,
  getRowProps,
  label,
  savedSearchContext,
  searchQuery,
  searchMatches,
  onSearchQueryChange,
  revealRow,
  onShowsAllBookmarksChange,
}: DataTableProps<TData>) {
  // Read before the first render when the page preloaded it, so the columns never move once shown.
  const [preloadedView] = React.useState(readPreloadedBookmarkTableView);
  const { value: viewMode } = useSetting('managerViewMode');
  const initialView = preloadedView ?? DEFAULT_BOOKMARK_TABLE_VIEW;
  const [sorting, setSorting] = React.useState<SortingState>(initialView.sorting);
  // Filters other than the search box, which the page keeps (`searchQuery`).
  const [otherColumnFilters, setOtherColumnFilters] = React.useState<ColumnFiltersState>([]);
  const columnFilters = React.useMemo<ColumnFiltersState>(() => {
    if (!searchQuery) return otherColumnFilters;
    const search: TitleSearchFilter = { text: searchQuery, matches: searchMatches };
    return [{ id: SEARCH_COLUMN_ID, value: search }, ...otherColumnFilters];
  }, [otherColumnFilters, searchMatches, searchQuery]);
  // Where each listed row matched, for the note under its title; none without a filtering search.
  const searchMatchReasons =
    searchQuery && typeof searchMatches !== 'string' ? searchMatches : undefined;
  const columnFiltersRef = React.useRef(columnFilters);
  columnFiltersRef.current = columnFilters;
  const onSearchQueryChangeRef = React.useRef(onSearchQueryChange);
  onSearchQueryChangeRef.current = onSearchQueryChange;
  /** Splits filters into the search box, which goes to the page, and the rest. */
  const setColumnFilters = React.useCallback((filters: ColumnFiltersState) => {
    const search = filters.find((filter) => filter.id === SEARCH_COLUMN_ID)?.value;
    onSearchQueryChangeRef.current(titleSearchText(search));
    setOtherColumnFilters(filters.filter((filter) => filter.id !== SEARCH_COLUMN_ID));
  }, []);
  const [columnVisibility, setColumnVisibility] = React.useState<ColumnVisibilityState>(
    initialView.columnVisibility,
  );
  const [columnOrder, setColumnOrder] = React.useState<ColumnOrderState>(initialView.columnOrder);
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: initialPageIndex,
    pageSize: initialView.pageSize,
  });
  const [browserOrder, setBrowserOrder] = React.useState(initialView.browserOrder);
  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>(
    initialView.columnSizing,
  );
  const [savedColumnSizing, setSavedColumnSizing] = React.useState<ColumnSizingState>(
    initialView.columnSizing,
  );
  const [columnResizing, setColumnResizing] =
    React.useState<columnResizingState>(IDLE_COLUMN_RESIZING);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  // The row a Shift range starts from, and the row with tabindex 0 (roving tabindex): the grid is
  // one tab stop, and the arrow keys move between rows.
  const anchorRowIdRef = React.useRef<string | null>(null);
  const [focusedRowId, setFocusedRowId] = React.useState<string | null>(null);
  // A row to focus once it is rendered (on another page, or after Show in folder).
  const pendingFocusRowIdRef = React.useRef<string | null>(null);
  const [applyToCurrentFolder, setApplyToCurrentFolder] = React.useState(false);
  const [isTableViewLoaded, setIsTableViewLoaded] = React.useState(preloadedView !== undefined);
  // The view as last loaded or stored, so a change stores only the parts that changed.
  const storedViewRef = React.useRef<BookmarkTableView | null>(preloadedView ?? null);
  const tableFrameRef = React.useRef<HTMLDivElement>(null);
  const [tableWidth, setTableWidth] = React.useState<number>();

  // The fill columns' widths depend on the frame's width, so the frame stays invisible until it is
  // measured: a first frame drawn at the default widths moved Date Added across the table.
  React.useLayoutEffect(() => {
    const frame = tableFrameRef.current;
    if (!frame) return;
    setTableWidth(frame.clientWidth);
    const observer = new ResizeObserver(([entry]) => setTableWidth(entry.contentRect.width));
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);
  const spaceHiddenColumnIds = React.useMemo(
    () => getSpaceHiddenColumnIds(tableWidth),
    [tableWidth],
  );

  React.useEffect(() => {
    if (preloadedView) return;
    let active = true;
    getBookmarkTableView().then((view) => {
      if (!active) return;
      setSorting(view.sorting);
      setColumnVisibility(view.columnVisibility);
      setColumnOrder(view.columnOrder);
      // The page restored from history (a reload or Back) was saved with this page size.
      setPagination((previous) => ({ ...previous, pageSize: view.pageSize }));
      setBrowserOrder(view.browserOrder);
      setColumnSizing(view.columnSizing);
      setSavedColumnSizing(view.columnSizing);
      storedViewRef.current = view;
      setIsTableViewLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [preloadedView]);

  React.useEffect(() => {
    const stored = storedViewRef.current;
    if (!isTableViewLoaded || !stored) return;
    const view: BookmarkTableView = {
      sorting,
      columnVisibility,
      columnOrder,
      pageSize: pagination.pageSize,
      browserOrder,
      columnSizing: savedColumnSizing,
    };
    const changes = Object.fromEntries(
      Object.entries(view).filter(
        ([key, value]) => !isSameJson(value, stored[key as keyof BookmarkTableView]),
      ),
    ) as Partial<BookmarkTableView>;
    if (Object.keys(changes).length === 0) return;
    storedViewRef.current = view;
    void updateBookmarkTableView(changes).catch((error) =>
      console.error('Failed to save bookmark table view:', error),
    );
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
    // Widths are saved to sync storage, which limits writes per minute, so keyboard resizing is
    // saved once the presses stop and dragging once it ends.
    const timer = setTimeout(() => setSavedColumnSizing(columnSizing), COLUMN_SIZING_SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [columnSizing, isResizingColumn]);

  // Navigating to another folder starts on its first page (or, going Back, on the page that was
  // open) with nothing selected. The page is read when the key changes, not tracked.
  const initialPageIndexRef = React.useRef(initialPageIndex);
  initialPageIndexRef.current = initialPageIndex;
  // Focus that navigation took away (the activated row or breadcrumb is gone) moves to a row of
  // the new folder once its page shows: the row of the folder just left, or the first row.
  const lastResetKeyRef = React.useRef(resetKey);
  const pendingRowFocusRef = React.useRef<{ rowId: string | null; pageIndex: number } | null>(null);
  React.useEffect(() => {
    setPagination((previous) => ({ ...previous, pageIndex: initialPageIndexRef.current }));
    setRowSelection({});
    anchorRowIdRef.current = null;
    if (lastResetKeyRef.current !== resetKey) {
      pendingRowFocusRef.current = {
        rowId: lastResetKeyRef.current ?? null,
        pageIndex: initialPageIndexRef.current,
      };
      lastResetKeyRef.current = resetKey;
    }
  }, [resetKey]);

  // Show in folder: drop the filters so the folder's rows show, then (below, once the table shows
  // that folder) open the row's page, select it, and focus it.
  const pendingRevealRef = React.useRef<DataTableRevealRequest | null>(null);
  React.useEffect(() => {
    if (!revealRow) return;
    pendingRevealRef.current = revealRow;
    pendingRowFocusRef.current = null;
    setOtherColumnFilters([]);
    setApplyToCurrentFolder(false);
  }, [revealRow]);

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
      setColumnFilters(resolveUpdater(updater, columnFiltersRef.current));
      goToFirstPage();
    },
    [goToFirstPage, setColumnFilters],
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
      // The folder first: its history entry then also takes the search (see the page's dwell).
      if (resolved.folderId !== undefined) context?.onNavigateToFolder(resolved.folderId);
      setColumnFilters(resolved.columnFilters);
      setSorting(resolved.sorting);
      setApplyToCurrentFolder(resolved.folderId !== undefined);
      goToFirstPage();
      return { missingFolderCount: resolved.missingFolderCount };
    },
    [goToFirstPage, setColumnFilters],
  );

  const resetView = React.useCallback(() => {
    setSorting([]);
    setColumnVisibility({ ...DEFAULT_BOOKMARK_TABLE_VIEW.columnVisibility });
    setColumnOrder([...DEFAULT_BOOKMARK_TABLE_VIEW.columnOrder]);
    setPagination({ pageIndex: 0, pageSize: DEFAULT_BOOKMARK_TABLE_VIEW.pageSize });
    setBrowserOrder(DEFAULT_BOOKMARK_TABLE_VIEW.browserOrder);
    setColumnSizing({});
    setSavedColumnSizing({});
    storedViewRef.current = structuredClone(DEFAULT_BOOKMARK_TABLE_VIEW);
    void resetBookmarkTableView().catch((error) =>
      console.error('Failed to reset bookmark table view:', error),
    );
  }, []);

  const folderData = browserOrder ? browserOrderData : data;
  const showsAllBookmarks = columnFilters.length > 0 && !applyToCurrentFolder;
  const displayedData = showsAllBookmarks ? allData : folderData;
  const filterScope = applyToCurrentFolder ? folderData : allData;

  // The folder is in the browser's order with the toggle on, or when that is the setting's order.
  const folderInBrowserOrder = browserOrder || dataOrder?.browserOrder === true;
  const [columnSort] = sorting;
  const order: DataTableOrderState = {
    browserOrder: folderInBrowserOrder && !columnSort,
    browserOrderIsDefault: dataOrder?.browserOrder === true,
    description: columnSort
      ? t(
          'managerDefaults_orderStatus',
          t(
            columnSort.desc ? 'table_sortedDesc' : 'table_sortedAsc',
            getBookmarkColumnLabel(columnSort.id),
          ),
        )
      : !folderInBrowserOrder && dataOrder
        ? t('managerDefaults_orderStatus', dataOrder.label)
        : null,
  };

  const moveDisabledReason = !folderInBrowserOrder
    ? t('table_moveNeedsBrowserOrder')
    : sorting.length > 0
      ? t('table_moveNeedsNoColumnSort')
      : showsAllBookmarks
        ? t('table_moveNeedsFolderView')
        : null;
  const moveDisabledReasonRef = React.useRef(moveDisabledReason);
  moveDisabledReasonRef.current = moveDisabledReason;

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
  // Matches from every folder name their folder under the title, unless a folder column does.
  const showRowFolders =
    showsAllBookmarks && !FOLDER_COLUMN_IDS.some((id) => visibleColumnIds.includes(id));
  React.useEffect(() => {
    onShowsAllBookmarksChange?.(showsAllBookmarks);
  }, [onShowsAllBookmarksChange, showsAllBookmarks]);
  const renderedColumnSizing = React.useMemo(
    () => getRenderedColumnSizing(columnSizing, visibleColumnIds, tableWidth),
    [columnSizing, tableWidth, visibleColumnIds],
  );
  // Size updates arrive relative to the rendered widths (Title and URL may be filling spare
  // room); only widths the user actually set are kept.
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

  // Shown data columns move by dragging their headers, or from the header menus.
  const columnReorder = useColumnReorder({
    order: columnOrder,
    onReorder: setColumnOrder,
    isMovable: (id) => {
      const column = table.getColumn(id);
      return column !== undefined && isConfigurableColumn(column) && visibleColumnIds.includes(id);
    },
    getLabel: getBookmarkColumnLabel,
  });

  // Keep the page in range when refreshes or deletions shrink the list. Not before the saved view
  // loads: the restored page may only exist at the saved page size.
  const pageCount = table.getPageCount();
  React.useEffect(() => {
    if (!isTableViewLoaded) return;
    if (pagination.pageIndex > 0 && pagination.pageIndex >= pageCount) {
      setPagination((previous) => ({ ...previous, pageIndex: Math.max(0, pageCount - 1) }));
    }
  }, [isTableViewLoaded, pageCount, pagination.pageIndex]);

  React.useEffect(() => {
    const pending = pendingRowFocusRef.current;
    if (!pending) return;
    // Wait for the page the folder opens on (clamped like the page itself).
    if (pagination.pageIndex !== Math.min(pending.pageIndex, Math.max(0, pageCount - 1))) return;
    pendingRowFocusRef.current = null;
    // Focus the user put somewhere else, such as the folder tree, stays there.
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const rows = Array.from(
      tableFrameRef.current?.querySelectorAll<HTMLElement>(ROW_SELECTOR) ?? [],
    );
    const previous = rows.find((row) => row.dataset.rowId === pending.rowId);
    for (const row of previous ? [previous, ...rows] : rows) {
      const target = getTableRowFocusTarget(row);
      if (target) {
        target.focus();
        return;
      }
    }
  });

  // A Show in folder request, once the table shows the folder unfiltered.
  React.useEffect(() => {
    const pending = pendingRevealRef.current;
    if (!pending || !isTableViewLoaded) return;
    if (pending.resetKey !== resetKey || columnFilters.length > 0) return;
    pendingRevealRef.current = null;
    const index = table.getPrePaginatedRowModel().rows.findIndex((row) => row.id === pending.rowId);
    if (index < 0) return;
    setPagination((previous) => ({
      ...previous,
      pageIndex: Math.floor(index / previous.pageSize),
    }));
    setRowSelection({ [pending.rowId]: true });
    anchorRowIdRef.current = pending.rowId;
    pendingFocusRowIdRef.current = pending.rowId;
  });
  React.useEffect(() => {
    const rowId = pendingFocusRowIdRef.current;
    if (!rowId) return;
    const row = tableFrameRef.current?.querySelector<HTMLElement>(rowSelector(rowId));
    if (!row) return;
    pendingFocusRowIdRef.current = null;
    // Rows keep a scroll margin the height of the selection bar, so it never covers this one.
    row.scrollIntoView({ block: 'nearest' });
    row.focus({ preventScroll: true });
  });

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
  // Bulk actions only touch selected rows the current filters show (on any page), matching the
  // footer count; selected rows hidden by a filter are reported but never moved or deleted.
  // Visible rows come in display order (filtered and sorted), so a bulk move keeps the order the
  // user sees; object keys would put numeric bookmark IDs in ascending order instead.
  const shownRows = table.getPrePaginatedRowModel().rows;
  const shownRowIds = new Set(shownRows.map((row) => row.id));
  const selectedRows = [
    ...shownRows.map((row) => row.original),
    ...displayedData.filter((row) => !shownRowIds.has(getRowId(row))),
  ].filter((row) => rowSelection[getRowId(row)]);
  const { visible: visibleSelectedRows, hiddenCount: hiddenSelectedCount } =
    partitionSelectionByVisibility(selectedRows, shownRowIds, getRowId);
  const clearSelection = React.useCallback(() => setRowSelection({}), []);

  // Clicks, the arrow keys, and the page's shortcuts change the selection through these. They
  // read the latest rows from a ref, so the handle stays one object.
  const { shownRowIdsInOrder, shownRowsById } = React.useMemo(
    () => ({
      shownRowIdsInOrder: shownRows.map((row) => row.id),
      shownRowsById: new Map(shownRows.map((row) => [row.id, row])),
    }),
    [shownRows],
  );
  const latestRef = React.useRef({
    shownRows,
    shownRowIdsInOrder,
    shownRowsById,
    rowSelection,
    focusedRowId,
  });
  latestRef.current = { shownRows, shownRowIdsInOrder, shownRowsById, rowSelection, focusedRowId };
  const canSelectRowRef = React.useRef(canSelectRow);
  canSelectRowRef.current = canSelectRow;
  const pageSizeRef = React.useRef(pagination.pageSize);
  pageSizeRef.current = pagination.pageSize;

  const canSelectId = React.useCallback((id: string) => {
    const row = latestRef.current.shownRowsById.get(id);
    const select = canSelectRowRef.current;
    return row !== undefined && (!select || select(row.original));
  }, []);

  const changeSelection = React.useCallback(
    (targetId: string, change: RowSelectionChange) => {
      const { shownRowIdsInOrder: ids, rowSelection: current } = latestRef.current;
      const next = selectRows(
        {
          selected: new Set(Object.keys(current).filter((id) => current[id])),
          anchorId: anchorRowIdRef.current,
        },
        ids,
        targetId,
        change,
        canSelectId,
      );
      anchorRowIdRef.current = next.anchorId;
      setRowSelection(Object.fromEntries([...next.selected].map((id) => [id, true])));
    },
    [canSelectId],
  );

  /** Focuses the row at `index` of the shown rows, opening its page first if needed. */
  const focusRowAt = React.useCallback((index: number) => {
    const { shownRowIdsInOrder: ids } = latestRef.current;
    const rowId = ids[Math.min(ids.length - 1, Math.max(0, index))];
    if (!rowId) return undefined;
    const pageIndex = Math.floor(ids.indexOf(rowId) / pageSizeRef.current);
    setPagination((previous) =>
      previous.pageIndex === pageIndex ? previous : { ...previous, pageIndex },
    );
    setFocusedRowId(rowId);
    pendingFocusRowIdRef.current = rowId;
    return rowId;
  }, []);

  // When the focused row leaves the list (deleted, or moved out of the folder), focus goes to the
  // next row, else the previous one, else the grid, as in Chrome's manager. Only once focus is
  // lost: a confirmation dialog gives it back as it closes, which can be after the row is gone,
  // and focus the user put somewhere else (the filter, the tree) stays there.
  const previousRowsRef = React.useRef({ ids: shownRowIdsInOrder, resetKey });
  const focusWaitFrameRef = React.useRef(0);
  React.useEffect(() => () => cancelAnimationFrame(focusWaitFrameRef.current), []);
  React.useEffect(() => {
    const { ids: previous, resetKey: previousResetKey } = previousRowsRef.current;
    previousRowsRef.current = { ids: shownRowIdsInOrder, resetKey };
    // Another folder: focus goes to its rows as navigation decides (`pendingRowFocusRef`).
    if (previousResetKey !== resetKey || pendingRowFocusRef.current || pendingRevealRef.current) {
      return;
    }
    const removed = latestRef.current.focusedRowId;
    if (!removed || shownRowIdsInOrder.includes(removed) || !previous.includes(removed)) return;
    const replacement = rowAfterRemoval(previous, shownRowIdsInOrder, removed);
    setFocusedRowId(replacement);
    const deadline = performance.now() + REMOVED_ROW_FOCUS_WAIT_MS;
    const moveFocus = () => {
      const active = document.activeElement;
      if (active && active !== document.body) {
        // Still in a closing dialog or menu: wait for it to give focus back.
        if (active.closest(KEYBOARD_OVERLAY_SELECTOR) && performance.now() < deadline) {
          focusWaitFrameRef.current = requestAnimationFrame(moveFocus);
        }
        return;
      }
      const { shownRowIdsInOrder: ids } = latestRef.current;
      const element = replacement
        ? tableFrameRef.current?.querySelector<HTMLElement>(rowSelector(replacement))
        : null;
      if (element) element.focus();
      else if (replacement && ids.includes(replacement)) focusRowAt(ids.indexOf(replacement));
      else tableFrameRef.current?.focus();
    };
    cancelAnimationFrame(focusWaitFrameRef.current);
    moveFocus();
  }, [focusRowAt, resetKey, shownRowIdsInOrder]);

  /** Arrow keys, Home, and End: move focus, and select as Chrome's list does. */
  const moveRowFocus = React.useCallback(
    (
      to: 'next' | 'previous' | 'first' | 'last' | { by: number },
      modifiers = { shiftKey: false, toggleKey: false },
    ) => {
      const { shownRowIdsInOrder: ids, focusedRowId: current } = latestRef.current;
      if (ids.length === 0) return false;
      const currentIndex = current ? ids.indexOf(current) : -1;
      const index =
        typeof to === 'object'
          ? currentIndex < 0
            ? 0
            : Math.min(ids.length - 1, Math.max(0, currentIndex + to.by))
          : {
              next: currentIndex < 0 ? 0 : currentIndex + 1,
              previous: currentIndex < 0 ? ids.length - 1 : currentIndex - 1,
              first: 0,
              last: ids.length - 1,
            }[to];
      const rowId = focusRowAt(index);
      if (!rowId) return false;
      if (modifiers.toggleKey && !modifiers.shiftKey) {
        // Ctrl (Cmd) moves focus only; the next Shift range starts here.
        anchorRowIdRef.current = rowId;
      } else {
        if (modifiers.shiftKey && anchorRowIdRef.current === null && current) {
          anchorRowIdRef.current = current;
        }
        changeSelection(rowId, {
          clear: !modifiers.toggleKey,
          range: modifiers.shiftKey,
          toggle: false,
        });
      }
      return true;
    },
    [changeSelection, focusRowAt],
  );

  React.useImperativeHandle(
    handleRef,
    (): DataTableHandle<TData> => ({
      getCommandRows: () => {
        const {
          shownRows: rows,
          rowSelection: selection,
          focusedRowId: focused,
        } = latestRef.current;
        const selected = rows.filter((row) => selection[row.id]).map((row) => row.original);
        if (selected.length > 0) return selected;
        const focusedRow = rows.find((row) => row.id === focused);
        return focusedRow ? [focusedRow.original] : [];
      },
      selectAll: () => {
        const { shownRowIdsInOrder: ids } = latestRef.current;
        setRowSelection(Object.fromEntries(ids.filter(canSelectId).map((id) => [id, true])));
      },
      clearSelection: () => {
        const { rowSelection: selection } = latestRef.current;
        if (!Object.values(selection).some(Boolean)) return false;
        setRowSelection({});
        return true;
      },
      moveFocus: (step) => moveRowFocus(step === 1 ? 'next' : 'previous'),
      getPageRows: () => table.getRowModel().rows.map((row) => row.original),
      selectRow: (rowId) => {
        if (!latestRef.current.shownRowsById.has(rowId)) return false;
        changeSelection(rowId, { clear: true, range: false, toggle: false });
        setFocusedRowId(rowId);
        return true;
      },
      canReorderRows: () => moveDisabledReasonRef.current === null,
      targetRowsAt: (rowId) => {
        const { shownRows: rows, shownRowsById: byId, rowSelection: selection } = latestRef.current;
        const row = byId.get(rowId);
        if (!row) return [];
        if (selection[rowId]) {
          return rows.filter((shown) => selection[shown.id]).map((shown) => shown.original);
        }
        changeSelection(rowId, { clear: true, range: false, toggle: false });
        setFocusedRowId(rowId);
        return [row.original];
      },
    }),
    [canSelectId, changeSelection, moveRowFocus, table],
  );

  const handleRowClick = (event: React.MouseEvent<HTMLElement>, rowId: string) => {
    // The second click of a double click opens the row; it must not undo a Ctrl selection.
    if (event.detail > 1 || isFromControl(event)) return;
    const toggleKey = isApplePlatform() ? event.metaKey : event.ctrlKey;
    changeSelection(rowId, rowSelectionChangeFor({ shiftKey: event.shiftKey, toggleKey }));
    setFocusedRowId(rowId);
  };

  const handleRowKeyDown = (event: React.KeyboardEvent<HTMLElement>, rowId: string) => {
    if (event.target !== event.currentTarget || event.altKey) return;
    const toggleKey = isApplePlatform() ? event.metaKey : event.ctrlKey;
    // Cards sit in columns: Left and Right go one card, Up and Down one row of cards.
    const columns = viewMode === 'cards' ? cardColumns(event.currentTarget) : 1;
    type RowMove = 'next' | 'previous' | 'first' | 'last' | { by: number };
    const moves: Record<string, RowMove> =
      viewMode === 'cards'
        ? {
            ArrowRight: 'next',
            ArrowLeft: 'previous',
            ArrowDown: { by: columns },
            ArrowUp: { by: -columns },
            Home: 'first',
            End: 'last',
          }
        : { ArrowDown: 'next', ArrowUp: 'previous', Home: 'first', End: 'last' };
    const move: RowMove | undefined = moves[event.key];
    if (move) {
      event.preventDefault();
      moveRowFocus(move, { shiftKey: event.shiftKey, toggleKey });
      return;
    }
    if (event.key === ' ') {
      event.preventDefault();
      changeSelection(rowId, { clear: false, range: false, toggle: true });
    }
  };

  // The sticky selection bar covers the bottom of the scroll area; rows scrolled into view keep
  // its height as their bottom scroll margin (`--selection-bar-height`).
  const rootRef = React.useRef<HTMLDivElement>(null);
  const selectionBarRef = React.useRef<HTMLDivElement>(null);
  const hasSelectionBar = selectedRows.length > 0;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the bar mounts and unmounts with `hasSelectionBar`, which re-reads its ref.
  React.useEffect(() => {
    const root = rootRef.current;
    const bar = selectionBarRef.current;
    if (!root) return;
    if (!bar) {
      root.style.setProperty(SELECTION_BAR_HEIGHT_PROPERTY, '0px');
      return;
    }
    // The bar sticks inside the scroll area's bottom padding, so that is covered too.
    let scroller = root.parentElement;
    while (scroller && !/auto|scroll/.test(getComputedStyle(scroller).overflowY)) {
      scroller = scroller.parentElement;
    }
    const padding = scroller ? Number.parseFloat(getComputedStyle(scroller).paddingBottom) : 0;
    const setHeight = () => {
      const height = bar.getBoundingClientRect().height + (padding || 0);
      root.style.setProperty(SELECTION_BAR_HEIGHT_PROPERTY, `${Math.ceil(height)}px`);
    };
    setHeight();
    const observer = new ResizeObserver(setHeight);
    observer.observe(bar);
    return () => observer.disconnect();
  }, [hasSelectionBar]);

  const wrapFrame = renderFrame ?? ((frame: React.ReactElement) => frame);

  // The row that takes Tab focus: the focused row while it is on this page, else the first row.
  const pageRows = table.getRowModel().rows;
  const tabStopRowId = pageRows.some((row) => row.id === focusedRowId)
    ? focusedRowId
    : pageRows[0]?.id;

  /** What a row needs in either view: its id, selection, focus, and pointer and key handlers. */
  const rowProps = (row: (typeof pageRows)[number]) => {
    const selectable = row.getCanSelect();
    return {
      'data-row-id': row.id,
      'data-state': row.getIsSelected() ? 'selected' : undefined,
      'aria-selected': selectable ? row.getIsSelected() : undefined,
      tabIndex: row.id === tabStopRowId ? 0 : -1,
      onFocus: (event: React.FocusEvent<HTMLElement>) => {
        if (event.target === event.currentTarget) setFocusedRowId(row.id);
      },
      onMouseDown: (event: React.MouseEvent<HTMLElement>) => {
        // Shift+click selects rows, not text.
        if (event.shiftKey) event.preventDefault();
      },
      onClick: (event: React.MouseEvent<HTMLElement>) => handleRowClick(event, row.id),
      onDoubleClick: (event: React.MouseEvent<HTMLElement>) => {
        if (!isFromControl(event)) onRowOpen?.(row.original);
      },
      onAuxClick: (event: React.MouseEvent<HTMLElement>) => {
        if (event.button !== 1 || !onRowOpenInBackground) return;
        event.preventDefault();
        onRowOpenInBackground(row.original);
      },
      onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => handleRowKeyDown(event, row.id),
      ...getRowProps?.(row.original),
    };
  };

  return (
    // A column that fills the scroll area, so the frame's wrapper (the empty-space menu and drop
    // area) reaches down to the pagination even when the folder has few rows.
    <div ref={rootRef} className="flex min-w-0 flex-1 flex-col gap-4">
      <DataTableToolbar
        table={table}
        applyToCurrentFolder={applyToCurrentFolder}
        onApplyToCurrentFolderChange={handleApplyToCurrentFolderChange}
        onResetView={resetView}
        facetOptions={facetOptions}
        facetScope={filterScope}
        order={order}
        onBrowserOrderChange={handleBrowserOrderChange}
        spaceHiddenColumnIds={spaceHiddenColumnIds}
        columnVisibilityPreference={columnVisibility}
        savedSearches={
          savedSearchContext
            ? { currentQuery: currentSavedSearchQuery, onApply: applySavedSearch }
            : undefined
        }
      />
      {wrapFrame(
        // Focusable from script only: focus lands here when the last focused row is removed.
        <div
          ref={tableFrameRef}
          tabIndex={-1}
          style={tableWidth === undefined ? { visibility: 'hidden' } : undefined}
          {...{ [GRID_FRAME_ATTRIBUTE]: '' }}
          className="rounded-md border bg-card outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MoveDisabledReasonContext.Provider value={moveDisabledReason}>
            <CardsViewContext.Provider value={viewMode === 'cards'}>
              <RowFolderPathContext.Provider value={showRowFolders}>
                <SearchReasonsContext.Provider value={searchMatchReasons}>
                  {/* Fixed layout applies the column sizes as given; the table only grows past the frame
              (and scrolls) when the columns need more room than it has. */}
                  {viewMode === 'cards' ? (
                    // biome-ignore lint/a11y/useSemanticElements: cards wrap into columns, which a table cannot.
                    <div
                      role="grid"
                      aria-multiselectable="true"
                      aria-rowcount={shownRows.length}
                      aria-label={label}
                      data-testid="bookmark-cards"
                      style={
                        { '--card-min-width': `${CARD_MIN_WIDTH_PX}px` } as React.CSSProperties
                      }
                      className="grid grid-cols-[repeat(auto-fill,minmax(var(--card-min-width),1fr))] gap-3 p-3"
                    >
                      {pageRows.length ? (
                        pageRows.map((row, rowIndex) => {
                          // A card shows the same cells as the row: the checkbox, the title (with its
                          // icon and, across folders, its folder), the actions, and the address.
                          const cellOf = (columnId: string) => {
                            const cell = row
                              .getAllCells()
                              .find((entry) => entry.column.id === columnId);
                            return cell
                              ? flexRender(cell.column.columnDef.cell, cell.getContext())
                              : null;
                          };
                          return (
                            // biome-ignore lint/a11y/useSemanticElements: a card in the cards grid, not a table row.
                            <div
                              key={row.id}
                              role="row"
                              {...rowProps(row)}
                              tabIndex={row.id === tabStopRowId ? 0 : -1}
                              aria-rowindex={
                                pagination.pageIndex * pagination.pageSize + rowIndex + 1
                              }
                              data-slot="bookmark-card"
                              className={cn(
                                'group flex min-w-0 scroll-mb-(--selection-bar-height) flex-col gap-1 rounded-lg border bg-card p-3 hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring data-[state=selected]:bg-accent',
                                rowClassName?.(row.original),
                              )}
                            >
                              {cardMedia?.(row.original)}
                              {/* biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: a card's cell; the card takes focus, as a table row does. */}
                              <div role="gridcell" className="flex min-w-0 items-start gap-2">
                                {cellOf('select')}
                                <div className="min-w-0 flex-1">{cellOf('title')}</div>
                                <div className="-mt-1 -mr-1 shrink-0">
                                  {cellOf(STICKY_COLUMN_ID)}
                                </div>
                              </div>
                              {/* biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: a card's cell; the card takes focus, as a table row does. */}
                              <div
                                role="gridcell"
                                tabIndex={-1}
                                className="min-w-0 truncate pl-6 text-xs text-muted-foreground"
                              >
                                {cellOf('url')}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <p className="col-span-full py-8 text-center text-sm">
                          {t('table_noResults')}
                        </p>
                      )}
                    </div>
                  ) : (
                    <Table
                      className="table-fixed"
                      style={{ minWidth: table.getTotalSize() }}
                      role="grid"
                      aria-multiselectable="true"
                      aria-rowcount={shownRows.length + 1}
                      aria-label={label}
                      data-testid="bookmark-grid"
                    >
                      <TableHeader>
                        <ColumnReorderContext.Provider value={columnReorder}>
                          {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id} aria-rowindex={1}>
                              {headerGroup.headers.map((header) => (
                                <React.Fragment key={header.id}>
                                  {header.column.id === STICKY_COLUMN_ID && (
                                    <TableHead aria-hidden="true" className={FILLER_CELL_CLASS} />
                                  )}
                                  <DraggableTableHead
                                    columnId={header.column.id}
                                    style={{ width: header.getSize() }}
                                    className={cn(
                                      header.column.getCanResize() && 'relative truncate',
                                      header.column.id === STICKY_COLUMN_ID &&
                                        'sticky right-0 z-10 border-l bg-card px-1',
                                    )}
                                  >
                                    {header.isPlaceholder
                                      ? null
                                      : flexRender(
                                          header.column.columnDef.header,
                                          header.getContext(),
                                        )}
                                    {header.column.getCanResize() && (
                                      <DataTableColumnResizer header={header} />
                                    )}
                                  </DraggableTableHead>
                                </React.Fragment>
                              ))}
                            </TableRow>
                          ))}
                        </ColumnReorderContext.Provider>
                      </TableHeader>
                      <TableBody>
                        {table.getRowModel().rows?.length ? (
                          pageRows.map((row, rowIndex) => {
                            return (
                              <TableRow
                                key={row.id}
                                {...rowProps(row)}
                                // The header row is 1; rows count across pages.
                                aria-rowindex={
                                  pagination.pageIndex * pagination.pageSize + rowIndex + 2
                                }
                                className={cn(
                                  'scroll-mb-(--selection-bar-height) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                                  rowClassName?.(row.original),
                                )}
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
                  )}
                </SearchReasonsContext.Provider>
              </RowFolderPathContext.Provider>
            </CardsViewContext.Provider>
          </MoveDisabledReasonContext.Provider>
        </div>,
      )}
      <DataTablePagination table={table} />
      {/* After the rows, so selecting never moves them (a double click's second click would
          land on another row), and sticky, so it stays in view at the bottom of a long page. */}
      {hasSelectionBar && (
        <div ref={selectionBarRef} className="sticky bottom-0 z-20 bg-background pb-1">
          {renderSelectionActions?.(visibleSelectedRows, hiddenSelectedCount, clearSelection)}
        </div>
      )}
    </div>
  );
}
