import type { ReactTable, RowData } from '@tanstack/react-table';
import { X } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { useParentIdMap, useUrlMap } from '@/components/page/BookmarksPage';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { typeMap } from './columns';
import { DataTableDateFilter } from './data-table-date-filter';
import { DataTableFacetedFilter } from './data-table-faceted-filter';
import { DataTableViewOptions } from './data-table-view-options';
import type { BookmarkTableFeatures } from './table-features';

interface DataTableToolbarProps<TData extends RowData> {
  table: ReactTable<BookmarkTableFeatures, TData>;
  applyToCurrentFolder: boolean;
  onApplyToCurrentFolderChange: (enabled: boolean) => void;
}

export function DataTableToolbar<TData extends RowData>({
  table,
  applyToCurrentFolder,
  onApplyToCurrentFolderChange,
}: DataTableToolbarProps<TData>) {
  const isFiltered = table.state.columnFilters.length > 0;

  // Call hooks unconditionally at the top level
  const parentIdOptions = Object.values(useParentIdMap());
  const urlOptions = Object.values(useUrlMap());
  const urlFilterValue = table.getColumn('url')?.getFilterValue();

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-1 items-center space-x-2">
        <div className="grid gap-2">
          <Input
            placeholder="Filter titles..."
            value={(table.getColumn('title')?.getFilterValue() as string) ?? ''}
            onChange={(event) => table.getColumn('title')?.setFilterValue(event.target.value)}
            className="max-w-sm"
          />
          <div className="items-top flex space-x-2">
            <Checkbox
              id="applyToCurrentFolder"
              checked={applyToCurrentFolder}
              onCheckedChange={(checked) => onApplyToCurrentFolderChange(checked === true)}
            />
            <div className="grid gap-1.5 leading-none">
              <label
                htmlFor="applyToCurrentFolder"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Apply to current folder only
              </label>
              <p className="text-sm text-muted-foreground">
                If unchecked, filter will be applied to all bookmarks
              </p>
            </div>
          </div>
        </div>
        {table.getColumn('type') && (
          <DataTableFacetedFilter
            column={table.getColumn('type')}
            title="Type"
            options={Object.values(typeMap)}
          />
        )}
        {table.getColumn('parentId') && (
          <DataTableFacetedFilter
            column={table.getColumn('parentId')}
            title="Parent ID"
            options={parentIdOptions}
          />
        )}
        {table.getColumn('url') && (
          <DataTableFacetedFilter
            column={table.getColumn('url')}
            title="URL"
            options={urlOptions}
          />
        )}
        {table.getColumn('url') && (
          <Input
            placeholder="Filter URLs..."
            value={typeof urlFilterValue === 'string' ? urlFilterValue : ''}
            onChange={(event) => table.getColumn('url')?.setFilterValue(event.target.value)}
            className="max-w-sm"
          />
        )}
        {table.getColumn('dateAdded') && (
          <DataTableDateFilter
            title="Date Added"
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
            Reset
            <X className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
      <DataTableViewOptions table={table} />
    </div>
  );
}
