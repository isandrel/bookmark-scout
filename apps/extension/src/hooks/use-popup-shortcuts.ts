/**
 * Keyboard shortcuts for the popup and side panel.
 *
 * - focusSearch (`SHORTCUT_BINDINGS.popup`, `/` by default) focuses the search box; Escape in
 *   it clears the query, then leaves the box.
 * - ArrowDown in the search box moves into the tree; ArrowUp on the first row moves back.
 * - In the tree, ArrowUp/ArrowDown/Home/End move between visible folders and bookmarks,
 *   ArrowRight opens a folder (or enters it), ArrowLeft closes it (or goes to its parent), and
 *   Enter on a folder saves the current page into it. Enter on a bookmark opens it natively.
 */

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
} from 'react';

/** Marks tree rows: `folder` on folder triggers, `bookmark` on bookmark links. */
export const POPUP_TREE_ROW_ATTRIBUTE = 'data-popup-tree-row';
/** The folder id on a folder row's trigger. */
export const POPUP_TREE_FOLDER_ATTRIBUTE = 'data-folder-trigger';
/** Present on folder rows that can hold bookmarks, where Enter saves the current page. */
export const POPUP_TREE_CAN_SAVE_ATTRIBUTE = 'data-can-save';
const TREE_ROW_SELECTOR = `[${POPUP_TREE_ROW_ATTRIBUTE}]`;

/** Tree navigation keys (the standard tree pattern), exported so hints can name them. */
export const POPUP_TREE_BINDINGS = {
  next: [{ key: 'ArrowDown' }],
  previous: [{ key: 'ArrowUp' }],
  first: [{ key: 'Home' }],
  last: [{ key: 'End' }],
  expand: [{ key: 'ArrowRight' }],
  collapse: [{ key: 'ArrowLeft' }],
  activate: [{ key: 'Enter' }],
} as const satisfies Record<string, readonly ShortcutBinding[]>;

/** Keys the search box handles itself: Escape clears or leaves it, ArrowDown enters the tree. */
export const POPUP_SEARCH_INPUT_BINDINGS = {
  escape: [{ key: 'Escape' }],
  enterTree: [{ key: 'ArrowDown' }],
} as const satisfies Record<string, readonly ShortcutBinding[]>;

/** Closing folders keep their content mounted while they animate; those rows are not visible. */
function isInsideClosedFolder(row: HTMLElement): boolean {
  for (let element = row.parentElement; element; element = element.parentElement) {
    if (element.getAttribute('role') === 'region' && element.dataset.state === 'closed') {
      return true;
    }
  }
  return false;
}

function getVisibleTreeRows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(TREE_ROW_SELECTOR)).filter(
    (row) => !isInsideClosedFolder(row),
  );
}

/** A row's folder is the accordion region it sits in, labelled by that folder's trigger. */
function getParentFolderRow(row: HTMLElement): HTMLElement | null {
  const region = row.parentElement?.closest<HTMLElement>('[role="region"]');
  const triggerId = region?.getAttribute('aria-labelledby');
  return triggerId ? document.getElementById(triggerId) : null;
}

type PopupShortcutOptions = {
  searchInputRef: RefObject<HTMLInputElement | null>;
  onClearQuery: () => void;
};

/** Page-wide shortcuts: `/` to search, and Escape and ArrowDown inside the search box. */
export function usePopupShortcuts({ searchInputRef, onClearQuery }: PopupShortcutOptions) {
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
          const [firstRow] = getVisibleTreeRows();
          if (!firstRow) return;
          event.preventDefault();
          firstRow.focus();
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
  }, [searchInputRef, onClearQuery]);
}

type PopupTreeKeyOptions = {
  searchInputRef: RefObject<HTMLInputElement | null>;
  setFolderExpanded: (folderId: string, expanded: boolean) => void;
  /** Saves the current page into the folder; only called for folders marked `data-can-save`. */
  onSaveToFolder: (folderId: string) => void;
};

/**
 * Key handler for the tree's accordion root. Base UI's accordion has no arrow-key navigation of its
 * own, so this provides it, reaching bookmarks too, not only folders.
 */
export function usePopupTreeKeys({
  searchInputRef,
  setFolderExpanded,
  onSaveToFolder,
}: PopupTreeKeyOptions) {
  return useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      const row = event.target as HTMLElement;
      // Only rows navigate; action buttons and the new-folder input keep their own keys.
      if (!row.hasAttribute?.(POPUP_TREE_ROW_ATTRIBUTE)) return;
      const action = findShortcut(event.nativeEvent, POPUP_TREE_BINDINGS);
      if (!action) return;

      const isFolder = row.getAttribute(POPUP_TREE_ROW_ATTRIBUTE) === 'folder';
      const folderId = row.getAttribute(POPUP_TREE_FOLDER_ATTRIBUTE);
      const isOpen = row.getAttribute('aria-expanded') === 'true';
      const rows = getVisibleTreeRows();
      const index = rows.indexOf(row);
      const focusRow = (target: HTMLElement | null | undefined) => {
        event.preventDefault();
        target?.focus();
      };

      switch (action) {
        case 'next':
          focusRow(rows[index + 1]);
          break;
        case 'previous':
          focusRow(index > 0 ? rows[index - 1] : searchInputRef.current);
          break;
        case 'first':
          focusRow(rows[0]);
          break;
        case 'last':
          focusRow(rows.at(-1));
          break;
        case 'expand':
          event.preventDefault();
          if (!isFolder || !folderId) break;
          if (!isOpen) {
            setFolderExpanded(folderId, true);
          } else {
            const child = rows[index + 1];
            if (child && getParentFolderRow(child) === row) child.focus();
          }
          break;
        case 'collapse':
          event.preventDefault();
          if (isFolder && folderId && isOpen) {
            setFolderExpanded(folderId, false);
          } else {
            getParentFolderRow(row)?.focus();
          }
          break;
        case 'activate':
          // Folders that cannot hold bookmarks keep Enter's native toggle; bookmark links open.
          if (!isFolder || !folderId || !row.hasAttribute(POPUP_TREE_CAN_SAVE_ATTRIBUTE)) break;
          event.preventDefault();
          // A held Enter repeats keydown; one press saves once.
          if (!event.repeat) onSaveToFolder(folderId);
          break;
      }
    },
    [onSaveToFolder, searchInputRef, setFolderExpanded],
  );
}
