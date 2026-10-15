import type { RefObject } from 'react';

type Hint = { bindings: readonly ShortcutBinding[]; label: MessageKey };

/**
 * The keys of `use-popup-shortcuts.ts`, drawn from its binding tables so the hints always name
 * the keys that work: the configured search key and the standard tree keys.
 */
const SEARCH_HINT: Hint = {
  bindings: SHORTCUT_BINDINGS.popup.focusSearch.slice(0, 1),
  label: 'popup_hintSearch',
};
const MOVE_HINT: Hint = {
  bindings: [...TREE_KEY_BINDINGS.previous, ...TREE_KEY_BINDINGS.next],
  label: 'popup_hintMove',
};
const EXPAND_HINT: Hint = {
  bindings: [...TREE_KEY_BINDINGS.collapse, ...TREE_KEY_BINDINGS.expand],
  label: 'popup_hintExpand',
};
const ENTER_HINT: Hint = { bindings: TREE_KEY_BINDINGS.activate, label: 'popup_hintEnter' };
const SAVE_TO_MATCH_HINT: Hint = {
  bindings: POPUP_SEARCH_INPUT_BINDINGS.saveToFirstMatch,
  label: 'qaPopup_hintSaveTo',
};

const HINTS: readonly Hint[] = [SEARCH_HINT, MOVE_HINT, EXPAND_HINT, ENTER_HINT];
/** While typing with folders matched, Enter saves first; the search key is already used. */
const SAVE_TO_MATCH_HINTS: readonly Hint[] = [SAVE_TO_MATCH_HINT, MOVE_HINT];

type PopupHintBarProps = {
  searchInputRef: RefObject<HTMLInputElement | null>;
  /** The folder Enter in the search box saves into (the first folder match), if any. */
  firstMatchTitle?: string;
  /** Id of the Save to hint, which the search box names as its description. */
  saveToHintId?: string;
};

/** Popup and side panel footer that names the tree's keyboard shortcuts. */
export function PopupHintBar({ searchInputRef, firstMatchTitle, saveToHintId }: PopupHintBarProps) {
  const focus = usePopupEnterFocus(searchInputRef);
  const savesToMatch = focus === 'search' && firstMatchTitle !== undefined;
  const hints = savesToMatch ? SAVE_TO_MATCH_HINTS : HINTS;
  const label = (hint: Hint) => {
    if (hint === SAVE_TO_MATCH_HINT) return t(hint.label, firstMatchTitle ?? '');
    return t(hint === ENTER_HINT && focus === 'saveRow' ? 'popup_hintSaveHere' : hint.label);
  };
  return (
    <section
      aria-label={t('popup_hintLabel')}
      title={popupShortcutsHint()}
      data-testid="popup-hint-bar"
      className="flex h-7 shrink-0 items-center gap-2.5 overflow-hidden border-t px-3 text-xs text-muted-foreground"
    >
      {hints.map((hint, index) => (
        <span
          key={hint.label}
          {...(hint === SAVE_TO_MATCH_HINT ? { id: saveToHintId, 'data-hint': 'save-to' } : {})}
          // The last hint drops out first at the popup's narrowest widths; the Save to hint
          // stays and shortens its folder name instead.
          className={cn(
            'flex items-center gap-1 whitespace-nowrap',
            hint === SAVE_TO_MATCH_HINT ? 'min-w-0' : 'shrink-0',
            index === hints.length - 1 && 'max-[360px]:hidden',
          )}
        >
          {hint.bindings.flatMap(shortcutKeyCaps).map((key) => (
            <Kbd key={key}>{key}</Kbd>
          ))}
          <span className="min-w-0 truncate">{label(hint)}</span>
        </span>
      ))}
    </section>
  );
}
