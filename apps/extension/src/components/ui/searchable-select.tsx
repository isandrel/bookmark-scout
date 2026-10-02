import { Combobox } from '@base-ui/react/combobox';
import { Check, ChevronDown, Search } from 'lucide-react';
import * as React from 'react';

export type SearchableSelectOption = { value: string; label: string; group?: string };

type OptionGroup = { value: string; items: SearchableSelectOption[] };

type SearchableSelectProps = {
  value: string;
  options: SearchableSelectOption[];
  onValueChange: (value: string) => void;
  searchPlaceholder: string;
  emptyText: string;
  className?: string;
} & Pick<
  React.ComponentProps<'button'>,
  'id' | 'aria-labelledby' | 'aria-describedby' | 'aria-invalid'
>;

/** Groups in first-seen order; options without a group share one unlabeled group. */
function groupOptions(options: SearchableSelectOption[]): OptionGroup[] {
  const groups = new Map<string, SearchableSelectOption[]>();
  for (const option of options) {
    const key = option.group ?? '';
    groups.set(key, [...(groups.get(key) ?? []), option]);
  }
  return [...groups].map(([value, items]) => ({ value, items }));
}

/**
 * A select for long option lists: the trigger looks like a Select, and the popup starts with a
 * search box that filters the options as the user types.
 */
export function SearchableSelect({
  value,
  options,
  onValueChange,
  searchPlaceholder,
  emptyText,
  className,
  ...triggerProps
}: SearchableSelectProps) {
  const groups = React.useMemo(() => groupOptions(options), [options]);
  const selected = options.find((option) => option.value === value) ?? null;

  return (
    <Combobox.Root
      items={groups}
      value={selected}
      onValueChange={(next: SearchableSelectOption | null) => {
        if (next) onValueChange(next.value);
      }}
      itemToStringLabel={(option: SearchableSelectOption) => option.label}
      itemToStringValue={(option: SearchableSelectOption) => option.value}
      isItemEqualToValue={(item: SearchableSelectOption, current: SearchableSelectOption) =>
        item.value === current.value
      }
    >
      <Combobox.Trigger
        {...triggerProps}
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-3 py-1.5 text-left text-sm ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      >
        <span className="truncate">
          <Combobox.Value />
        </span>
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 opacity-50" />
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} align="start" className="isolate z-50">
          <Combobox.Popup
            data-slot="searchable-select-popup"
            className="w-[var(--anchor-width)] min-w-64 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95"
          >
            <div className="flex items-center gap-2 border-b px-3">
              <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Combobox.Input
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Combobox.Empty className="px-3 py-6 text-center text-sm text-muted-foreground empty:hidden">
              {emptyText}
            </Combobox.Empty>
            <Combobox.List className="max-h-72 overflow-y-auto p-1 empty:hidden">
              {(group: OptionGroup) => (
                <Combobox.Group key={group.value} items={group.items} className="py-0.5">
                  {group.value ? (
                    <Combobox.GroupLabel className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                      {group.value}
                    </Combobox.GroupLabel>
                  ) : null}
                  <Combobox.Collection>
                    {(option: SearchableSelectOption) => (
                      <Combobox.Item
                        key={option.value}
                        value={option}
                        className="relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                      >
                        <Combobox.ItemIndicator className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                          <Check className="h-4 w-4" />
                        </Combobox.ItemIndicator>
                        <span className="truncate">{option.label}</span>
                      </Combobox.Item>
                    )}
                  </Combobox.Collection>
                </Combobox.Group>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
