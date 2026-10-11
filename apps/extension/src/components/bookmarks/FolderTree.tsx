/**
 * FolderTree - the manager's folder tree, an ARIA tree after Chrome's (`folder_node.ts`).
 * Built from the manager's bookmark list, so it follows every refresh (edits, deletes, and
 * changes made outside the page).
 *
 * - When Chrome keeps bookmarks both in the account and only on this device, the folders sit
 *   under two headings, the device's closed at first, as in Chrome.
 * - One tab stop (roving tabindex). Up and Down move between visible rows, Home and End to the
 *   first and last; Right opens a folder or moves into it, Left closes it or moves to its parent;
 *   Enter or Space opens the folder in the table (a heading opens or closes).
 */

import { ChevronDown, ChevronRight, Folder } from 'lucide-react';
import { type KeyboardEvent, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

type FolderTreeProps = {
  items: Bookmark[];
  selectedFolderId: string | null;
  onFolderSelect: (folderId: string | null) => void;
};

const SECTION_LABELS: Record<ManagerSection, MessageKey> = {
  account: 'bookmarks_accountSection',
  local: 'bookmarks_localSection',
};

/** Marks a row with its tree row id. */
const ROW_ID_ATTRIBUTE = 'data-tree-row-id';

function rowLabel(row: ManagerTreeRow): string {
  if (row.kind === 'root') return t('bookmarks_root');
  if (row.kind === 'section' && row.section) return t(SECTION_LABELS[row.section]);
  return getBookmarkDisplayTitle(row.folder?.title ?? '');
}

type TreeRowProps = {
  row: ManagerTreeRow;
  isSelected: boolean;
  isTabStop: boolean;
  onActivate: (row: ManagerTreeRow) => void;
  onToggle: (id: string) => void;
};

function TreeRow({ row, isSelected, isTabStop, onActivate, onToggle }: TreeRowProps) {
  const isSection = row.kind === 'section';
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the tree's key handler moves, opens, and closes rows (handleKeyDown).
    <div
      role="treeitem"
      {...{ [ROW_ID_ATTRIBUTE]: row.id }}
      {...(row.kind === 'folder' ? { 'data-folder-id': row.id } : {})}
      // The browser's own top-level folders never move; others drag onto the table or folders.
      draggable={row.kind === 'folder' && !row.folder?.isRootFolder}
      aria-level={row.level}
      aria-posinset={row.posInSet}
      aria-setsize={row.setSize}
      aria-expanded={row.hasChildren ? row.expanded : undefined}
      aria-selected={isSection ? undefined : isSelected}
      tabIndex={isTabStop ? 0 : -1}
      onClick={() => onActivate(row)}
      className={cn(
        'flex h-8 w-full cursor-default items-center gap-1 rounded-md pr-2 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        isSelected
          ? 'bg-accent font-medium text-accent-foreground'
          : isSection
            ? 'font-medium text-muted-foreground hover:bg-muted'
            : 'text-foreground hover:bg-muted',
      )}
      style={{ paddingLeft: `${(row.level - 1) * 12 + 8}px` }}
    >
      {row.hasChildren ? (
        // Mouse only: the keyboard opens and closes rows with the arrow keys.
        // biome-ignore lint/a11y/useKeyWithClickEvents: see above.
        // biome-ignore lint/a11y/noStaticElementInteractions: see above.
        <span
          aria-hidden="true"
          {...{ [FOLDER_TREE_TOGGLE_ATTRIBUTE]: '' }}
          onClick={(event) => {
            event.stopPropagation();
            onToggle(row.id);
          }}
          className="rounded-sm p-0.5 text-muted-foreground hover:bg-card hover:text-foreground"
        >
          {row.expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </span>
      ) : (
        <span className="w-[18px] shrink-0" />
      )}
      {!isSection && (
        <Folder
          aria-hidden="true"
          className={cn('h-4 w-4 shrink-0', isSelected ? 'text-primary' : 'text-muted-foreground')}
        />
      )}
      <span className="ml-0.5 truncate">{rowLabel(row)}</span>
    </div>
  );
}

// Memoized: the page re-renders on every keystroke of the title search (it is in the address).
// A memoized component skips the page's language re-render, so it follows the language itself.
export const FolderTree = memo(function FolderTree({
  items,
  selectedFolderId,
  onFolderSelect,
}: FolderTreeProps) {
  useLanguageRevision();
  const sections = useMemo(() => buildManagerFolderSections(items), [items]);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set());
  const hasAutoExpandedRef = useRef(false);

  // Expand the top-level folders and the account heading once, when the tree first loads; the
  // heading of the folders only on this device stays closed, as in Chrome.
  useEffect(() => {
    const topLevel = sections.flatMap((entry) => entry.folders);
    if (hasAutoExpandedRef.current || topLevel.length === 0) return;
    hasAutoExpandedRef.current = true;
    const headings = sections.some((entry) => entry.section === 'account')
      ? [MANAGER_SECTION_IDS.account]
      : [];
    setExpandedIds((prev) => new Set([...prev, ...headings, ...topLevel.map(({ id }) => id)]));
  }, [sections]);

  // Reveal the selected folder and its subfolders by expanding it, its ancestors, and its heading.
  useEffect(() => {
    if (!selectedFolderId) return;
    const ancestors = getManagerFolderAncestors(items, selectedFolderId).map(({ id }) => id);
    if (ancestors.length === 0) return;
    const section = sections.find((entry) =>
      entry.folders.some((folder) => folder.id === ancestors[0]),
    )?.section;
    const ids = section ? [MANAGER_SECTION_IDS[section], ...ancestors] : ancestors;
    setExpandedIds((prev) => (ids.every((id) => prev.has(id)) ? prev : new Set([...prev, ...ids])));
  }, [items, sections, selectedFolderId]);

  const rows = useMemo(() => flattenManagerTree(sections, expandedIds), [sections, expandedIds]);
  const selectedRowId = selectedFolderId ?? MANAGER_TREE_ROOT_ID;
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const has = (id: string | null) => id !== null && rows.some((row) => row.id === id);
  // The one row Tab reaches: the last focused, else the open folder, else the top level.
  const tabStopId = has(focusedId)
    ? focusedId
    : has(selectedRowId)
      ? selectedRowId
      : MANAGER_TREE_ROOT_ID;

  const containerRef = useRef<HTMLDivElement>(null);
  // A row to focus once it renders (the first child appears only after its folder opens).
  const pendingFocusRef = useRef<string | null>(null);
  useEffect(() => {
    const id = pendingFocusRef.current;
    if (id === null) return;
    const element = containerRef.current?.querySelector<HTMLElement>(
      `[${ROW_ID_ATTRIBUTE}="${CSS.escape(id)}"]`,
    );
    if (!element) return;
    pendingFocusRef.current = null;
    element.focus();
  });
  const focusRow = (id: string | undefined) => {
    if (id === undefined) return;
    pendingFocusRef.current = id;
    setFocusedId(id);
  };

  const setExpanded = useCallback((id: string, open: boolean) => {
    setExpandedIds((prev) => {
      if (prev.has(id) === open) return prev;
      const next = new Set(prev);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const toggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  const activate = useCallback(
    (row: ManagerTreeRow) => {
      setFocusedId(row.id);
      if (row.kind === 'section') toggle(row.id);
      else onFolderSelect(row.kind === 'root' ? null : row.id);
    },
    [onFolderSelect, toggle],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const element = (event.target as Element).closest?.<HTMLElement>(`[${ROW_ID_ATTRIBUTE}]`);
    const index = rows.findIndex((row) => row.id === element?.getAttribute(ROW_ID_ATTRIBUTE));
    const row = rows[index];
    if (!row) return;
    const action = findShortcut(event.nativeEvent, TREE_KEY_BINDINGS);
    if (!action) return;
    switch (action) {
      case 'next':
        focusRow(rows[index + 1]?.id);
        break;
      case 'previous':
        focusRow(rows[index - 1]?.id);
        break;
      case 'first':
        focusRow(rows[0]?.id);
        break;
      case 'last':
        focusRow(rows.at(-1)?.id);
        break;
      case 'expand':
        if (row.hasChildren && !row.expanded) setExpanded(row.id, true);
        else if (row.expanded) focusRow(rows[index + 1]?.id);
        break;
      case 'collapse':
        if (row.expanded) setExpanded(row.id, false);
        else focusRow(row.parentId);
        break;
      case 'activate':
      case 'toggle':
        // A held key repeats keydown; one press opens the folder once.
        if (!event.repeat) activate(row);
        break;
    }
    event.preventDefault();
    // Handled here, so the page's document-level shortcuts do not act on the same key.
    event.stopPropagation();
  };

  return (
    <div
      ref={containerRef}
      role="tree"
      aria-label={t('bookmarks_folderTree')}
      className="p-2"
      data-testid="folder-tree"
      onKeyDown={handleKeyDown}
    >
      {rows.map((row) => (
        <TreeRow
          key={row.id}
          row={row}
          isSelected={row.kind !== 'section' && row.id === selectedRowId}
          isTabStop={row.id === tabStopId}
          onActivate={activate}
          onToggle={toggle}
        />
      ))}
    </div>
  );
});
