# collapsible

2026-10-01, transformation engine (legacy `default` style; wrapper identical to the radix golden).

## Changed

- `apps/extension/src/components/ui/collapsible.tsx`: re-exports `Collapsible.Root`, `Collapsible.Trigger`, and `Collapsible.Panel` (as `CollapsibleContent`) from `@base-ui/react/collapsible`.
- `apps/extension/src/components/bookmarks/ReorganizationDialog.tsx:302,333`: chevron classes `data-[state=open]:rotate-180` rewritten to `data-open:rotate-180`.
- Leftover scan: `grep -n "radix-ui\|@radix-ui"` on both files is clean.

## Left alone

- The rest of `ReorganizationDialog.tsx`.

## Behavior changes

- None from the primitive. Note (pre-existing, not changed): the chevron rotation class sits on the `<ChevronDown>` icon, which never carried a state attribute under Radix either, so the chevron never rotated. Base UI marks the trigger with `data-panel-open`; a working version would be `[&[data-panel-open]>svg]:rotate-180` on the trigger.

## Verify by hand

- Manager Tools: run "AI Reorganize" with a mocked or real provider, open the operations list and the debug section; both expand and collapse with mouse and Enter/Space.
