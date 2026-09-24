import type { ReactTable, RowData } from '@tanstack/react-table';
import { CircleHelp, X } from 'lucide-react';
import type { DateRange } from 'react-day-picker';

interface DataTableToolbarProps<TData extends RowData> {
  table: ReactTable<BookmarkTableFeatures, TData>;
  applyToCurrentFolder: boolean;
  onApplyToCurrentFolderChange: (enabled: boolean) => void;
  onResetView: () => void;
}

export function DataTableToolbar<TData extends RowData>({
  table,
  applyToCurrentFolder,
  onApplyToCurrentFolderChange,
  onResetView,
}: DataTableToolbarProps<TData>) {
  const isFiltered = table.state.columnFilters.length > 0;

  // Call hooks unconditionally at the top level
  const parentIdOptions = Object.values(useParentIdMap());
  const urlOptions = Object.values(useUrlMap());
  const urlFilterValue = table.getColumn('url')?.getFilterValue();
  const currentFolderHelp = t('table_currentFolderOnlyHelp');

  return (
    <div className="flex items-start gap-2" data-testid="bookmark-table-toolbar">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <Input
          placeholder={t('table_filterTitles')}
          value={(table.getColumn('title')?.getFilterValue() as string) ?? ''}
          onChange={(event) => table.getColumn('title')?.setFilterValue(event.target.value)}
          className="h-8 w-40 min-w-32 lg:w-56"
        />
        {table.getColumn('url') && (
          <Input
            placeholder={t('table_filterUrls')}
            value={typeof urlFilterValue === 'string' ? urlFilterValue : ''}
            onChange={(event) => table.getColumn('url')?.setFilterValue(event.target.value)}
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
        {table.getColumn('type') && (
          <DataTableFacetedFilter
            column={table.getColumn('type')}
            title={getBookmarkColumnLabel('type')}
            options={getLocalizedTypeOptions()}
          />
        )}
        {table.getColumn('parentId') && (
          <DataTableFacetedFilter
            column={table.getColumn('parentId')}
            title={getBookmarkColumnLabel('parentId')}
            options={parentIdOptions}
          />
        )}
        {table.getColumn('url') && (
          <DataTableFacetedFilter
            column={table.getColumn('url')}
            title={getBookmarkColumnLabel('url')}
            options={urlOptions}
          />
        )}
        {table.getColumn('dateAdded') && (
          <DataTableDateFilter
            title={getBookmarkColumnLabel('dateAdded')}
            className="h-8 w-auto"
            value={table.getColumn('dateAdded')?.getFilterValue() as DateRange}
            onChange={(value) => table.getColumn('dateAdded')?.setFilterValue(value)}
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
      <DataTableViewOptions table={table} onResetView={onResetView} />
    </div>
  );
}
