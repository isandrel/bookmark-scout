/**
 * Keyboard shortcuts for the bookmark manager page, bound in config/ui/shortcuts.toml
 * (`SHORTCUT_BINDINGS.manager`), with Chrome's manager as the model:
 *
 * - focusFilter focuses the title filter; showHelp opens the shortcuts help; openSavedSearches
 *   opens the saved searches menu; parentFolder goes to the parent folder.
 * - nextRow / previousRow move to the next / previous row and select it, like the arrow keys
 *   (the arrow keys, Home, End, and Space are handled by the table's rows).
 * - selectAll, clearSelection, undo, and redo work anywhere but a text field.
 * - preview opens the preview of the focused (or the one selected) bookmark, in either view.
 * - delete, rename, open, openInNewTabs, and openInNewWindow act on the selected rows, or the
 *   focused row when none is selected, and only while a row (or nothing) has focus, so Enter on
 *   a button still presses it. A focused folder in the tree answers them too, for that folder
 *   (`handleTreeFolderKey`), and so do Ctrl/Cmd+C, X, and V (paste goes into the folder).
 *
 * Keys are ignored while typing, during IME composition, and while a dialog or menu is open. Ctrl
 * (Cmd) combinations match only the bindings marked `mod`.
 */

import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';

/** Grid rows take focus themselves (roving tabindex). */
export function getTableRowFocusTarget(row: HTMLElement): HTMLElement | null {
  return row.hasAttribute('tabindex') ? row : null;
}

function focusTitleFilter(): boolean {
  const input = document.querySelector<HTMLInputElement>(`input[${MANAGER_SEARCH_ATTRIBUTE}]`);
  if (!input) return false;
  input.focus();
  input.select();
  return true;
}

function openSavedSearches(): boolean {
  const trigger = document.querySelector<HTMLElement>(`[${SAVED_SEARCHES_TRIGGER_ATTRIBUTE}]`);
  if (!trigger) return false;
  trigger.click();
  return true;
}

/**
 * Whether the key was pressed on a row (a table row or a card), the grid's frame, or with nothing
 * focused.
 */
function isRowOrPageTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  return (
    target === document.body ||
    target.matches('[data-row-id]') ||
    target.hasAttribute(GRID_FRAME_ATTRIBUTE)
  );
}

/** The row shortcuts a focused folder in the tree answers too, after Chrome's tree. */
const TREE_FOLDER_BINDINGS = {
  delete: SHORTCUT_BINDINGS.manager.delete,
  rename: SHORTCUT_BINDINGS.manager.rename,
  open: SHORTCUT_BINDINGS.manager.open,
  openInNewTabs: SHORTCUT_BINDINGS.manager.openInNewTabs,
  openInNewWindow: SHORTCUT_BINDINGS.manager.openInNewWindow,
};
type TreeFolderAction = keyof typeof TREE_FOLDER_BINDINGS;

/** What the row shortcuts do; the page owns dialogs, deletion, and opening. */
export type ManagerRowCommands = {
  deleteRows: (rows: Bookmark[]) => void;
  renameRow: (row: Bookmark) => void;
  openRows: (rows: Bookmark[], target: BookmarkOpenTarget) => void;
  /** Opens the preview of the one bookmark in `rows`; false when it has none to show. */
  previewRows: (rows: Bookmark[]) => boolean;
  /** `repeat`: the key is held down (a repeated keydown). */
  undo: (repeat?: boolean) => void;
  redo: (repeat?: boolean) => void;
};

export type ManagerShortcutOptions = {
  currentFolderId: string | null;
  items: readonly Bookmark[];
  onNavigate: (folderId: string | null) => void;
  table: RefObject<DataTableHandle<Bookmark> | null>;
  commands: ManagerRowCommands;
  /** The folder of the tree row an event comes from, if it comes from one. */
  treeFolderAt: (target: EventTarget | null) => Bookmark | undefined;
  /**
   * Ctrl/Cmd+C, X, and V on the rows, or on a folder in the tree, through the browser's
   * clipboard events.
   */
  clipboard: {
    copyOrCut: (event: ClipboardEvent, rows: Bookmark[]) => void;
    paste: (event: ClipboardEvent, rows: Bookmark[]) => void;
    pasteInto: (event: ClipboardEvent, folder: Bookmark) => void;
  };
};

/** Shortcuts that act on rows, so only while a row (or nothing) has focus. */
const ROW_ACTIONS = new Set<string>([...Object.keys(TREE_FOLDER_BINDINGS), 'preview']);

