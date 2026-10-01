# popover

2026-10-01, transformation engine (legacy `default` style; the wrapper is an older registry version without the golden's `origin-[--radix-popover-content-transform-origin]`). User classes kept.

## Changed

- `apps/extension/src/components/ui/popover.tsx`: `Popover.Root/Trigger` re-exported; `PopoverContent` is `Portal > Positioner > Popup`, with `align` (default `center`), `alignOffset`, `side` (default `bottom`), and `sideOffset` (default 4) declared, destructured, and forwarded to the Positioner (`isolate z-50`). `data-[state=open|closed]:*` became `data-open:*`/`data-closed:*`.
- `apps/extension/src/components/ui/table/data-table-faceted-filter.tsx` and `data-table-date-filter.tsx`: `PopoverTrigger asChild` + `<Button>` child became `render={<Button .../>}` with the button's children moved into the trigger.
- Leftover scan: `grep -n "radix-ui\|@radix-ui"` on these files is clean.

## Left alone

- `PopoverContent align="start"` call sites: still valid.
- The cmdk `Command*` and react-day-picker `Calendar` content inside the popovers (not Radix).

## Behavior changes

- `collisionPadding` and `arrowPadding` defaults change from 0 to 5 px; the popover may sit up to 5 px further from a viewport edge.
- Base UI popovers are non-modal by default, like Radix.

## Verify by hand

- Manager: open the Type and Domain filters, pick values with mouse and keyboard; the button shows the selected badges.
- Open the Date Added filter, pick a range; Escape closes it and focus returns to the trigger.
