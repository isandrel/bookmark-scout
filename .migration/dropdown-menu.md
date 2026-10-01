# dropdown-menu

2026-10-01, transformation engine (legacy `default` style; the wrapper is an older registry version without the golden's available-height cap). User classes kept. Primitive renamed: Radix `DropdownMenu` to Base UI `Menu`.

## Changed

- `apps/extension/src/components/ui/dropdown-menu.tsx`:
  - Re-exports: `Root`, `Trigger`, `Group`, `Portal`, `SubmenuRoot` (as `DropdownMenuSub`), `RadioGroup`.
  - `DropdownMenuContent`: `Portal > Positioner (isolate z-50 outline-none) > Popup`; `align` (center), `alignOffset` (0), `side` (bottom), `sideOffset` (4) declared, destructured, forwarded. Popup keeps the user's classes plus `outline-none`.
  - `DropdownMenuSubContent`: same structure with the submenu defaults from the skill (`align="start" alignOffset={-3} side="right" sideOffset={0}`).
  - `DropdownMenuSubTrigger` uses `SubmenuTrigger`; `data-[state=open]:bg-accent` became `data-popup-open:bg-accent`.
  - Item indicators split into `CheckboxItemIndicator` / `RadioItemIndicator`; `DropdownMenuLabel` uses `GroupLabel`.
  - `data-[state=open|closed]:*` animations became `data-open:*`/`data-closed:*`.
- `apps/extension/src/components/ui/table/bookmark-row-menu.tsx`: trigger `asChild` became `render={<Button .../>}`; the "Actions" label and regular items are wrapped in `DropdownMenuGroup`, because Base UI's group label throws outside a group.
- `apps/extension/src/components/ui/table/data-table-column-header.tsx`: trigger `asChild` became `render`; the button's `data-[state=open]:bg-accent` became `data-popup-open:bg-accent`.
- `apps/extension/tests/unit/bookmark-table-registry.test.ts`: rendered the row-menu items inside a Radix `DropdownMenu.Root` + `Content`. It now renders them directly inside an open Base UI `Menu.Root` (Base UI's Positioner requires a Portal, which does not render on the server).
- Leftover scan: `grep -n "radix-ui\|@radix-ui"` on these files is clean.

## Left alone

- `data-table-view-options.tsx`: separate report.
- `DropdownMenuItem onClick` call sites: Base UI items also use `onClick`.

## Behavior changes

- FLAG: `CheckboxItem`/`RadioItem` no longer close the menu on click (Base UI `closeOnClick` defaults to `false`; Radix closed unless `onSelect` called `preventDefault`). The only checkbox items (view options) already prevented closing, so nothing changes there; not patched in the wrapper.
- FLAG: keyboard focus now loops from the last item to the first (Base UI `loopFocus` defaults to `true`; Radix `loop` defaulted to `false`).
- Plain items still close the menu on click (Base UI default `closeOnClick` `true` on `Item`).
- `collisionPadding` default changes from 0 to 5 px.

## Verify by hand

- Manager: open a row's "Open menu" with click and with Enter; ArrowDown past the last item wraps to the first (new); Delete runs and the menu closes; Escape returns focus to the trigger.
- Click a column header: sort ascending/descending/clear and hide; the header button stays highlighted while its menu is open.
