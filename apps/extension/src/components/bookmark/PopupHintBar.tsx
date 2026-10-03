/**
 * Shortcuts of `use-popup-shortcuts.ts`; list only ones that exist there. The search key is the
 * configured binding; the tree keys follow the standard tree pattern and are fixed.
 */
const HINTS: readonly { keys: readonly string[]; label: MessageKey }[] = [
  { keys: shortcutKeyCaps(SHORTCUT_BINDINGS.popup.focusSearch[0]), label: 'popup_hintSearch' },
  { keys: ['↑', '↓'], label: 'popup_hintMove' },
  { keys: ['←', '→'], label: 'popup_hintExpand' },
  { keys: ['↵'], label: 'popup_hintEnter' },
];

/** Popup and side panel footer that names the tree's keyboard shortcuts. */
export function PopupHintBar() {
  return (
    <section
      aria-label={t('popup_hintLabel')}
      title={t('shortcuts_popupHint')}
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
          {hint.keys.map((key) => (
            <Kbd key={key}>{key}</Kbd>
          ))}
          {t(hint.label)}
        </span>
      ))}
    </section>
  );
}
