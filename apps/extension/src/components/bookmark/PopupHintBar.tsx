/** Keys and labels from `use-popup-shortcuts.ts`; list only shortcuts that exist there. */
const HINTS = [
  { keys: ['/'], label: 'popup_hintSearch' },
  { keys: ['↑', '↓'], label: 'popup_hintMove' },
  { keys: ['←', '→'], label: 'popup_hintExpand' },
  { keys: ['↵'], label: 'popup_hintEnter' },
] as const;

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
