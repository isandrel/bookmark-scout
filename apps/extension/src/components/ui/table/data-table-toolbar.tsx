import type { Column, ReactTable, RowData } from '@tanstack/react-table';
import { LayoutGrid, List, ListOrdered, Search, SlidersHorizontal, X } from 'lucide-react';
import { useMemo, useRef } from 'react';
import type { DateRange } from 'react-day-picker';

type FacetOption = { value: string; label: string };

/** The manager's two views of the same rows (the Manager View setting): the list, or cards. */
const VIEW_MODES = [
  { value: 'list', icon: List, labelKey: 'settings_managerViewModeList' },
  { value: 'cards', icon: LayoutGrid, labelKey: 'settings_managerViewModeCards' },
] as const;

function ViewModeToggle() {
  const { value, setValue } = useSetting('managerViewMode');
  return (
    // biome-ignore lint/a11y/useSemanticElements: a pair of toggle buttons, not a form fieldset.
    <div
      role="group"
      aria-label={t('settings_managerViewMode')}
      className="inline-flex h-8 shrink-0 rounded-md border p-0.5"
    >
      {VIEW_MODES.map(({ value: mode, icon: Icon, labelKey }) => (
        <Button
          key={mode}
          variant={value === mode ? 'secondary' : 'ghost'}
          size="icon"
          className="h-6.5 w-7"
          aria-pressed={value === mode}
          aria-label={t(labelKey)}
          title={t(labelKey)}
          onClick={() => void setValue(mode)}
        >
          <Icon />
        </Button>
      ))}
    </div>
  );
}

/** A filter in use, as the chip that names it and removes it. */
type FilterChip = { id: string; text: string; remove: () => void };

const SEARCH_DIAGNOSTICS_ID = 'bookmark-table-search-diagnostics';

