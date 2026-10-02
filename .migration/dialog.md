# dialog

2026-10-01, transformation engine (legacy `default` style; wrapper customized: localized `sr-only` close label via `t('action_close')`). Customization kept.

## Changed

- `apps/extension/src/components/ui/dialog.tsx`: `Dialog.Root/Trigger/Portal/Close` re-exported; `DialogOverlay` is `Dialog.Backdrop`; `DialogContent` is `Portal > Backdrop + Popup` (centered modal, no Positioner); `DialogTitle`/`DialogDescription` use Base UI parts. `data-[state=open|closed]:*` became `data-open:*`/`data-closed:*`. Exported names unchanged.
- `apps/extension/src/components/page/PopupPage.tsx`: the delete-confirmation dialog's `onCloseAutoFocus={(event) => { event.preventDefault(); restoreFocus(true); }}` became `finalFocus={() => { restoreFocus(true); return false; }}`.
- `apps/extension/src/components/bookmarks/ManagerShortcutsHelp.tsx`: `DialogTrigger asChild` became `render={<Button .../>}`.
- `apps/extension/tests/e2e/tool-helpers.ts` (shared helper): `toolCard()` now scopes the heading lookup to `data-testid="tools-sidebar"`; see behavior changes.
- Leftover scan: `grep -n "radix-ui\|@radix-ui"` on these files is clean.

## Left alone

- All other `Dialog open/onOpenChange` call sites (`ToolsSidebar`, `ImportPreviewDialog`, `BookmarkEditDialog`, `BookmarkDeleteDialog`, `BookmarkDetailsDialog`, `ExportPrivacyReviewDialog`, `ToolResultsDialog`, `ReorganizationDialog`, `RecommendedFolderDialog`, `BookmarkBulkActions`, `BookmarksPage`): they pass setters or `(open) => ...` handlers, which ignore Base UI's new event-details argument.

## Behavior changes

- After Escape or a close click, Base UI keeps the dialog mounted for about a frame while it checks for exit animations; the rest of the page stays `aria-hidden` until then. Two specs found the dialog's title instead of the tool card heading in that window (`settings-behavior.spec.ts`, `tool-reports.spec.ts`); the shared `toolCard()` helper now looks only inside the tools sidebar.
- Base UI scrolls the dialog to its initially focused element; Radix focused with `preventScroll`. The manager's Bookmark Details dialog focused "Copy URL" at the bottom (its tag inputs are disabled while metadata loads), so it opened scrolled down with its title out of view (`scrollTop` 155 to 563). Fixed afterwards in `fix/base-ui-followups`: that dialog sets `initialFocus` to its own popup, which Base UI focuses without scrolling; Tab then reaches the first control. Covered by `bookmark-manager-table.spec.ts` ("bookmark details open with the title in view"). The shared wrapper is unchanged: a probe over the E2E suite showed no other dialog scrolls on open, edit dialogs focus their first input, and the delete, export-review, and Duplicate Cleaner confirmations focus Cancel, as with Radix. Opened by keyboard, the Details popup shows the browser focus ring.
- Focus return on close uses `finalFocus` instead of Radix's `onCloseAutoFocus`; the popup's delete dialog still returns focus to the row (E2E covered). Dialogs opened from a row menu now return focus to the menu trigger on close; with Radix focus fell back to `<body>`.
- `modal` also accepts `'trap-focus'` (unused).

## Verify by hand

- Popup: delete a folder with confirmation on; Cancel and Escape both return focus to the folder row.
- Manager: open "Keyboard shortcuts" with the keyboard icon and with `?`; Escape closes it and focus returns to the icon.
- Manager: open a bookmark's "View Details" in a short window; it opens with the title in view, and Tab moves to the first control.
- Click the backdrop of any tool dialog; it closes.
