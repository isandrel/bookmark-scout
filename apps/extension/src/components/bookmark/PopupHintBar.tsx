import { useEffect, useState } from 'react';

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

/** Whether Enter on the focused element saves the current page (a folder row that can hold it). */
function useEnterSavesHere(): boolean {
  const [savesHere, setSavesHere] = useState(false);
  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      setSavesHere(
        target instanceof HTMLElement && target.hasAttribute(POPUP_TREE_CAN_SAVE_ATTRIBUTE),
      );
    };
    // Focus leaving the page, or moving to nothing, ends "save here".
    const onFocusOut = (event: FocusEvent) => {
      if (!event.relatedTarget) setSavesHere(false);
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);
  return savesHere;
}

/** Popup and side panel footer that names the tree's keyboard shortcuts. */
export function PopupHintBar() {
  const savesHere = useEnterSavesHere();
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
          {t(hint.label === 'popup_hintEnter' && savesHere ? 'popup_hintSaveHere' : hint.label)}
        </span>
      ))}
    </section>
  );
}
