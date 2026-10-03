import { Select as SelectPrimitive } from '@base-ui/react/select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import * as React from 'react';

const Select = SelectPrimitive.Root;

const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
  HTMLButtonElement,
  Omit<SelectPrimitive.Trigger.Props, 'className'> & { className?: string }
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      'flex h-9 w-full items-center justify-between rounded-md border border-input bg-card px-3 py-1.5 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1',
      className,
    )}
    {...props}
  >
    {children}
    {/* Rendered as the chevron itself; null replaces Base UI's default "▼" text child. */}
    <SelectPrimitive.Icon render={<ChevronDown className="h-4 w-4 opacity-50" />}>
      {null}
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = 'SelectTrigger';

const SelectScrollUpButton = React.forwardRef<
  HTMLDivElement,
  Omit<SelectPrimitive.ScrollUpArrow.Props, 'className'> & { className?: string }
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpArrow
    ref={ref}
    className={cn('top-0 w-full flex cursor-default items-center justify-center py-1', className)}
    {...props}
  >
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpArrow>
));
SelectScrollUpButton.displayName = 'SelectScrollUpButton';

const SelectScrollDownButton = React.forwardRef<
  HTMLDivElement,
  Omit<SelectPrimitive.ScrollDownArrow.Props, 'className'> & { className?: string }
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownArrow
    ref={ref}
    className={cn(
      'bottom-0 w-full flex cursor-default items-center justify-center py-1',
      className,
    )}
    {...props}
  >
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownArrow>
));
SelectScrollDownButton.displayName = 'SelectScrollDownButton';

const SelectContent = React.forwardRef<
  HTMLDivElement,
  Omit<SelectPrimitive.Popup.Props, 'className'> &
    Pick<
      SelectPrimitive.Positioner.Props,
      'align' | 'alignOffset' | 'side' | 'sideOffset' | 'alignItemWithTrigger'
    > & { className?: string }
>(
  (
    {
      className,
      children,
      // Radix's popper position, which this wrapper defaulted to, never aligned the selected item
      // over the trigger and started at the trigger's edge.
      alignItemWithTrigger = false,
      align = 'start',
      alignOffset = 0,
      side = 'bottom',
      sideOffset = 0,
      ...props
    },
    ref,
  ) => (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        alignItemWithTrigger={alignItemWithTrigger}
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <SelectPrimitive.Popup
          ref={ref}
          className={cn(
            'relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
            !alignItemWithTrigger &&
              'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
            className,
          )}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List
            className={cn(
              'p-1',
              // Radix's viewport was a flex-grow child, so the trigger height only acted as a
              // minimum; a fixed height on Base UI's list would clip the options.
              !alignItemWithTrigger &&
                'min-h-[var(--anchor-height)] w-full min-w-[var(--anchor-width)]',
            )}
          >
            {children}
          </SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  ),
);
SelectContent.displayName = 'SelectContent';

const SelectItem = React.forwardRef<
  HTMLDivElement,
  Omit<SelectPrimitive.Item.Props, 'className'> & { className?: string }
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className,
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>

    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = 'SelectItem';

export {
  Select,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
