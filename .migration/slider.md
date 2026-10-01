# slider

2026-10-01, transformation engine (legacy `default` style; wrapper customized: it forwards `aria-label`, `aria-labelledby`, and `aria-valuetext` to the thumb). Customization kept.

## Changed

- `apps/extension/src/components/ui/slider.tsx`: `Slider.Root > Control > Track > Indicator` plus `Thumb` from `@base-ui/react/slider` (`Range` renamed to `Indicator`, new `Control`). Layout classes moved from Root to Control per the mapping; Root keeps the caller's `className`. `thumbAlignment="edge"` keeps the thumb inside the track like Radix. The thumb stays a sibling of the track inside Control because the track has `overflow-hidden`, which would clip a thumb nested in it. Thumb `disabled:*` became `data-disabled:*`. Props are typed for array values only (`Root.Props<readonly number[]>`), matching the Radix API the callers use.
- Leftover scan: `grep -n "radix-ui\|@radix-ui" slider.tsx` is clean.

## Left alone

- `SettingsFieldRow.tsx`: `value={[position]}` and `onValueChange={([next]) => ...}` still type-check against the array-typed wrapper.

## Behavior changes

- `onValueChange` receives event details as a second argument; `onValueCommit` would now be `onValueCommitted` (not used in the app).
- The thumb is a `<div>` with a nested `<input type="range">`; the accessible name and `aria-valuetext` land on the input (verified by `options-settings.spec.ts` "unlimited sliders announce No limit").

## Verify by hand

- Options > AI: drag "Max Categories" to 0 ("No limit") and back; use Arrow keys and Page Up/Down; the value text and the saved setting follow.
