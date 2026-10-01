# toast

2026-10-01, transformation engine from Base UI docs (no registry pair: shadcn's base registry uses sonner). Wrapper customized: success variant, progress bar, configurable duration, compact undo stack. All kept. Radix toast is declarative; Base UI toast is manager-driven, so this is the largest change.

## Changed

- `apps/extension/src/components/ui/toast.tsx`:
  - `ToastProvider` is `Toast.Provider`.
  - `ToastViewport` is `Toast.Portal > Toast.Viewport` rendered as an `<ol>` (the Radix viewport was an `<ol>` too), same classes.
  - `Toast` is `Toast.Root` rendered as an `<li>` with `swipeDirection="right"` (Radix default). It overrides Base UI's `role="dialog"` with Radix's `role="status" aria-live="off" aria-atomic`, so notifications are not exposed as dialogs (specs that assert "no dialog is open" rely on this), and provides a close function to `ToastAction` through a small context.
  - `ToastAction` is `Toast.Action`; it runs the caller's `onClick` and then closes its toast, because Radix's action also closed the toast and Base UI's does not. `Toast.Close` was not used for this: Base UI marks close buttons `aria-hidden` until the stack is hovered or focused, which hid "Undo" from assistive technology and from role queries.
  - `ToastTitle`/`ToastDescription` keep Radix's `<div>` elements (`render={<div />}`; Base UI defaults to `<h2>`/`<p>`).
  - `toastVariants`: Radix swipe classes (`data-[swipe=move|cancel|end]` and `--radix-toast-swipe-*`) replaced by `data-swiping:transition-none` and `data-ending-style:data-[swipe-direction=right]:translate-x-[var(--toast-swipe-movement-x)]` (Base UI moves the toast itself while swiping); `data-[state=open]:*` enter classes became unconditional and `data-[state=closed]:*` exit classes became `data-ending-style:*` (toast roots have no `data-open`/`data-closed`).
  - The exported `ToastProps` type (what `toast()` accepts) is now declared explicitly instead of being derived from the Radix root, so `use-toast.ts` is unchanged.
- `apps/extension/src/components/ui/toaster.tsx`: the Provider gets `timeout` (the `toastDurationMs` setting) and an unlimited `limit` (undo toasts are never dropped). A `ToastStack` component mirrors `useToast()`'s list into Base UI's manager: new toasts are added oldest first (with their `id`, title, description, `timeout`, and the action and variant as `data`), changed ones are updated, removed or dismissed ones are closed, and Base UI's `onClose` (timer, close button, Escape, swipe) dismisses the toast in `useToast()`. Rendering keeps the old layout: oldest first, newest in full, older ones compact (`data-compact`), progress bar, close button, scroll-to-newest.
- `use-toast.ts` is unchanged: its reducer still decides which toasts exist (an informational toast replaces the previous one; undo toasts stay), and its unit tests (`toast-stack.test.ts`, `popup-ui-state.test.ts`) still pass.
- Call sites: `altText` removed from the four `ToastAction`s (`PopupPage.tsx`, `use-bookmark-deletion.tsx`, `ImportPreviewDialog.tsx`, `ToolsSidebar.tsx`); Base UI has no equivalent.
- Locales: `toast_itemLabel` removed from `en`, `ja`, `ko` (it was Radix's per-toast announcement label; Base UI has none). `toast_regionLabel` stays; `{hotkey}` is now replaced with `F6`.
- Tests: the shared helper `toastRegion()` in `tests/e2e/fixtures.ts` now matches `"<label> (F6)"` and takes an optional localized label; `bookmark-workflows.spec.ts` (2 places) and `popup-tree-actions.spec.ts` (the Japanese `通知 (F8)` check) used the literal region name and now call the helper.
- Leftover scan: `grep -n "radix-ui\|@radix-ui"` on these files is clean.

## Left alone

- `src/hooks/use-toast.ts` (API and reducer).
- Every `toast({...})` call (title, description, variant, duration, action).
- sonner is not used in the extension.

## Behavior changes

Flagged; Base UI cannot preserve these:

- The keyboard shortcut that moves focus to the notifications is F6 (Base UI hard-wires it); Radix used F8. The region's accessible name changed from "Notifications (F8)" to "Notifications (F6)" (and the ja/ko equivalents).
- Each toast is no longer prefixed with "Notification" in announcements (Radix's provider `label`).
- Radix announced toasts assertively (`type="foreground"` default, via a hidden announcer); Base UI announces them politely through the viewport's live region (`priority: 'low'`). `priority: 'high'` would make them urgent but also adds hidden alert copies and hides the toast from assistive technology until focused, so it was not set.
- The X close button is `aria-hidden` until the stack is hovered or focused (Base UI's design); it stays visible and clickable.
- Timers also pause while the window is blurred and while any toast is hovered, as in Radix; the swipe threshold is 40 px (Radix 50 px) and not configurable.
- The viewport is portalled to `<body>`; Radix rendered it in place. Its fixed position and `z-[100]` are unchanged.

Preserved deliberately (not Base UI defaults): action buttons close their toast, and toasts keep `role="status"`. With Base UI's `role="dialog"`, any visible toast would also have matched the keyboard-shortcut overlay check in `src/lib/keyboard-shortcuts.ts` and paused the manager and popup shortcuts.

## Verify by hand

- Popup: delete five bookmarks quickly with confirmation off; five Undo toasts stack, older ones compact, the stack stays within half the popup; Undo on the oldest restores it and closes that toast.
- Hover an undo toast for longer than its window; it still closes when the 10-second undo window ends.
- Set "Toast duration" in Options to a short value; informational toasts close after it.
- Press F6 with toasts visible; focus moves into the notifications; Escape closes the focused toast.
- Japanese UI: the region is announced as "通知 (F6)".
