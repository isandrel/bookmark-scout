import type { Column, ReactTable, RowData } from '@tanstack/react-table';
import { ChevronDown, CircleHelp, ListOrdered, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { DateRange } from 'react-day-picker';

type FacetOption = { value: string; label: string };

/** Marks the search box, which the manager's search shortcut focuses. */
export const MANAGER_SEARCH_ATTRIBUTE = 'data-manager-search';

const MORE_FILTERS_ID = 'bookmark-table-more-filters';

/** The order the table shows, for the order control beside the View menu. */
export type DataTableOrderState = {
  /** The rows are in the browser's own order (no column sort). */
  browserOrder: boolean;
  /** The browser's order is also the Sort Order setting, so there is no other order to go back to. */
  browserOrderIsDefault: boolean;
  /** The order in plain words while it is not the browser's, such as "Title, sorted ascending". */
  description: string | null;
};

export type DataTableFacetOptions = {
  parentId: FacetOption[];
  domain: FacetOption[];
};

interface DataTableToolbarProps<TData extends RowData> {
  table: ReactTable<BookmarkTableFeatures, TData>;
  applyToCurrentFolder: boolean;
  onApplyToCurrentFolderChange: (enabled: boolean) => void;
  onResetView: () => void;
  facetOptions: DataTableFacetOptions;
  /** Rows the filters apply to; facet counts always use this scope. */
  facetScope: TData[];
  /** The order the table shows. */
  order: DataTableOrderState;
  onBrowserOrderChange: (enabled: boolean) => void;
  /** Columns hidden because the table is too narrow. */
  spaceHiddenColumnIds?: string[];
  /** Column visibility the user chose, which columns hidden for space keep. */
  columnVisibilityPreference?: Record<string, boolean>;
  /** Shows the saved searches menu. */
  savedSearches?: {
    currentQuery: SavedSearchQuery;
    onApply: (query: SavedSearchQuery) => { missingFolderCount: number };
  };
}

function countColumnValues<TData extends RowData>(
  column: Column<BookmarkTableFeatures, TData, unknown> | undefined,
  rows: TData[],
): Map<string, number> {
  const counts = new Map<string, number>();
  const accessor = column?.accessorFn;
  if (!accessor) return counts;
  rows.forEach((row, index) => {
    const value = String(accessor(row, index) ?? '');
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  });
  return counts;
}

export function DataTableToolbar<TData extends RowData>({
  table,
  applyToCurrentFolder,
  onApplyToCurrentFolderChange,
  onResetView,
  facetOptions,
  facetScope,
  order,
  onBrowserOrderChange,
  spaceHiddenColumnIds,
  columnVisibilityPreference,
  savedSearches,
}: DataTableToolbarProps<TData>) {
  const isFiltered = table.state.columnFilters.length > 0;
  const typeColumn = table.getColumn('type');
  const parentColumn = table.getColumn('parentId');
  const urlColumn = table.getColumn('url');
  const domainColumn = table.getColumn(DOMAIN_COLUMN_ID);
  const dateColumn = table.getColumn('dateAdded');
  const urlFilterValue = urlColumn?.getFilterValue();
  const currentFolderHelp = t('table_currentFolderOnlyHelp');
  // The folder and address filters wait behind "More filters"; they stay out while one is in use
  // (typed, or applied by a saved search), so a filter in effect is never hidden.
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const moreFiltersInUse =
    (typeof urlFilterValue === 'string' && urlFilterValue !== '') ||
    parentColumn?.getIsFiltered() === true;
  const showMoreFilters = moreFiltersOpen || moreFiltersInUse;
  const browserOrderLocked = order.browserOrder && order.browserOrderIsDefault;

  const counts = useMemo(
    () => ({
      type: countColumnValues(typeColumn, facetScope),
      parentId: countColumnValues(parentColumn, facetScope),
      domain: countColumnValues(domainColumn, facetScope),
    }),
    [domainColumn, facetScope, parentColumn, typeColumn],
  );

  return (
    // The view controls go to their own line when the filters need the room, so nothing overlaps
    // in a narrow window.
    <div className="flex flex-wrap items-start gap-2" data-testid="bookmark-table-toolbar">
      <div className="flex min-w-0 flex-[1_1_18rem] flex-wrap items-center gap-2">
        <Input
          placeholder={t('managerDefaults_search')}
          aria-label={t('managerDefaults_search')}
          {...{ [MANAGER_SEARCH_ATTRIBUTE]: '' }}
          value={(table.getColumn('title')?.getFilterValue() as string) ?? ''}
          onChange={(event) =>
            table.getColumn('title')?.setFilterValue(event.target.value || undefined)
          }
          className="h-8 w-56 min-w-40 lg:w-72"
        />
        <div className="flex h-8 items-center gap-1.5 whitespace-nowrap">
          <Checkbox
            id="applyToCurrentFolder"
            checked={applyToCurrentFolder}
            aria-describedby="applyToCurrentFolderHelp"
            onCheckedChange={(checked) => onApplyToCurrentFolderChange(checked === true)}
          />
          <label htmlFor="applyToCurrentFolder" className="text-sm font-medium leading-none">
            {t('table_currentFolderOnly')}
          </label>
          <span id="applyToCurrentFolderHelp" className="sr-only">
            {currentFolderHelp}
          </span>
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  className="inline-flex text-muted-foreground hover:text-foreground"
                  aria-label={currentFolderHelp}
                />
              }
            >
              <CircleHelp className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64">{currentFolderHelp}</TooltipContent>
          </Tooltip>
        </div>
        {typeColumn && (
          <DataTableFacetedFilter
            column={typeColumn}
            title={getBookmarkColumnLabel('type')}
            options={getLocalizedTypeOptions()}
            counts={counts.type}
          />
        )}
        {domainColumn && (
          <DataTableFacetedFilter
            column={domainColumn}
            title={t('table_filterDomains')}
            options={facetOptions.domain}
            counts={counts.domain}
          />
        )}
        {dateColumn && (
          <DataTableDateFilter
            title={getBookmarkColumnLabel('dateAdded')}
            className="h-8 w-auto"
            value={dateColumn.getFilterValue() as DateRange | undefined}
            onChange={(value) => dateColumn.setFilterValue(value)}
          />
        )}
        {(urlColumn || parentColumn) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 shrink-0"
            aria-expanded={showMoreFilters}
            aria-controls={showMoreFilters ? MORE_FILTERS_ID : undefined}
            disabled={moreFiltersInUse}
            focusableWhenDisabled
            title={moreFiltersInUse ? t('managerDefaults_moreFiltersInUse') : undefined}
            onClick={() => setMoreFiltersOpen(!showMoreFilters)}
            data-testid="more-filters"
          >
            {t('managerDefaults_moreFilters')}
            <ChevronDown className={cn('transition-transform', showMoreFilters && 'rotate-180')} />
          </Button>
        )}
        {showMoreFilters && (
          <div id={MORE_FILTERS_ID} className="contents">
            {urlColumn && (
              <Input
                placeholder={t('table_filterUrls')}
                aria-label={t('table_filterUrls')}
                value={typeof urlFilterValue === 'string' ? urlFilterValue : ''}
                onChange={(event) => urlColumn.setFilterValue(event.target.value || undefined)}
                className="h-8 w-40 min-w-32 lg:w-56"
              />
            )}
            {parentColumn && (
              <DataTableFacetedFilter
                column={parentColumn}
                title={t('managerDefaults_folderFilter')}
                options={facetOptions.parentId}
                counts={counts.parentId}
              />
            )}
          </div>
        )}
        {isFiltered && (
          <Button
            variant="ghost"
            onClick={() => {
              table.resetColumnFilters();
              onApplyToCurrentFolderChange(false);
            }}
            className="h-8 px-2 lg:px-3"
          >
            {t('table_resetFilters')}
            <X className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2" data-testid="table-view-controls">
        {savedSearches && (
          <DataTableSavedSearches
            currentQuery={savedSearches.currentQuery}
            onApply={savedSearches.onApply}
          />
        )}
        {/* What order the rows are in, in plain words, unless it is the browser's own. */}
        {order.description && (
          <span
            className="whitespace-nowrap text-sm text-muted-foreground"
            data-testid="table-order-status"
          >
            {order.description}
          </span>
        )}
        <Button
          variant={order.browserOrder ? 'secondary' : 'outline'}
          size="sm"
          className="h-8 shrink-0"
          aria-pressed={order.browserOrder}
          // Pressed with nothing else to go back to: the Sort Order setting is the browser's order.
          disabled={browserOrderLocked}
          focusableWhenDisabled
          title={
            browserOrderLocked
              ? t('managerDefaults_browserOrderActive')
              : t('table_browserOrderHelp')
          }
          onClick={() => onBrowserOrderChange(!order.browserOrder)}
        >
          <ListOrdered />
          {t('table_browserOrder')}
        </Button>
        <DataTableViewOptions
          table={table}
          onResetView={onResetView}
          spaceHiddenColumnIds={spaceHiddenColumnIds}
          columnVisibilityPreference={columnVisibilityPreference}
        />
      </div>
    </div>
  );
}
