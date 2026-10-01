# tooltip

2026-10-01, transformation engine (legacy `default` style; wrapper customized in #476: a Portal plus `whitespace-normal break-words` so text never clips). Customization kept.

## Changed

- `apps/extension/src/components/ui/tooltip.tsx`: `Tooltip.Provider/Root/Trigger` re-exported; `TooltipContent` is now `Portal > Positioner > Popup`. Positioning props (`side` default `top`, `sideOffset` 4, `align` `center`, `alignOffset` 0) are declared, destructured, and forwarded to the Positioner (`isolate z-50`); the Popup keeps `z-50`, `whitespace-normal break-words`, and the user's classes. `data-[state=closed]:*` became `data-closed:*`.
- `apps/extension/src/components/ui/table/data-table-toolbar.tsx`: `TooltipProvider delayDuration={200}` became `delay={200}`; `TooltipTrigger asChild` became `render={<button .../>}`.
- `apps/extension/src/components/ui/sidebar.tsx`: `TooltipProvider delayDuration={0}` became `delay={0}`; `TooltipTrigger asChild` became `render={button}`.
- `apps/extension/tests/e2e/bookmark-manager-table.spec.ts`: "current-folder help tooltip shows its full text" located the tooltip through `[data-radix-popper-content-wrapper]`; it now uses `[data-base-ui-portal]`.
- Leftover scan: `grep -n "radix-ui\|@radix-ui"` on these files is clean.

## Left alone

- `SidebarMenuButton`'s tooltip props (`side="right"`, `hidden`) still forward correctly; no app code renders a sidebar menu button.

## Behavior changes

- The popup has no `role="tooltip"` (Radix rendered a visually hidden `role="tooltip"` copy and linked it). The help trigger still has the full text as its `aria-label`.
- Skip-delay: Radix's `skipDelayDuration` (300 ms) became Base UI's `timeout` (default 400 ms).
- `collisionPadding` default changes from 0 to 5 px.

## Verify by hand

- Manager toolbar: hover the help icon next to "Current folder only"; after about 200 ms the full sentence shows, wrapped, not clipped.
- Move between two tooltips quickly; the second opens without delay.
- Press Escape while a tooltip is open; it closes.
