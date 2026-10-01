/**
 * Keyboard shortcuts for the bookmark manager page.
 *
 * - `/` focuses the title filter.
 * - `?` opens the keyboard shortcuts help dialog.
 * - Alt+ArrowUp or Backspace goes to the parent folder.
 * - `j` / `k` move focus to the next / previous table row (folder rows, or a bookmark row's
 *   actions menu); Enter on a folder row opens it, as before.
 *
 * Keys are ignored while typing, during IME composition, with Ctrl or Cmd held, and while a
 * dialog or menu is open.
 */

import { useEffect, useRef, useState } from 'react';

export const MANAGER_SHORTCUT_BINDINGS = {
  focusFilter: [{ key: '/' }],
  showHelp: [{ key: '?' }],
  parentFolder: [{ key: 'ArrowUp', alt: true }, { key: 'Backspace' }],
  nextRow: [{ key: 'j' }],
  previousRow: [{ key: 'k' }],
} as const satisfies Record<string, readonly ShortcutBinding[]>;

const TABLE_ROW_SELECTOR = 'main table tbody tr';

/** Folder rows take focus themselves; bookmark rows offer their actions menu. */
function getRowFocusTarget(row: HTMLElement): HTMLElement | null {
  if (row.tabIndex >= 0) return row;
  return (
    row.querySelector<HTMLElement>('button[aria-haspopup="menu"]:not([disabled])') ??
    row.querySelector<HTMLElement>('button:not([disabled]), a[href], [tabindex="0"]')
  );
}

function moveRowFocus(step: 1 | -1): boolean {
  const rows = Array.from(document.querySelectorAll<HTMLElement>(TABLE_ROW_SELECTOR)).filter(
    (row) => getRowFocusTarget(row) !== null,
  );
  if (rows.length === 0) return false;
  const active = document.activeElement;
  const current = rows.findIndex((row) => row === active || row.contains(active));
  const next =
    current < 0
      ? step === 1
        ? 0
        : rows.length - 1
      : Math.min(rows.length - 1, Math.max(0, current + step));
  getRowFocusTarget(rows[next])?.focus();
  return true;
}

function focusTitleFilter(): boolean {
  const label = CSS.escape(t('table_filterTitles'));
  const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!input) return false;
  input.focus();
  input.select();
  return true;
}

export type ManagerShortcutOptions = {
  currentFolderId: string | null;
  items: readonly Bookmark[];
  onNavigate: (folderId: string | null) => void;
};

export function useManagerShortcuts({
  currentFolderId,
  items,
  onNavigate,
}: ManagerShortcutOptions) {
  const [helpOpen, setHelpOpen] = useState(false);
  // The listener is registered once and reads the latest folder state from here.
  const latest = useRef({ currentFolderId, items, onNavigate });
  latest.current = { currentFolderId, items, onNavigate };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const action = findShortcut(event, MANAGER_SHORTCUT_BINDINGS);
      if (!action) return;

      switch (action) {
        case 'focusFilter':
          if (focusTitleFilter()) event.preventDefault();
          break;
        case 'showHelp':
          event.preventDefault();
          setHelpOpen(true);
          break;
        case 'parentFolder': {
          const {
            currentFolderId: folderId,
            items: allItems,
            onNavigate: navigate,
          } = latest.current;
          if (!folderId) return;
          event.preventDefault();
          // The path ends with the current folder; top-level folders go back to the root view.
          const path = getManagerFolderAncestors(allItems, folderId);
          navigate(path.at(-2)?.id ?? null);
          break;
        }
        case 'nextRow':
        case 'previousRow':
          if (moveRowFocus(action === 'nextRow' ? 1 : -1)) event.preventDefault();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return { helpOpen, setHelpOpen };
}
