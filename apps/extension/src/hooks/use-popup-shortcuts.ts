/**
 * Keyboard shortcuts for the popup and side panel.
 *
 * - focusSearch (`popup.focus_search`, `/` unless the user changed it in Options) focuses the
 *   search box; Escape in it clears the query, then leaves the box.
 * - ArrowDown in the search box moves into the tree; ArrowUp on the first row moves back.
 *   Alt+ArrowDown opens the recent searches instead.
 * - Enter in the search box saves the current page into the first Save to folder row, the
 *   combobox's default option, when folders match; otherwise the search box keeps it.
 * - In the tree, ArrowUp/ArrowDown/Home/End move between visible folders and bookmarks,
 *   ArrowRight opens a folder (or enters it), ArrowLeft closes it (or goes to its parent), and
 *   Enter on a folder saves the current page into it (or opens or closes a folder that cannot
 *   hold bookmarks). Space opens or closes a folder. Enter on a bookmark opens it natively.
 *
 * The tree renders only the rows on screen, so moves within it go through `PopupTreeHandle`;
 * the Save to folder rows above it are always rendered and move through the page.
 */

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { flushSync } from 'react-dom';

/** Marks tree rows: `folder` on folder triggers, `bookmark` on bookmark links. */
export const POPUP_TREE_ROW_ATTRIBUTE = 'data-popup-tree-row';
/** The folder id on a folder row's trigger. */
export const POPUP_TREE_FOLDER_ATTRIBUTE = 'data-folder-trigger';
/** Present on folder rows that can hold bookmarks, where Enter saves the current page. */
export const POPUP_TREE_CAN_SAVE_ATTRIBUTE = 'data-can-save';
/** On the Save to folder row that Enter in the search box saves into: the first one shown. */
export const POPUP_ENTER_TARGET_ATTRIBUTE = 'data-enter-target';
const TREE_ROW_SELECTOR = `[${POPUP_TREE_ROW_ATTRIBUTE}]`;

/**
 * Keys the search box handles itself: Escape clears or leaves it, ArrowDown enters the tree, and
 * Enter saves into the first folder match.
 */
export const POPUP_SEARCH_INPUT_BINDINGS = {
  escape: [{ key: 'Escape' }],
  enterTree: [{ key: 'ArrowDown' }],
  saveToFirstMatch: TREE_KEY_BINDINGS.activate,
} as const satisfies Record<string, readonly ShortcutBinding[]>;

/**
 * What the popup's shortcuts tooltip lists, in order. Keys always come from the bindings (the
 * page's, `usePageShortcuts`, and the ones above), so the tooltip follows any change to them;
 * adding a shortcut means one entry here and one action message. Recent searches open from the
 * empty search box (`recent_searches`), so a plain ArrowDown always reaches the tree; once open,
 * ArrowUp and ArrowDown move through them.
 */
const popupShortcutHints = (
  page: PageShortcutBindings,
): readonly { bindings: readonly ShortcutBinding[]; actionKey: MessageKey }[] => [
  { bindings: page.popup.focusSearch, actionKey: 'shortcuts_popupHintSearch' },
  {
    bindings: [...TREE_KEY_BINDINGS.next, ...TREE_KEY_BINDINGS.previous],
    actionKey: 'shortcuts_popupHintMove',
  },
  {
    bindings: [...TREE_KEY_BINDINGS.expand, ...TREE_KEY_BINDINGS.collapse],
    actionKey: 'shortcuts_popupHintOpenClose',
  },
  { bindings: TREE_KEY_BINDINGS.activate, actionKey: 'shortcuts_popupHintSave' },
  { bindings: POPUP_SEARCH_INPUT_BINDINGS.escape, actionKey: 'shortcuts_popupHintClear' },
  { bindings: page.popupSearchHistory.open, actionKey: 'shortcuts_popupHintRecent' },
];

/** The popup's shortcuts tooltip, with every key printed the way this platform labels it. */
export function popupShortcutsHint(page: PageShortcutBindings = SHORTCUT_BINDINGS): string {
  const items = popupShortcutHints(page).map(({ bindings, actionKey }) =>
    t('shortcuts_hintItem', [
      bindings.map((binding) => shortcutKeyCaps(binding).join('+')).join(' '),
      t(actionKey),
    ]),
  );
  return t('shortcuts_popupHint', formatList(items));
}

