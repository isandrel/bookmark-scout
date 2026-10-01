# tabs

2026-10-01, transformation engine (legacy `default` style; wrapper identical to the radix golden apart from formatting).

## Changed

- `apps/extension/src/components/ui/tabs.tsx`: `Tabs.Root/List/Tab/Panel` from `@base-ui/react/tabs` (`Trigger` renamed to `Tab`, `Content` to `Panel`). Class rewrites: `data-[state=active]:*` to `data-active:*`; added `aria-disabled:pointer-events-none aria-disabled:opacity-50` beside the existing `disabled:*` classes.
- `apps/extension/src/components/page/OptionsPage.tsx`: the tab trigger classes `data-[state=active]:bg-primary data-[state=active]:text-primary-foreground` became `data-active:*`.
- Leftover scan: `grep -n "radix-ui\|@radix-ui"` on both files is clean.

## Left alone

- `OptionsPage.tsx` `Tabs value/onValueChange`: string values still work; the handler ignores the new event-details argument.

## Behavior changes

- FLAG: Radix tabs used automatic activation (arrow keys select the focused tab). Base UI defaults to manual activation: arrow keys move focus, Enter or Space selects. Not patched; `activateOnFocus` on `TabsList` would restore the Radix behavior if wanted.

## Verify by hand

- Options page: Tab into the category tabs, press ArrowRight: focus moves but the panel stays until Enter/Space (new).
- Click each tab; the active style (dark fill) follows the selection.
