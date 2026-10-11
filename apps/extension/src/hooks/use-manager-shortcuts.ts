/**
 * Keyboard shortcuts for the bookmark manager page, bound in config/ui/shortcuts.toml
 * (`SHORTCUT_BINDINGS.manager`), with Chrome's manager as the model:
 *
 * - focusFilter focuses the title filter; showHelp opens the shortcuts help; openSavedSearches
 *   opens the saved searches menu; parentFolder goes to the parent folder.
 * - nextRow / previousRow move to the next / previous row and select it, like the arrow keys
 *   (the arrow keys, Home, End, and Space are handled by the table's rows).
 * - selectAll, clearSelection, undo, and redo work anywhere but a text field.
 * - delete, rename, open, openInNewTabs, and openInNewWindow act on the selected rows, or the
 *   focused row when none is selected, and only while a row (or nothing) has focus, so Enter on
 *   a button still presses it.
 *
 * Keys are ignored while typing, during IME composition, and while a dialog or menu is open. Ctrl
 * (Cmd) combinations match only the bindings marked `mod`.
 */

import { type RefObject, useEffect, useRef, useState } from 'react';

/** Grid rows take focus themselves (roving tabindex). */
export function getTableRowFocusTarget(row: HTMLElement): HTMLElement | null {
  return row.hasAttribute('tabindex') ? row : null;
}

function focusTitleFilter(): boolean {
  const label = CSS.escape(t('table_filterTitles'));
  const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
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

/** Whether the key was pressed on a table row or with nothing focused. */
function isRowOrPageTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  return target === document.body || target.matches('tr[data-row-id]');
}

/** What the row shortcuts do; the page owns dialogs, deletion, and opening. */
export type ManagerRowCommands = {
  deleteRows: (rows: Bookmark[]) => void;
  renameRow: (row: Bookmark) => void;
  openRows: (rows: Bookmark[], target: BookmarkOpenTarget) => void;
  undo: () => void;
  redo: () => void;
};

export type ManagerShortcutOptions = {
  currentFolderId: string | null;
  items: readonly Bookmark[];
  onNavigate: (folderId: string | null) => void;
  table: RefObject<DataTableHandle<Bookmark> | null>;
  commands: ManagerRowCommands;
  /** Ctrl/Cmd+C, X, and V on the rows, through the browser's clipboard events. */
  clipboard: {
    copyOrCut: (event: ClipboardEvent, rows: Bookmark[]) => void;
    paste: (event: ClipboardEvent, rows: Bookmark[]) => void;
  };
};

const ROW_ACTIONS = new Set(['delete', 'rename', 'open', 'openInNewTabs', 'openInNewWindow']);

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
          case 'selectAll':
            table.current?.selectAll();
            return Boolean(table.current);
          case 'clearSelection':
            return table.current?.clearSelection() ?? false;
          case 'delete': {
            const targets = rows().filter(isModifiableBookmark);
            if (targets.length === 0) return false;
            commands.deleteRows(targets);
            return true;
          }
          case 'rename': {
            const targets = rows();
            if (targets.length !== 1 || !isModifiableBookmark(targets[0])) return false;
            commands.renameRow(targets[0]);
            return true;
          }
          case 'open':
          case 'openInNewTabs':
          case 'openInNewWindow': {
            const targets = rows();
            if (targets.length === 0) return false;
            const target = (
              {
                open: 'tabs',
                openInNewTabs: 'background-tabs',
                openInNewWindow: 'window',
              } as const
            )[action];
            commands.openRows(targets, target);
            return true;
          }
          case 'undo':
            commands.undo();
            return true;
          case 'redo':
            commands.redo();
            return true;
        }
      })();
      if (handled) event.preventDefault();
    };

    const handleClipboard = (event: ClipboardEvent) => {
      if (event.defaultPrevented || isTypingTarget(event.target) || hasOpenOverlay()) return;
      // Text selected in the page copies as text.
      if (event.type !== 'paste' && (window.getSelection()?.toString() ?? '') !== '') return;
      const { table, clipboard } = latest.current;
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

  return { helpOpen, setHelpOpen };
}
