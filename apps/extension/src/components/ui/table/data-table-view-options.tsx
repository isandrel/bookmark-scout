'use client';

import { DropdownMenuTrigger } from '@radix-ui/react-dropdown-menu';
import type { ReactTable, RowData } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, RotateCcw, Settings2 } from 'lucide-react';

interface DataTableViewOptionsProps<TData extends RowData> {
  table: ReactTable<BookmarkTableFeatures, TData>;
  onResetView: () => void;
}

export function DataTableViewOptions<TData extends RowData>({
  table,
  onResetView,
}: DataTableViewOptionsProps<TData>) {
  const configurableColumns = table
    .getAllColumns()
    .filter((column) => typeof column.accessorFn !== 'undefined' && column.getCanHide())
    .sort((left, right) => {
      const order = table.state.columnOrder;
      return order.indexOf(left.id) - order.indexOf(right.id);
    });

  const moveColumn = (columnId: string, direction: -1 | 1) => {
    const configurableIds = configurableColumns.map((column) => column.id);
    const index = configurableIds.indexOf(columnId);
    const swapIndex = index + direction;
    if (index < 0 || swapIndex < 0 || swapIndex >= configurableIds.length) return;

    [configurableIds[index], configurableIds[swapIndex]] = [
      configurableIds[swapIndex],
      configurableIds[index],
    ];
    const configurableSet = new Set(configurableIds);
    let nextConfigurableIndex = 0;
    table.setColumnOrder(
      table.state.columnOrder.map((id) =>
        configurableSet.has(id) ? configurableIds[nextConfigurableIndex++] : id,
      ),
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto hidden h-8 lg:flex"
          aria-label={t('table_viewOptions')}
        >
          <Settings2 />
          {t('action_view')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[240px]">
        <DropdownMenuLabel>{t('table_toggleColumns')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {configurableColumns.map((column, index) => {
          return (
            <div key={column.id} className="flex items-center gap-1">
              <DropdownMenuCheckboxItem
                className="min-w-0 flex-1 capitalize"
                checked={column.getIsVisible()}
                onCheckedChange={(value) => column.toggleVisibility(!!value)}
                onSelect={(event) => event.preventDefault()}
              >
                {column.id}
              </DropdownMenuCheckboxItem>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={index === 0}
                aria-label={t('table_moveColumnUp', column.id)}
                onClick={() => moveColumn(column.id, -1)}
              >
                <ArrowUp />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={index === configurableColumns.length - 1}
                aria-label={t('table_moveColumnDown', column.id)}
                onClick={() => moveColumn(column.id, 1)}
              >
                <ArrowDown />
              </Button>
            </div>
          );
        })}
        <DropdownMenuSeparator />
        <Button type="button" variant="ghost" className="w-full justify-start" onClick={onResetView}>
          <RotateCcw />
          {t('table_resetView')}
        </Button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