/** Marks the search box, which the manager's search shortcut focuses. */
export const MANAGER_SEARCH_ATTRIBUTE = 'data-manager-search';

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
  const isFiltered = table.state.columnFilters.length > 0 || applyToCurrentFolder;
  const searchColumn = table.getColumn('title');
  const typeColumn = table.getColumn('type');
  const parentColumn = table.getColumn('parentId');
  const urlColumn = table.getColumn('url');
  const domainColumn = table.getColumn(DOMAIN_COLUMN_ID);
  const dateColumn = table.getColumn('dateAdded');
  const urlFilterValue = urlColumn?.getFilterValue();
  const searchText = titleSearchText(searchColumn?.getFilterValue());
  const searchRef = useRef<HTMLInputElement>(null);
  const setSearchText = (text: string) => searchColumn?.setFilterValue(text || undefined);
  // Problems in the query, said under the toolbar; the query still runs without them.
  const diagnostics = useMemo(
    () => parseSearchQuery(searchText).diagnostics.map(describeSearchDiagnostic),
    [searchText],
  );
  const browserOrderLocked = order.browserOrder && order.browserOrderIsDefault;

  const counts = useMemo(
    () => ({
      type: countColumnValues(typeColumn, facetScope),
      parentId: countColumnValues(parentColumn, facetScope),
      domain: countColumnValues(domainColumn, facetScope),
    }),
    [domainColumn, facetScope, parentColumn, typeColumn],
  );
  const typeOptions = getLocalizedTypeOptions();

  // Each filter in use, as a chip under the toolbar that removes it; the search box shows its own.
  const chips: FilterChip[] = [];
  if (applyToCurrentFolder) {
    chips.push({
      id: 'currentFolder',
      text: t('table_currentFolderOnly'),
      remove: () => onApplyToCurrentFolderChange(false),
    });
  }
  const pushValues = (
    id: string,
    column: typeof typeColumn,
    label: string,
    options: readonly FacetOption[],
  ) => {
    const value = column?.getFilterValue();
    if (!column || !Array.isArray(value) || value.length === 0) return;
    const labels = value.map(
      (entry) => options.find((option) => option.value === entry)?.label ?? String(entry),
    );
    const values =
      labels.length > FACET_BADGES_MAX
        ? t('table_filterSelectedCount', String(labels.length))
        : labels.join(t('table_filterValueSeparator'));
    chips.push({
      id,
      text: t('table_filterChip', [label, values]),
      remove: () => column.setFilterValue(undefined),
    });
  };
  pushValues('type', typeColumn, getBookmarkColumnLabel('type'), typeOptions);
  pushValues('domain', domainColumn, t('table_filterDomains'), facetOptions.domain);
  pushValues('parentId', parentColumn, t('managerDefaults_folderFilter'), facetOptions.parentId);
  const dateValue = dateColumn?.getFilterValue() as DateRange | undefined;
  if (dateColumn && dateValue?.from) {
    chips.push({
      id: 'dateAdded',
      text: t('table_filterChip', [
        getBookmarkColumnLabel('dateAdded'),
        formatDateRangeLabel(dateValue),
      ]),
      remove: () => dateColumn.setFilterValue(undefined),
    });
  }
  if (urlColumn && typeof urlFilterValue === 'string' && urlFilterValue !== '') {
    chips.push({
      id: 'url',
      text: t('table_filterChip', [getBookmarkColumnLabel('url'), urlFilterValue]),
      remove: () => urlColumn.setFilterValue(undefined),
    });
  }

  return (
    // The view controls go to their own line when the search needs the room, so nothing overlaps
    // in a narrow window. Filters live in one menu; the ones in use show as chips below.
    <div className="grid grid-cols-1 gap-2" data-testid="bookmark-table-toolbar">
      <div className="flex flex-wrap items-center gap-2">
        {/* With large text in a narrow window, Filters goes under the search box, which never
            grows past the row. */}
        <div className="flex min-w-0 flex-[1_1_32rem] flex-wrap items-center gap-2">
          <div className="relative min-w-[min(12rem,100%)] max-w-xl flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              ref={searchRef}
              placeholder={t('managerDefaults_search')}
              aria-label={t('managerDefaults_search')}
              aria-describedby={diagnostics.length > 0 ? SEARCH_DIAGNOSTICS_ID : undefined}
              {...{ [MANAGER_SEARCH_ATTRIBUTE]: '' }}
              value={searchText}
              onFocus={preloadSearchMatches}
              onChange={(event) => setSearchText(event.target.value)}
              className="h-8 pr-9 pl-8"
            />
            <div className="absolute top-1/2 right-0.5 -translate-y-1/2">
              <SearchSyntaxHelp
                query={searchText}
                onQueryChange={setSearchText}
                inputRef={searchRef}
              />
            </div>
          </div>
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0"
                  aria-label={
                    chips.length > 0
                      ? t('table_filtersInUse', String(chips.length))
                      : t('table_filters')
                  }
                  data-testid="table-filters"
                />
              }
            >
              <SlidersHorizontal />
              {t('table_filters')}
              {chips.length > 0 && (
                <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                  {chips.length}
                </Badge>
              )}
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="grid w-80 gap-3"
              data-testid="table-filters-panel"
            >
              <div className="grid gap-1">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="applyToCurrentFolder"
                    checked={applyToCurrentFolder}
                    aria-describedby="applyToCurrentFolderHelp"
                    onCheckedChange={(checked) => onApplyToCurrentFolderChange(checked === true)}
                  />
                  <label htmlFor="applyToCurrentFolder" className="text-sm font-medium">
                    {t('table_currentFolderOnly')}
                  </label>
                </div>
                <p id="applyToCurrentFolderHelp" className="pl-6 text-xs text-muted-foreground">
                  {t('table_currentFolderOnlyHelp')}
                </p>
              </div>
              {typeColumn && (
                <DataTableFacetedFilter
                  column={typeColumn}
                  title={getBookmarkColumnLabel('type')}
                  options={typeOptions}
                  counts={counts.type}
                  className="w-full justify-start"
                />
              )}
              {domainColumn && (
                <DataTableFacetedFilter
                  column={domainColumn}
                  title={t('table_filterDomains')}
                  options={facetOptions.domain}
                  counts={counts.domain}
                  className="w-full justify-start"
                />
              )}
              {parentColumn && (
                <DataTableFacetedFilter
                  column={parentColumn}
                  title={t('managerDefaults_folderFilter')}
                  options={facetOptions.parentId}
                  counts={counts.parentId}
                  className="w-full justify-start"
                />
              )}
              {dateColumn && (
                <DataTableDateFilter
                  title={getBookmarkColumnLabel('dateAdded')}
                  className="h-8 w-full"
                  value={dateValue}
                  onChange={(value) => dateColumn.setFilterValue(value)}
                />
              )}
              {urlColumn && (
                <Input
                  placeholder={t('table_filterUrls')}
                  aria-label={t('table_filterUrls')}
                  value={typeof urlFilterValue === 'string' ? urlFilterValue : ''}
                  onChange={(event) => urlColumn.setFilterValue(event.target.value || undefined)}
                  className="h-8"
                />
              )}
            </PopoverContent>
          </Popover>
          {isFiltered && (
            <Button
              variant="ghost"
              onClick={() => {
                table.resetColumnFilters();
                onApplyToCurrentFolderChange(false);
              }}
              className="h-8 shrink-0 px-2 lg:px-3"
            >
              {t('table_resetFilters')}
              <X className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
        <div
          className="flex min-w-0 flex-wrap items-center gap-2"
          data-testid="table-view-controls"
        >
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
          <ViewModeToggle />
          <DataTableViewOptions
            table={table}
            onResetView={onResetView}
            spaceHiddenColumnIds={spaceHiddenColumnIds}
            columnVisibilityPreference={columnVisibilityPreference}
          />
        </div>
      </div>
      {diagnostics.length > 0 && (
        <p id={SEARCH_DIAGNOSTICS_ID} role="status" className="text-xs text-warning">
          {diagnostics.join(' ')}
        </p>
      )}
      {chips.length > 0 && (
        <ul
          className="flex flex-wrap items-center gap-1.5"
          aria-label={t('table_filters')}
          data-testid="table-filter-chips"
        >
          {chips.map((chip) => (
            <li key={chip.id}>
              <Badge
                variant="secondary"
                className="gap-1 rounded-sm py-0.5 pr-0.5 pl-2 font-normal"
              >
                <span className="max-w-64 truncate">{chip.text}</span>
                <button
                  type="button"
                  className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-background hover:text-foreground"
                  aria-label={t('table_filterChipRemove', chip.text)}
                  onClick={chip.remove}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
