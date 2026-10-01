# separator

2026-10-01, transformation engine (legacy `default` style; wrapper matched the radix golden apart from formatting).

## Changed

- `apps/extension/src/components/ui/separator.tsx`: callable `Separator` from `@base-ui/react/separator`; the `decorative` prop (default `true` in this wrapper) was dropped because Base UI has no equivalent. Orientation-dependent classes unchanged.
- Leftover scan: `grep -n "radix-ui\|@radix-ui" separator.tsx` is clean.

## Left alone

- `SidebarSeparator` (`sidebar.tsx`) and the faceted filter's vertical separator only pass `className`/`orientation`, which still work.
- `DropdownMenuSeparator` and `SelectSeparator` use their own primitives (see those reports).

## Behavior changes

- Separators are now always exposed as `role="separator"`; with Radix's default `decorative` they were `role="none"`. Screen readers will announce them. `bookmark-table-column-resize.spec.ts` counts `separator` roles, but the only new one (in the faceted filter button) appears only when filter values are selected, and that count still passes.

## Verify by hand

- Manager: choose a Type filter value; the filter button shows a thin vertical rule before the badge.
- With a screen reader, the rule is announced as a separator (new).
