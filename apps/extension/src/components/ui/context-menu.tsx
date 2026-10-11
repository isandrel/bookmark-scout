/**
 * A menu that opens at the pointer on right click (or the keyboard's menu key, or Shift+F10) on
 * its trigger: Base UI's ContextMenu, styled like `DropdownMenuContent`. Its items, groups, and
 * separators are the dropdown menu's (`DropdownMenuItem`, `DropdownMenuSeparator`), which are
 * the same Base UI menu parts.
 */
import { ContextMenu as ContextMenuPrimitive } from '@base-ui/react/context-menu';
import * as React from 'react';

const ContextMenuRoot = ContextMenuPrimitive.Root;

const ContextMenuTrigger = ContextMenuPrimitive.Trigger;

const ContextMenuContent = React.forwardRef<
  HTMLDivElement,
  Omit<ContextMenuPrimitive.Popup.Props, 'className'> & { className?: string }
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Portal>
    <ContextMenuPrimitive.Positioner className="isolate z-[110] outline-none">
      <ContextMenuPrimitive.Popup
        ref={ref}
        className={cn(
          'z-50 max-h-(--available-height) min-w-[12rem] overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95',
          className,
        )}
        {...props}
      />
    </ContextMenuPrimitive.Positioner>
  </ContextMenuPrimitive.Portal>
));
ContextMenuContent.displayName = 'ContextMenuContent';

export { ContextMenuContent, ContextMenuRoot, ContextMenuTrigger };
