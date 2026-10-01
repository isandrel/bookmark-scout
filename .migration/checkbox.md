# checkbox

2026-10-01, transformation engine (legacy `default` style; the wrapper is an older registry version: the current radix golden uses `grid place-content-center`, the user's file `flex` on the indicator). User classes kept.

## Changed

- `apps/extension/src/components/ui/checkbox.tsx`: `Checkbox.Root`/`Checkbox.Indicator` from `@base-ui/react/checkbox`. Class rewrites: `data-[state=checked]:*` to `data-checked:*`; `disabled:*` to `data-disabled:*` (the root is now a `<span>`, so `:disabled` never matches). Added `inline-flex items-center justify-center` because the root changed from a `<button>` (inline-block, centered content) to a `<span>`, which would otherwise ignore `h-4 w-4`.
- `apps/extension/src/components/ui/table/columns.tsx`: the select-all header passed `checked={all || (some && 'indeterminate')}`; it now passes `checked={all}` and `indeterminate={!all && some}`.
- Leftover scan: `grep -n "radix-ui\|@radix-ui"` on both files is clean.

## Left alone

- Row checkboxes in `columns.tsx`, the "Current folder only" checkbox in `data-table-toolbar.tsx`, and the metadata-apply checkboxes in `ToolResultViews.tsx`: `checked`, `onCheckedChange`, `id`, and `aria-*` props are unchanged; `onCheckedChange` callers only read the first argument.

## Behavior changes

- The root is a `<span role="checkbox">` plus a hidden `<input>`; `id` moves to the hidden input, and the span takes its accessible name from labels of that input. Label clicks still toggle.
- Indeterminate is now a separate state (`aria-checked="mixed"`, `data-indeterminate`), independent of `checked`.

## Verify by hand

- Manager: select one row; the header checkbox shows the mixed state; click it to select the page, again to clear.
- Click "Current folder only" text; the checkbox toggles.
- Tab to a row checkbox and press Space; it toggles without opening the row.
