import type { ReactTable, RowData } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface DataTablePaginationProps<TData extends RowData> {
  table: ReactTable<BookmarkTableFeatures, TData>;
}

export function DataTablePagination<TData extends RowData>({
  table,
}: DataTablePaginationProps<TData>) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-2">
      <div className="flex-1 whitespace-nowrap text-sm text-muted-foreground">
        {t('table_rowsSelected', [
          String(table.getFilteredSelectedRowModel().rows.length),
          String(table.getFilteredRowModel().rows.length),
        ])}
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 lg:gap-x-8">
        <div className="flex items-center space-x-2">
          <p className="whitespace-nowrap text-sm font-medium">{t('table_rowsPerPage')}</p>
          <Select
            value={`${table.state.pagination.pageSize}`}
            onValueChange={(value) => {
              table.setPageSize(Number(value));
            }}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={table.state.pagination.pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {[10, 20, 30, 40, 50].map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-w-[100px] items-center justify-center whitespace-nowrap text-sm font-medium">
          {t('table_pageOf', [
            String(table.state.pagination.pageIndex + 1),
            String(table.getPageCount()),
          ])}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">{t('table_firstPage')}</span>
            <ChevronsLeft />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">{t('table_previousPage')}</span>
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">{t('table_nextPage')}</span>
            <ChevronRight />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">{t('table_lastPage')}</span>
            <ChevronsRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