/** Rows outside the tree, such as Save to folder; always rendered, in page order. */
function getOutsideTreeRows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(TREE_ROW_SELECTOR)).filter(
    (row) => !row.hasAttribute(POPUP_TREE_ROW_ID_ATTRIBUTE),
  );
}

/** Focuses the first row: Save to folder, if shown, then the tree. Returns false if there is none. */
function focusFirstRow(tree: PopupTreeHandle | null): boolean {
  const [outside] = getOutsideTreeRows();
  if (outside) {
    outside.focus();
    return true;
  }
  const first = tree?.firstRowId();
  if (first === undefined || !tree) return false;
  tree.focusRow(first);
  return true;
}

type PopupShortcutOptions = {
  searchInputRef: RefObject<HTMLInputElement | null>;
  treeRef: RefObject<PopupTreeHandle | null>;
  onClearQuery: () => void;
  /**
   * Applies the typed query now instead of after the search delay. ArrowDown right after typing
   * would otherwise focus a row of the previous results, which the new results then remove.
   */
  onApplyQuery?: () => void;
  /** Saves the current page into a folder; Enter in the search box calls it for the first match. */
  onSaveToFolder?: (folderId: string) => void;
};

/**
 * Enter in the search box: applies the typed query, then saves into the row marked
 * `POPUP_ENTER_TARGET_ATTRIBUTE` if one is shown. Without one, the key keeps its search box
 * meaning (recent searches).
 */
function saveToFirstMatch(
  event: KeyboardEvent,
  onApplyQuery: (() => void) | undefined,
  onSaveToFolder: ((folderId: string) => void) | undefined,
): void {
  if (!onSaveToFolder) return;
  // The matches follow the search after a delay; Enter right after typing uses the typed text.
  if (onApplyQuery) flushSync(onApplyQuery);
  const row = document.querySelector<HTMLElement>(`[${POPUP_ENTER_TARGET_ATTRIBUTE}]`);
  const folderId = row?.getAttribute(POPUP_TREE_FOLDER_ATTRIBUTE);
  if (!row || !folderId) return;
  event.preventDefault();
  // A held Enter repeats keydown, and a row still saving says so; one press saves once.
  if (!event.repeat && row.getAttribute('aria-disabled') !== 'true') onSaveToFolder(folderId);
}

/**
 * Page-wide shortcuts: `/` to search, and Escape, ArrowDown, and Enter inside the search box.
 * `findShortcut` skips keys an IME is composing with, so confirming a word never saves.
 */
export function usePopupShortcuts({
  searchInputRef,
  treeRef,
  onClearQuery,
  onApplyQuery,
  onSaveToFolder,
}: PopupShortcutOptions) {
  const { popup } = usePageShortcuts();
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const input = searchInputRef.current;
      if (!input) return;

      if (event.target === input) {
        // The search box handles its own history list first and marks those keys handled.
        const action = findShortcut(event, POPUP_SEARCH_INPUT_BINDINGS, { allowWhileTyping: true });
        if (action === 'escape') {
          event.preventDefault();
          if (input.value) {
            onClearQuery();
          } else {
            input.blur();
          }
        } else if (action === 'enterTree') {
          if (onApplyQuery) flushSync(onApplyQuery);
          if (focusFirstRow(treeRef.current)) event.preventDefault();
        } else if (action === 'saveToFirstMatch') {
          saveToFirstMatch(event, onApplyQuery, onSaveToFolder);
        }
        return;
      }

      if (findShortcut(event, popup) === 'focusSearch') {
        event.preventDefault();
        input.focus();
        input.select();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [searchInputRef, treeRef, onClearQuery, onApplyQuery, onSaveToFolder, popup]);
}

/** Where the keyboard is, for what Enter does: the search box, a folder row that saves, or other. */
export type PopupEnterFocus = 'search' | 'saveRow' | null;

