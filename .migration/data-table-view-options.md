# data-table-view-options

2026-10-01, transformation engine. App component (`components/ui/table/data-table-view-options.tsx`), not a shadcn registry wrapper. It imported `DropdownMenuTrigger` straight from `@radix-ui/react-dropdown-menu`, shadowing the shared wrapper.

## Changed

- `apps/extension/src/components/ui/table/data-table-view-options.tsx`, in two commits:
  1. Dropped the direct Radix import so the file uses the shared (auto-imported) `DropdownMenuTrigger`.
  2. Base UI call-site changes: trigger `asChild` became `render={<Button .../>}`; the "Customize columns" label, its separator, and the column rows are wrapped in `DropdownMenuGroup` (Base UI's group label must be inside a group); the checkbox items' `onSelect={(event) => event.preventDefault()}` was removed because Base UI checkbox items already stay open on click.
- Leftover scan: `grep -n "radix-ui\|@radix-ui" data-table-view-options.tsx` is clean.

## Left alone

- Column move buttons, reset button, and the column ordering logic.

## Behavior changes

- None visible: the menu still stays open while toggling columns. Arrow-key focus now wraps (see dropdown-menu).
- Note: between the dropdown-menu commit and this file's follow-up commit, the view options menu would not have worked at runtime; the PR is squash-merged, so `main` never sees that state.

## Verify by hand

- Manager: open "View", toggle columns on and off, move a column up and down, and reset the view; the menu stays open until Escape or an outside click.
- Narrow the window until a column is hidden for space; its checkbox item is disabled with the explanation tooltip.
