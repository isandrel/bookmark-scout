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

  // A visible column swaps with the next visible one, so every move changes the table.
  const findSwapIndex = (index: number, direction: -1 | 1) => {
    const movingVisible = configurableColumns[index]?.getIsVisible();
    for (
      let next = index + direction;
      next >= 0 && next < configurableColumns.length;
      next += direction
    ) {
      if (!movingVisible || configurableColumns[next].getIsVisible()) return next;
    }
    return -1;
  };

  const moveColumn = (index: number, direction: -1 | 1) => {
    const swapIndex = findSwapIndex(index, direction);
    if (index < 0 || swapIndex < 0) return;

    const configurableIds = configurableColumns.map((column) => column.id);
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
          className="h-8 shrink-0"
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
                className="min-w-0 flex-1"
                checked={column.getIsVisible()}
                onCheckedChange={(value) => column.toggleVisibility(!!value)}
                onSelect={(event) => event.preventDefault()}
              >
                {getBookmarkColumnLabel(column.id)}
              </DropdownMenuCheckboxItem>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={findSwapIndex(index, -1) < 0}
                aria-label={t('table_moveColumnUp', getBookmarkColumnLabel(column.id))}
                onClick={() => moveColumn(index, -1)}
              >
                <ArrowUp />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={findSwapIndex(index, 1) < 0}
                aria-label={t('table_moveColumnDown', getBookmarkColumnLabel(column.id))}
                onClick={() => moveColumn(index, 1)}
              >
                <ArrowDown />
              </Button>
            </div>
          );
        })}
        <DropdownMenuSeparator />
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-start"
          onClick={onResetView}
        >
          <RotateCcw />
          {t('table_resetView')}
        </Button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
