import { Combobox } from '@base-ui/react/combobox';
import type { Column, RowData } from '@tanstack/react-table';
import { Check, PlusCircle, Search } from 'lucide-react';
import type * as React from 'react';
import { Fragment } from 'react';

type FacetOption = {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
};

interface DataTableFacetedFilterProps<TData extends RowData, TValue> {
  column?: Column<BookmarkTableFeatures, TData, TValue>;
  title?: string;
  options: FacetOption[];
  /** Item counts per option value, computed over the rows the filter applies to. */
  counts?: ReadonlyMap<string, number>;
  /** Classes for the button that opens the list. */
  className?: string;
}

/** The last option while something is selected: choosing it clears the filter. */
const CLEAR_VALUE = '\u0000clear';

const ITEM_CLASS =
  'relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0';

export function DataTableFacetedFilter<TData extends RowData, TValue>({
  column,
  title,
  options,
  counts,
  className,
}: DataTableFacetedFilterProps<TData, TValue>) {
  const filterValue = column?.getFilterValue();
  const selectedValues = new Set<string>(Array.isArray(filterValue) ? filterValue : []);
  const selectedOptions = options.filter((option) => selectedValues.has(option.value));
  const items =
    selectedValues.size > 0
      ? [...options, { label: t('table_filterClear'), value: CLEAR_VALUE }]
      : options;

  return (
    <div className="grid gap-2">
      <Popover>
        <PopoverTrigger
          render={
            <Button variant="outline" size="sm" className={cn('h-8 border-dashed', className)} />
          }
        >
          <PlusCircle />
          {title}
          {selectedValues?.size > 0 && (
            <>
              <Separator orientation="vertical" className="mx-2 h-4" />
              <Badge variant="secondary" className="rounded-sm px-1 font-normal lg:hidden">
                {selectedValues.size}
              </Badge>
              <div className="hidden space-x-1 lg:flex">
                {selectedValues.size > FACET_BADGES_MAX ? (
                  <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                    {t('table_filterSelectedCount', String(selectedValues.size))}
                  </Badge>
                ) : (
                  selectedOptions.map((option) => (
                    <Badge
                      variant="secondary"
                      key={option.value}
                      className="max-w-48 rounded-sm px-1 font-normal"
                    >
                      <PathLabel path={option.label} />
                    </Badge>
                  ))
                )}
              </div>
            </>
          )}
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-0" align="start">
          {/* Inline: the list lives in this popover, which owns opening, closing, and Escape. */}
          <Combobox.Root
            inline
            open
            multiple
            items={items}
            value={selectedOptions}
            onValueChange={(next: FacetOption[]) => {
              const values = next.some((option) => option.value === CLEAR_VALUE)
                ? []
                : next.map((option) => option.value);
              column?.setFilterValue(values.length ? values : undefined);
            }}
            itemToStringLabel={(option: FacetOption) => option.label}
            itemToStringValue={(option: FacetOption) => option.value}
            isItemEqualToValue={(item: FacetOption, current: FacetOption) =>
              item.value === current.value
            }
          >
            <div className="flex items-center border-b px-3">
              <Search aria-hidden="true" className="mr-2 h-4 w-4 shrink-0 opacity-50" />
              <Combobox.Input
                placeholder={title}
                aria-label={title}
                className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Combobox.Empty className="py-6 text-center text-sm empty:hidden">
              {t('table_filterNoOptions')}
            </Combobox.Empty>
            <Combobox.List className="max-h-[300px] overflow-y-auto overflow-x-hidden p-1 text-foreground empty:hidden">
              {(option: FacetOption) =>
                option.value === CLEAR_VALUE ? (
                  <Fragment key={option.value}>
                    <Combobox.Separator className="-mx-1 my-1 h-px bg-border" />
                    <Combobox.Item
                      value={option}
                      className={cn(ITEM_CLASS, 'justify-center text-center')}
                    >
                      {option.label}
                    </Combobox.Item>
                  </Fragment>
                ) : (
                  <Combobox.Item key={option.value} value={option} className={ITEM_CLASS}>
                    <div
                      className={cn(
                        'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                        selectedValues.has(option.value)
                          ? 'bg-primary text-primary-foreground'
                          : 'opacity-50 [&_svg]:invisible',
                      )}
                    >
                      <Check />
                    </div>
                    {option.icon && <option.icon className="mr-2 h-4 w-4 text-muted-foreground" />}
                    <PathLabel path={option.label} />
                    {counts?.get(option.value) ? (
                      <span className="ml-auto pl-2 font-mono text-xs">
                        {counts.get(option.value)}
                      </span>
                    ) : null}
                  </Combobox.Item>
                )
              }
            </Combobox.List>
          </Combobox.Root>
        </PopoverContent>
      </Popover>
    </div>
  );
}
