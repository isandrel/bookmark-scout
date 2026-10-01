import type { Column, ReactTable, RowData } from '@tanstack/react-table';
import { CircleHelp, ListOrdered, X } from 'lucide-react';
import { useMemo } from 'react';
import type { DateRange } from 'react-day-picker';

type FacetOption = { value: string; label: string };

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
  browserOrder: boolean;
  onBrowserOrderChange: (enabled: boolean) => void;
  /** Columns hidden because the table is too narrow. */
  spaceHiddenColumnIds?: string[];
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
  browserOrder,
  onBrowserOrderChange,
  spaceHiddenColumnIds,
}: DataTableToolbarProps<TData>) {
  const isFiltered = table.state.columnFilters.length > 0;
  const typeColumn = table.getColumn('type');
  const parentColumn = table.getColumn('parentId');
  const urlColumn = table.getColumn('url');
  const domainColumn = table.getColumn(DOMAIN_COLUMN_ID);
  const dateColumn = table.getColumn('dateAdded');
  const urlFilterValue = urlColumn?.getFilterValue();
  const currentFolderHelp = t('table_currentFolderOnlyHelp');

  const counts = useMemo(
    () => ({
      type: countColumnValues(typeColumn, facetScope),
      parentId: countColumnValues(parentColumn, facetScope),
      domain: countColumnValues(domainColumn, facetScope),
    }),
    [domainColumn, facetScope, parentColumn, typeColumn],
  );

  return (
    <div className="flex items-start gap-2" data-testid="bookmark-table-toolbar">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <Input
          placeholder={t('table_filterTitles')}
          aria-label={t('table_filterTitles')}
          value={(table.getColumn('title')?.getFilterValue() as string) ?? ''}
          onChange={(event) =>
            table.getColumn('title')?.setFilterValue(event.target.value || undefined)
          }
          className="h-8 w-40 min-w-32 lg:w-56"
        />
        {urlColumn && (
          <Input
            placeholder={t('table_filterUrls')}
            aria-label={t('table_filterUrls')}
            value={typeof urlFilterValue === 'string' ? urlFilterValue : ''}
            onChange={(event) => urlColumn.setFilterValue(event.target.value || undefined)}
            className="h-8 w-40 min-w-32 lg:w-56"
          />
        )}
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
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex text-muted-foreground hover:text-foreground"
                  aria-label={currentFolderHelp}
                >
                  <CircleHelp className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-64">{currentFolderHelp}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        {typeColumn && (
          <DataTableFacetedFilter
            column={typeColumn}
            title={getBookmarkColumnLabel('type')}
            options={getLocalizedTypeOptions()}
            counts={counts.type}
          />
        )}
        {parentColumn && (
          <DataTableFacetedFilter
            column={parentColumn}
            title={getBookmarkColumnLabel('parentId')}
            options={facetOptions.parentId}
            counts={counts.parentId}
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
      <Button
        variant={browserOrder ? 'secondary' : 'outline'}
        size="sm"
        className="h-8 shrink-0"
        aria-pressed={browserOrder}
        title={t('table_browserOrderHelp')}
        onClick={() => onBrowserOrderChange(!browserOrder)}
      >
        <ListOrdered />
        {t('table_browserOrder')}
      </Button>
      <DataTableViewOptions
        table={table}
        onResetView={onResetView}
        spaceHiddenColumnIds={spaceHiddenColumnIds}
      />
    </div>
  );
}
