/**
 * Keyboard shortcuts for the popup and side panel.
 *
 * - focusSearch (`SHORTCUT_BINDINGS.popup`, `/` by default) focuses the search box; Escape in
 *   it clears the query, then leaves the box.
 * - ArrowDown in the search box moves into the tree; ArrowUp on the first row moves back.
 *   Alt+ArrowDown opens the recent searches instead.
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
} from 'react';
import { flushSync } from 'react-dom';

/** Marks tree rows: `folder` on folder triggers, `bookmark` on bookmark links. */
export const POPUP_TREE_ROW_ATTRIBUTE = 'data-popup-tree-row';
/** The folder id on a folder row's trigger. */
export const POPUP_TREE_FOLDER_ATTRIBUTE = 'data-folder-trigger';
/** Present on folder rows that can hold bookmarks, where Enter saves the current page. */
export const POPUP_TREE_CAN_SAVE_ATTRIBUTE = 'data-can-save';
const TREE_ROW_SELECTOR = `[${POPUP_TREE_ROW_ATTRIBUTE}]`;

/** Keys the search box handles itself: Escape clears or leaves it, ArrowDown enters the tree. */
export const POPUP_SEARCH_INPUT_BINDINGS = {
  escape: [{ key: 'Escape' }],
  enterTree: [{ key: 'ArrowDown' }],
} as const satisfies Record<string, readonly ShortcutBinding[]>;

/**
 * Opens the recent searches from the empty search box (the combobox pattern's Alt+ArrowDown), so
 * a plain ArrowDown always reaches the tree. Once open, ArrowUp and ArrowDown move through them.
 */
export const POPUP_SEARCH_HISTORY_BINDINGS = {
  open: [{ key: 'ArrowDown', alt: true }],
} as const satisfies Record<string, readonly ShortcutBinding[]>;

/**
 * What the popup's shortcuts tooltip lists, in order. Keys always come from the bindings above
 * (and config/ui/shortcuts.toml), so the tooltip follows any change to them; adding a shortcut
 * means one entry here and one action message.
 */
const POPUP_SHORTCUT_HINTS: readonly {
  bindings: readonly ShortcutBinding[];
  actionKey: MessageKey;
}[] = [
  { bindings: SHORTCUT_BINDINGS.popup.focusSearch, actionKey: 'shortcuts_popupHintSearch' },
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
  { bindings: POPUP_SEARCH_HISTORY_BINDINGS.open, actionKey: 'shortcuts_popupHintRecent' },
];

/** The popup's shortcuts tooltip, with every key printed the way this platform labels it. */
export function popupShortcutsHint(): string {
  const items = POPUP_SHORTCUT_HINTS.map(({ bindings, actionKey }) =>
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
};

/** Page-wide shortcuts: `/` to search, and Escape and ArrowDown inside the search box. */
export function usePopupShortcuts({
  searchInputRef,
  treeRef,
  onClearQuery,
  onApplyQuery,
}: PopupShortcutOptions) {
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
        }
        return;
      }

      if (findShortcut(event, SHORTCUT_BINDINGS.popup) === 'focusSearch') {
        event.preventDefault();
        input.focus();
        input.select();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [searchInputRef, treeRef, onClearQuery, onApplyQuery]);
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