/** Runs a row command on `targets`; false when it does not apply to them. */
function runRowCommand(
  action: TreeFolderAction,
  targets: Bookmark[],
  commands: ManagerRowCommands,
): boolean {
  switch (action) {
    case 'delete': {
      const deletable = targets.filter(isModifiableBookmark);
      if (deletable.length === 0) return false;
      commands.deleteRows(deletable);
      return true;
    }
    case 'rename': {
      if (targets.length !== 1 || !isModifiableBookmark(targets[0])) return false;
      commands.renameRow(targets[0]);
      return true;
    }
    case 'open':
    case 'openInNewTabs':
    case 'openInNewWindow': {
      if (targets.length === 0) return false;
      const target = (
        { open: 'tabs', openInNewTabs: 'background-tabs', openInNewWindow: 'window' } as const
      )[action];
      commands.openRows(targets, target);
      return true;
    }
  }
}

export function useManagerShortcuts(options: ManagerShortcutOptions) {
  const [helpOpen, setHelpOpen] = useState(false);
  // The listener is registered once and reads the latest state from here.
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const action = findShortcut(event, SHORTCUT_BINDINGS.manager, { allowModifiers: true });
      if (!action) return;
      if (ROW_ACTIONS.has(action) && !isRowOrPageTarget(event.target)) return;
      const { currentFolderId, items, onNavigate, table, commands } = latest.current;
      const rows = () => table.current?.getCommandRows() ?? [];
      const handled = (() => {
        switch (action) {
          case 'focusFilter':
            return focusTitleFilter();
          case 'showHelp':
            setHelpOpen(true);
            return true;
          case 'parentFolder': {
            if (!currentFolderId) return false;
            // The path ends with the current folder; top-level folders go back to the root view.
            const path = getManagerFolderAncestors(items, currentFolderId);
            onNavigate(path.at(-2)?.id ?? null);
            return true;
          }
          case 'nextRow':
          case 'previousRow':
            return table.current?.moveFocus(action === 'nextRow' ? 1 : -1) ?? false;
          case 'openSavedSearches':
            return openSavedSearches();
          case 'preview':
            return commands.previewRows(rows());
          case 'selectAll':
            table.current?.selectAll();
            return Boolean(table.current);
          case 'clearSelection':
            return table.current?.clearSelection() ?? false;
          case 'delete':
          case 'rename':
          case 'open':
          case 'openInNewTabs':
          case 'openInNewWindow':
            return runRowCommand(action, rows(), commands);
          case 'undo':
            commands.undo(event.repeat);
            return true;
          case 'redo':
            commands.redo(event.repeat);
            return true;
        }
      })();
      if (handled) event.preventDefault();
    };

    const handleClipboard = (event: ClipboardEvent) => {
      if (event.defaultPrevented || isTypingTarget(event.target) || hasOpenOverlay()) return;
      // Text selected in the page copies as text.
      if (event.type !== 'paste' && (window.getSelection()?.toString() ?? '') !== '') return;
      const { table, clipboard, treeFolderAt } = latest.current;
      // On a folder in the tree: copy or cut that folder, or paste into it.
      const folder = treeFolderAt(event.target);
      if (folder) {
        if (event.type === 'paste') clipboard.pasteInto(event, folder);
        else clipboard.copyOrCut(event, [folder]);
        return;
      }
      const rows = table.current?.getCommandRows() ?? [];
      if (event.type === 'paste') clipboard.paste(event, rows);
      else clipboard.copyOrCut(event, rows);
    };

    document.addEventListener('keydown', handleKeyDown);
    for (const type of ['copy', 'cut', 'paste'] as const) {
      document.addEventListener(type, handleClipboard);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      for (const type of ['copy', 'cut', 'paste'] as const) {
        document.removeEventListener(type, handleClipboard);
      }
    };
  }, []);

  /**
   * Delete, rename, and open on a focused folder in the tree (`FolderTree`'s `onFolderKey`).
   * True when the key ran a command, so the tree leaves it alone.
   */
  const handleTreeFolderKey = useCallback((event: KeyboardEvent, folderId: string): boolean => {
    const action = findShortcut(event, TREE_FOLDER_BINDINGS, { allowModifiers: true });
    if (!action) return false;
    const { items, commands } = latest.current;
    const folder = getManagerItemsById(items).get(folderId);
    return folder ? runRowCommand(action, [folder], commands) : false;
  }, []);

  return { helpOpen, setHelpOpen, handleTreeFolderKey };
}
