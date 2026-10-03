import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import * as React from 'react';
import { z } from 'zod';

const tooltipConfig = readConfig(
  'ui/tooltips',
  z.strictObject({ delay_ms: z.number().int().nonnegative() }),
);

/** Shares the open delay from config/ui/tooltips.toml with the tooltips inside it. */
function TooltipProvider({
  delay = tooltipConfig.delay_ms,
  ...props
}: TooltipPrimitive.Provider.Props) {
  return <TooltipPrimitive.Provider delay={delay} {...props} />;
}

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  HTMLDivElement,
  Omit<TooltipPrimitive.Popup.Props, 'className'> &
    Pick<TooltipPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'> & {
      className?: string;
    }
>(
  (
    { className, align = 'center', alignOffset = 0, side = 'top', sideOffset = 4, ...props },
    ref,
  ) => (
    // Portal so ancestors' `whitespace-nowrap` and `overflow` styles cannot clip the text.
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <TooltipPrimitive.Popup
          ref={ref}
          className={cn(
            'z-50 overflow-hidden whitespace-normal break-words rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
            className,
          )}
          {...props}
        />
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  ),
);
TooltipContent.displayName = 'TooltipContent';

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
