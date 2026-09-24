import type { Column, RowData } from '@tanstack/react-table';
import { Check, PlusCircle } from 'lucide-react';
import type * as React from 'react';

interface DataTableFacetedFilterProps<TData extends RowData, TValue> {
  column?: Column<BookmarkTableFeatures, TData, TValue>;
  title?: string;
  options: {
    label: string;
    value: string;
    icon?: React.ComponentType<{ className?: string }>;
  }[];
  /** Item counts per option value, computed over the rows the filter applies to. */
  counts?: ReadonlyMap<string, number>;
}

export function DataTableFacetedFilter<TData extends RowData, TValue>({
  column,
  title,
  options,
  counts,
}: DataTableFacetedFilterProps<TData, TValue>) {
  const filterValue = column?.getFilterValue();
  const selectedValues = new Set<string>(Array.isArray(filterValue) ? filterValue : []);

  return (
    <div className="grid gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 border-dashed">
            <PlusCircle />
            {title}
            {selectedValues?.size > 0 && (
              <>
                <Separator orientation="vertical" className="mx-2 h-4" />
                <Badge variant="secondary" className="rounded-sm px-1 font-normal lg:hidden">
                  {selectedValues.size}
                </Badge>
                <div className="hidden space-x-1 lg:flex">
                  {selectedValues.size > 2 ? (
                    <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                      {t('table_filterSelectedCount', String(selectedValues.size))}
                    </Badge>
                  ) : (
                    options
                      .filter((option) => selectedValues.has(option.value))
                      .map((option) => (
                        <Badge
                          variant="secondary"
                          key={option.value}
                          className="rounded-sm px-1 font-normal"
                        >
                          {option.label}
                        </Badge>
                      ))
                  )}
                </div>
              </>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-0" align="start">
          <Command>
            <CommandInput placeholder={title} />
            <CommandList>
              <CommandEmpty>{t('table_filterNoOptions')}</CommandEmpty>
              <CommandGroup>
                {options.map((option) => {
                  const isSelected = selectedValues.has(option.value);
                  return (
                    <CommandItem
                      key={option.value}
                      value={`${option.label} ${option.value}`}
                      onSelect={() => {
                        if (isSelected) {
                          selectedValues.delete(option.value);
                        } else {
                          selectedValues.add(option.value);
                        }
                        const filterValues = Array.from(selectedValues);
                        column?.setFilterValue(filterValues.length ? filterValues : undefined);
                      }}
                    >
                      <div
                        className={cn(
                          'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                          isSelected
                            ? 'bg-primary text-primary-foreground'
                            : 'opacity-50 [&_svg]:invisible',
                        )}
                      >
                        <Check />
                      </div>
                      {option.icon && (
                        <option.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="min-w-0 truncate" title={option.label}>
                        {option.label}
                      </span>
                      {counts?.get(option.value) ? (
                        <span className="ml-auto pl-2 font-mono text-xs">
                          {counts.get(option.value)}
                        </span>
                      ) : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              {selectedValues.size > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      onSelect={() => column?.setFilterValue(undefined)}
                      className="justify-center text-center"
                    >
                      {t('table_filterClear')}
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
