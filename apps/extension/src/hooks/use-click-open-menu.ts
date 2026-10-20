/**
 * A menu whose trigger is also a drag handle. Base UI opens a menu on mousedown, which would take
 * the press a drag starts with, so the menu opens on click instead; a keyboard press still opens
 * it the usual way. Spread `menuProps` on `DropdownMenu` and pass `onTriggerClick` to the trigger.
 */
import { type MouseEvent, useState } from 'react';

type OpenChangeDetails = { event?: Event };

export function useClickOpenMenu() {
  const [open, setOpen] = useState(false);
  return {
    menuProps: {
      open,
      onOpenChange: (next: boolean, details: OpenChangeDetails) => {
        if (next && details.event?.type === 'mousedown') return;
        setOpen(next);
      },
    },
    // A keyboard press (detail 0) is already handled by the menu itself.
    onTriggerClick: (event: MouseEvent) => {
      if (event.detail > 0) setOpen((current) => !current);
    },
  };
}
