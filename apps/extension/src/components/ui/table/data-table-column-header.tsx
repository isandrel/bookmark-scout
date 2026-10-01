import type { Column, RowData } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown, EyeOff, X } from 'lucide-react';

interface DataTableColumnHeaderProps<TData extends RowData, TValue>
  extends React.HTMLAttributes<HTMLDivElement> {
  column: Column<BookmarkTableFeatures, TData, TValue>;
  title: string;
}

export function DataTableColumnHeader<TData extends RowData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return <div className={cn('truncate', className)}>{title}</div>;
  }

  return (
    <div className={cn('flex min-w-0 items-center space-x-2', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="-ml-3 h-8 max-w-[calc(100%+0.75rem)] data-popup-open:bg-accent"
              aria-label={
                column.getIsSorted() === 'desc'
                  ? t('table_sortedDesc', title)
                  : column.getIsSorted() === 'asc'
                    ? t('table_sortedAsc', title)
                    : title
              }
            />
          }
        >
          <span className="truncate">{title}</span>
          {column.getIsSorted() === 'desc' ? (
            <ArrowDown />
          ) : column.getIsSorted() === 'asc' ? (
            <ArrowUp />
          ) : (
            <ChevronsUpDown />
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => column.toggleSorting(false)}>
            <ArrowUp className="h-3.5 w-3.5 text-muted-foreground/70" />
            {t('table_sortAsc')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
            <ArrowDown className="h-3.5 w-3.5 text-muted-foreground/70" />
            {t('table_sortDesc')}
          </DropdownMenuItem>
          {column.getIsSorted() && (
            <DropdownMenuItem onClick={() => column.clearSorting()}>
              <X className="h-3.5 w-3.5 text-muted-foreground/70" />
              {t('table_clearSort')}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
            <EyeOff className="h-3.5 w-3.5 text-muted-foreground/70" />
            {t('table_hideColumn')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
