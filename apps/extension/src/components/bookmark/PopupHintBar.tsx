/**
 * The keys of `use-popup-shortcuts.ts`, drawn from its binding tables so the hints always name
 * the keys that work: the configured search key and the standard tree keys.
 */
const HINTS: readonly { bindings: readonly ShortcutBinding[]; label: MessageKey }[] = [
  { bindings: SHORTCUT_BINDINGS.popup.focusSearch.slice(0, 1), label: 'popup_hintSearch' },
  {
    bindings: [...POPUP_TREE_BINDINGS.previous, ...POPUP_TREE_BINDINGS.next],
    label: 'popup_hintMove',
  },
  {
    bindings: [...POPUP_TREE_BINDINGS.collapse, ...POPUP_TREE_BINDINGS.expand],
    label: 'popup_hintExpand',
  },
  { bindings: POPUP_TREE_BINDINGS.activate, label: 'popup_hintEnter' },
];

/** Popup and side panel footer that names the tree's keyboard shortcuts. */
export function PopupHintBar() {
  return (
    <section
      aria-label={t('popup_hintLabel')}
      title={popupShortcutsHint()}
      data-testid="popup-hint-bar"
      className="flex h-7 shrink-0 items-center gap-2.5 overflow-hidden border-t px-3 text-xs text-muted-foreground"
    >
      {HINTS.map((hint, index) => (
        <span
          key={hint.label}
          // The last hint drops out first at the popup's narrowest widths.
          className={cn(
            'flex shrink-0 items-center gap-1 whitespace-nowrap',
            index === HINTS.length - 1 && 'max-[360px]:hidden',
          )}
        >
          {hint.bindings.flatMap(shortcutKeyCaps).map((key) => (
            <Kbd key={key}>{key}</Kbd>
          ))}
          {t(hint.label)}
        </span>
      ))}
    </section>
  );
}
