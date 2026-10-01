# sidebar

2026-10-01, transformation engine (legacy `default` style; wrapper customized, about 176 differing lines against the radix golden). User classes kept.

## Changed

- `apps/extension/src/components/ui/sidebar.tsx`:
  - `Slot`/`asChild` in `SidebarGroupLabel`, `SidebarGroupAction`, `SidebarMenuButton`, `SidebarMenuAction`, and `SidebarMenuSubButton` replaced by `useRender` + `mergeProps` (`@base-ui/react/use-render`, `@base-ui/react/merge-props`); the components take `render` instead of `asChild`. Object literals with `data-*` keys are cast as the skill requires.
  - `SidebarMenuButton` calls `useRender` before the tooltip branch, so hooks run unconditionally.
  - Class rewrites for menu-trigger state: `data-[state=open]:hover:*` on menu buttons and `data-[state=open]:opacity-100` on menu actions became `data-popup-open:*`.
  - Tooltip call sites (in the tooltip commit): `TooltipProvider delayDuration={0}` became `delay={0}`; `TooltipTrigger asChild` became `render={button}`.
- Leftover scan: `grep -n "radix-ui\|@radix-ui" sidebar.tsx` is clean.

## Left alone

- The sidebar's own `data-state="expanded|collapsed"` attribute and the `peer-data-[state=collapsed]` / `[data-state=collapsed]` selectors: they belong to the sidebar, not to Radix.
- `SidebarProvider` (the only part used by the app, in the popup and side panel entrypoints).
- The pre-existing Biome `noDocumentCookie` warning.

## Behavior changes

- Public API: `asChild` props on the five components became `render`. No app code passes either.

## Verify by hand

- Open the popup and the side panel: both render and resize as before (they are wrapped in `SidebarProvider`).
