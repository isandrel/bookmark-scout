import { PreviewCard as PreviewCardPrimitive } from '@base-ui/react/preview-card';
import * as React from 'react';

/**
 * A card of details shown beside an element while the pointer rests on it or keyboard focus stays
 * on it (Base UI Preview Card, after shadcn's Hover Card). The card never takes focus. Pair it with
 * `createHoverCardController` (`src/lib/hover-card.ts`), which decides when it opens and closes, and
 * place it with `anchor` when one card serves many rows.
 */
const HoverCard = PreviewCardPrimitive.Root;

const HoverCardTrigger = PreviewCardPrimitive.Trigger;

const HoverCardContent = React.forwardRef<
  HTMLDivElement,
  Omit<PreviewCardPrimitive.Popup.Props, 'className'> &
    Pick<
      PreviewCardPrimitive.Positioner.Props,
      'align' | 'alignOffset' | 'side' | 'sideOffset' | 'anchor' | 'collisionPadding'
    > & {
      className?: string;
    }
>(
  (
    {
      className,
      align = 'start',
      alignOffset = 0,
      side = 'top',
      sideOffset = 4,
      anchor,
      collisionPadding,
      ...props
    },
    ref,
  ) => (
    // Portal so ancestors' `overflow` and `whitespace-nowrap` styles cannot clip the card.
    <PreviewCardPrimitive.Portal>
      <PreviewCardPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        anchor={anchor}
        collisionPadding={collisionPadding}
        // A row scrolled out of view takes its card with it.
        className="isolate z-50 data-anchor-hidden:invisible"
      >
        <PreviewCardPrimitive.Popup
          ref={ref}
          data-slot="hover-card"
          className={cn(
            'z-50 max-h-(--available-height) overflow-y-auto overscroll-contain whitespace-normal break-words rounded-md border bg-popover p-3 text-sm text-popover-foreground shadow-md outline-none data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95',
            className,
          )}
          {...props}
        />
      </PreviewCardPrimitive.Positioner>
    </PreviewCardPrimitive.Portal>
  ),
);
HoverCardContent.displayName = 'HoverCardContent';

export { HoverCard, HoverCardContent, HoverCardTrigger };
