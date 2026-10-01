# label

2026-10-01, transformation engine (legacy `default` style; wrapper matched the radix golden apart from formatting). Base UI has no Label primitive, so the wrapper renders a native `<label>`.

## Changed

- `apps/extension/src/components/ui/label.tsx`: `@radix-ui/react-label` replaced by a forwarded native `<label>`; `labelVariants` and classes unchanged. A `biome-ignore` explains that callers associate the control with `htmlFor`.
- Leftover scan: `grep -n "radix-ui\|@radix-ui" label.tsx` is clean.

## Left alone

- All `<Label htmlFor=...>` call sites (`SettingsFieldRow`, `AIProviderPanel`, `BookmarkEditDialog`, `BookmarkDetailsDialog`): every one already uses `htmlFor`, which is all the native element needs. Base UI checkbox, switch, and slider put the `id` on their hidden input, so `htmlFor` still labels them.

## Behavior changes

- Radix's label prevented text selection on double click; a native label does not. `select-none` was not added because it would change the user's classes.
- `peer-disabled:` in `labelVariants` only reacts to native disabled peers (inputs). It never matched a Base UI checkbox or switch root (a `<span>`), but no label in the app is placed after such a peer.

## Verify by hand

- Options page: click a setting's label; the switch or select it names gets focus or toggles.
- Double click a label: text selection now happens (Radix blocked it).
