# scroll-area

2026-10-01, transformation engine (legacy `default` style; wrapper identical to the radix golden apart from formatting). Note: `@radix-ui/react-scroll-area` was never declared in any `package.json`; it was resolved transitively.

## Changed

- `apps/extension/src/components/ui/scroll-area.tsx`: `ScrollArea.Root`, `Viewport`, `Scrollbar`, `Thumb`, `Corner` from `@base-ui/react/scroll-area` (radix `ScrollAreaScrollbar`/`ScrollAreaThumb` renamed). Classes unchanged.
- Leftover scan: `grep -n "radix-ui\|@radix-ui" scroll-area.tsx` is clean.

## Left alone

- `ReorganizationDialog.tsx` (only consumer) passes `className` only.

## Behavior changes

- Radix's default `type="hover"` hid the scrollbar until the area was hovered or scrolled. Base UI has no `type`; the scrollbar is shown whenever the content overflows. Flagged, not patched (the hover-only look could be restored with `opacity-0 data-hovering:opacity-100 data-scrolling:opacity-100`).

## Verify by hand

- Open AI Reorganize with a long plan: the list scrolls with wheel and by dragging the thumb; the thumb is visible without hovering (new).