/** Follows focus to say what Enter does now (`PopupEnterFocus`). */
export function usePopupEnterFocus(
  searchInputRef: RefObject<HTMLInputElement | null>,
): PopupEnterFocus {
  const [focus, setFocus] = useState<PopupEnterFocus>(null);
  useEffect(() => {
    const read = (target: EventTarget | null): PopupEnterFocus => {
      if (target && target === searchInputRef.current) return 'search';
      return target instanceof HTMLElement && target.hasAttribute(POPUP_TREE_CAN_SAVE_ATTRIBUTE)
        ? 'saveRow'
        : null;
    };
    // The search box takes focus when the page opens, before this runs.
    setFocus(read(document.activeElement));
    const onFocusIn = (event: FocusEvent) => setFocus(read(event.target));
    // Focus leaving the page, or moving to nothing, ends both.
    const onFocusOut = (event: FocusEvent) => {
      if (!event.relatedTarget) setFocus(null);
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, [searchInputRef]);
  return focus;
}

type PopupTreeKeyOptions = {
  searchInputRef: RefObject<HTMLInputElement | null>;
  treeRef: RefObject<PopupTreeHandle | null>;
  setFolderExpanded: (folderId: string, expanded: boolean) => void;
  /** Saves the current page into the folder; only called for folders marked `data-can-save`. */
  onSaveToFolder: (folderId: string) => void;
};

/** Key handler for the tree and the Save to folder rows above it. */
export function usePopupTreeKeys({
  searchInputRef,
  treeRef,
  setFolderExpanded,
  onSaveToFolder,
}: PopupTreeKeyOptions) {
  return useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      const row = event.target as HTMLElement;
      // Only rows navigate; action buttons and the new-folder input keep their own keys.
      if (!row.hasAttribute?.(POPUP_TREE_ROW_ATTRIBUTE)) return;
      const action = findShortcut(event.nativeEvent, TREE_KEY_BINDINGS);
      if (!action) return;

      const isFolder = row.getAttribute(POPUP_TREE_ROW_ATTRIBUTE) === 'folder';
      const folderId = row.getAttribute(POPUP_TREE_FOLDER_ATTRIBUTE);
      const isOpen = row.getAttribute('aria-expanded') === 'true';
      const tree = treeRef.current;
      // A tree row; Save to folder rows have no id here.
      const treeId = row.getAttribute(POPUP_TREE_ROW_ID_ATTRIBUTE);
      const outside = getOutsideTreeRows();
      const outsideIndex = outside.indexOf(row);
      const focus = (target: HTMLElement | null | undefined) => {
        event.preventDefault();
        target?.focus();
      };
      const focusTreeRow = (id: string | undefined) => {
        event.preventDefault();
        if (id !== undefined) tree?.focusRow(id);
      };

      switch (action) {
        case 'next':
          if (treeId !== null) focusTreeRow(tree?.rowIdAt(treeId, 1));
          else if (outside[outsideIndex + 1]) focus(outside[outsideIndex + 1]);
          else focusTreeRow(tree?.firstRowId());
          break;
        case 'previous':
          if (treeId !== null) {
            const previous = tree?.rowIdAt(treeId, -1);
            if (previous !== undefined) focusTreeRow(previous);
            else focus(outside.at(-1) ?? searchInputRef.current);
          } else {
            focus(outsideIndex > 0 ? outside[outsideIndex - 1] : searchInputRef.current);
          }
          break;
        case 'first':
          event.preventDefault();
          focusFirstRow(tree);
          break;
        case 'last':
          if (tree?.lastRowId() !== undefined) focusTreeRow(tree.lastRowId());
          else focus(outside.at(-1));
          break;
        case 'expand': {
          event.preventDefault();
          if (!isFolder || !folderId || treeId === null) break;
          if (!isOpen) {
            setFolderExpanded(folderId, true);
            break;
          }
          const child = tree?.rowIdAt(treeId, 1);
          if (child !== undefined && tree?.parentIdOf(child) === treeId) tree.focusRow(child);
          break;
        }
        case 'collapse':
          event.preventDefault();
          if (treeId === null) break;
          if (isFolder && folderId && isOpen) setFolderExpanded(folderId, false);
          else focusTreeRow(tree?.parentIdOf(treeId));
          break;
        case 'activate':
          // Bookmark links open natively.
          if (!isFolder || !folderId) break;
          event.preventDefault();
          // A held Enter repeats keydown; one press saves or toggles once.
          if (event.repeat) break;
          if (row.hasAttribute(POPUP_TREE_CAN_SAVE_ATTRIBUTE)) onSaveToFolder(folderId);
          else if (treeId !== null) setFolderExpanded(folderId, !isOpen);
          break;
        case 'toggle':
          if (!isFolder || !folderId || treeId === null) break;
          event.preventDefault();
          if (!event.repeat) setFolderExpanded(folderId, !isOpen);
          break;
      }
    },
    [onSaveToFolder, searchInputRef, setFolderExpanded, treeRef],
  );
}
