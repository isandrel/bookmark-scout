# select

2026-10-01, transformation engine (legacy `default` style; the wrapper is an older registry version: `max-h-96`, `overflow-hidden`, `placeholder:` instead of the golden's `data-[placeholder]:`). User classes kept.

## Changed

- `apps/extension/src/components/ui/select.tsx`:
  - `Select` is the bare `Select.Root` re-export; `SelectGroup`/`SelectValue` re-exported.
  - `SelectTrigger`: `Select.Icon asChild` became `render={<ChevronDown/>}` with `null` children, because Base UI's icon otherwise injects a "▼" text node into the chevron (it showed up in the trigger's text and broke `toHaveText` checks).
  - `SelectContent`: `Portal > Positioner > Popup`, with `ScrollUpArrow`, `List` (was `Viewport`), `ScrollDownArrow`. Radix `position="popper"` (this wrapper's default) became `alignItemWithTrigger = false`, plus Radix's popper defaults `align="start"` and `sideOffset={0}`; `side`, `align`, `alignOffset`, `sideOffset`, and `alignItemWithTrigger` are forwarded to the Positioner. `--radix-select-trigger-width` became `--anchor-width`. Radix's `h-[var(--radix-select-trigger-height)]` became `min-h-[var(--anchor-height)]`: Radix's viewport was a flex-grow child, so that height acted as a minimum, while a fixed height on Base UI's list clipped the options to one row (seen in the first visual check). `data-[state]` animations became `data-open`/`data-closed`.
  - `SelectLabel` uses `Select.GroupLabel`; `SelectScrollUp/DownButton` use the scroll arrows (`top-0 w-full` / `bottom-0 w-full` added).
- Call sites (consumer sweep):
  - `SettingsFieldRow.tsx`: passes `items` (value to label) so `SelectValue` shows labels, not raw values; ignores a `null` value.
  - `ImportPreviewDialog.tsx`: target select passes `value={targetId || null}` (so the placeholder shows for an empty id), maps `null` back to `''`, and passes `items`; strategy select passes `items` and ignores `null`.
  - `BookmarkBulkActions.tsx`: same empty-id handling and `items={targets}`.
  - `ToolsSidebar.tsx`: export-format select passes `items` and ignores `null`.
  - `ToolCards.tsx`: scope select shares one `scopeLabels` record (icon + text) between the items and `SelectValue`, so the trigger keeps showing the icon and label; ignores `null`.
- Leftover scan: `grep -n "radix-ui\|@radix-ui"` on these files is clean.

## Left alone

- `data-table-pagination.tsx`: values equal labels (`10`...`50`), so no `items` are needed; `side="top"` still works.

## Behavior changes

- `SelectValue` renders the raw value unless `items` (or a children function) are given; every select with labels different from values now passes `items`.
- `onValueChange` can emit `null` and passes event details; call sites guard `null`.
- `collisionPadding` default changes from 10 to 5 px.
- Items render `ItemText` as a `<div>` (Radix used a `<span>`).
- Base UI renders a hidden `<input>` after the trigger. In `space-x-*` rows that input becomes the last child, so the trigger gains the end margin: the manager's "Rows per page" group sits 8 px further left (visual check). Not patched.

## Verify by hand

- Options: open Language, Theme, Favicon Size, AI Provider, AI Model; the list shows every option, the selected one has a check, typeahead works, Escape closes and returns focus.
- Manager Tools: the export format and scope selects show their labels (scope with its icon).
- Bulk move: the target select shows its placeholder until a folder is chosen.
