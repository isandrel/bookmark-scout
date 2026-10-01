# button

2026-10-01, transformation engine (style `default` is legacy: radix golden used for classification only; the wrapper matched the golden apart from formatting). Migrated to the real `@base-ui/react/button` primitive.

## Changed

- `apps/extension/src/components/ui/button.tsx`: `Slot`/`asChild` replaced by `ButtonPrimitive` from `@base-ui/react/button`; `ButtonProps` now extends `ButtonPrimitive.Props` (with `className` narrowed to `string` so `buttonVariants` keeps working). Classes unchanged.
- `apps/extension/src/components/bookmarks/BookmarkDetailsDialog.tsx`: the "Open link" call site used `<Button asChild><a/></Button>`. A Base UI button rendered as `<a>` gets `role="button"`, which removed the link role (caught by `bookmark-workflows.spec.ts` "opens full details..."). It is now a plain `<a className={buttonVariants({ variant: 'outline', size: 'sm' })}>`, which keeps the link semantics and the look.
- Leftover scan: `grep -n "radix-ui\|@radix-ui"` on both files is clean.

## Left alone

- Every other `<Button>` call site: props are unchanged. Buttons used as Radix-era `asChild` children of triggers were moved to `render={<Button .../>}` in the commits of the component that owned the trigger (dialog, popover, dropdown-menu, view options).

## Behavior changes

- Base UI's native button defaults to `type="button"`; a plain `<button>` defaults to `submit`. The only form in the extension (`BookmarkEditDialog`) already passes `type="submit"`, so nothing changes today, but a future `<Button>` inside a form will no longer submit unless it says `type="submit"`.
- `disabled` buttons are no longer focusable unless `focusableWhenDisabled` is passed (same as before in practice).

## Verify by hand

- Open a bookmark's details in the manager: "Open link" opens the page in a new tab and is announced as a link.
- Edit a bookmark and press Enter in the name field: the form still saves.
- Tab through the manager toolbar: every button shows the focus ring.
