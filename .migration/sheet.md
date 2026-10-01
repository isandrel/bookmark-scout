# sheet

2026-10-01, transformation engine (legacy `default` style; wrapper customized with the localized close label). Built on `@base-ui/react/dialog`.

## Changed

- `apps/extension/src/components/ui/sheet.tsx`: same part mapping as dialog (`Overlay` to `Backdrop`, `Content` to `Popup`); `SheetContentProps` extends `Dialog.Popup.Props`. Every `data-[state=open|closed]:*` in the overlay, the `sheetVariants` base, and the four side variants became `data-open:*`/`data-closed:*`; the close button's `data-[state=open]:bg-secondary` became `data-open:bg-secondary`.
- Leftover scan: `grep -n "radix-ui\|@radix-ui" sheet.tsx` is clean.

## Left alone

- `sidebar.tsx` mobile `Sheet` usage (`open`, `onOpenChange`, `side`, `style`): still valid. The sheet is never shown in the extension: its only consumer is the `Sidebar` component, which no page renders (the app only uses `SidebarProvider`).

## Behavior changes

- Same as dialog: close unmounts after a frame; focus return uses Base UI's default (the trigger).

## Verify by hand

- Not reachable in the current UI. If a sheet is added: open it, Escape closes it, focus returns to the opener, and it slides from the chosen side.
