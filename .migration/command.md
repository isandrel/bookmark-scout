# command

2026-10-01, transformation engine, Radix usage only. The component itself is cmdk, which is not Radix and was not touched.

## Changed

- `apps/extension/src/components/ui/command.tsx`: `CommandDialog` typed its props with `DialogProps` from `@radix-ui/react-dialog`. It now uses `Dialog.Root.Props` from `@base-ui/react/dialog`, with `children` narrowed to `React.ReactNode` (Base UI also allows a payload render function, which `Command` cannot take). It still renders the shared `Dialog`/`DialogContent` wrappers.
- Leftover scan: `grep -n "radix-ui\|@radix-ui" command.tsx` is clean.

## Left alone

- All `cmdk` parts (`Command`, `CommandInput`, `CommandList`, `CommandEmpty`, `CommandGroup`, `CommandItem`, `CommandSeparator`, `CommandShortcut`) and their classes: cmdk is not Radix. cmdk still depends on Radix internally; that transitive dependency remains in the lockfile.

## Behavior changes

- None. `CommandDialog` is not used anywhere in the app.

## Verify by hand

- Manager: open the Type filter and type to search the options list (cmdk inside the Base UI popover); Enter selects.
