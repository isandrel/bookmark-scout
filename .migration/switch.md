# switch

2026-10-01, transformation engine (legacy `default` style; the wrapper is customized: `h-5 w-9` track, `h-4 w-4` thumb, `shadow-sm`, unlike the golden's `h-6 w-11`). User classes kept.

## Changed

- `apps/extension/src/components/ui/switch.tsx`: `Switch.Root`/`Switch.Thumb` from `@base-ui/react/switch`. Class rewrites: `data-[state=checked]` to `data-checked`, `data-[state=unchecked]` to `data-unchecked` (root and thumb), `disabled:*` to `data-disabled:*` (the root is a `<span>`).
- Leftover scan: `grep -n "radix-ui\|@radix-ui" switch.tsx` is clean.

## Left alone

- `SettingsFieldRow.tsx` passes `id`, `checked`, `onCheckedChange(checked)`, `aria-labelledby`, `aria-describedby`; all still valid.

## Behavior changes

- The root is a `<span role="switch">` with a hidden `<input>` beside it (Radix rendered a `<button>`); `id` goes to the hidden input.
- `onCheckedChange` also receives event details as a second argument (unused here).

## Verify by hand

- Options page: toggle "Show Favicons" by click and by Space; the change saves and survives reload.
- Tab order still lands on each switch once.
