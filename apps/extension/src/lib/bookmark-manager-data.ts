/**
 * Pure helpers for the bookmark manager page: folder resolution for navigation, folder
 * labels and trees derived from the flattened bookmark list, and breadcrumb paths.
 */

import { endOfDay, startOfDay } from 'date-fns';

/** The subset of a flattened manager row these helpers rely on. */
export type ManagerItem = {
  id: string;
  parentId?: string;
  title: string;
  /** Titles of the ancestors joined with " / ", or the root label for top-level items. */
  folderPath: string;
  type: string;
  index?: number;
  isRootFolder?: boolean;
  /** Top-level folders only: the browser's kind of permanent folder (Chrome and Edge). */
  folderType?: string;
  /** Top-level folders only: stored in the signed-in account (Chrome 134+). */
  syncing?: boolean;
};

const itemsByIdCache = new WeakMap<readonly ManagerItem[], ReadonlyMap<string, ManagerItem>>();

/**
 * The items of a list by ID. Built once per list, so the helpers below that run for the same
 * render (navigation, breadcrumbs, move targets) share one lookup instead of each building one.
 */
export function getManagerItemsById<T extends ManagerItem>(
  items: readonly T[],
): ReadonlyMap<string, T> {
  let byId = itemsByIdCache.get(items);
  if (!byId) {
    byId = new Map(items.map((item) => [item.id, item]));
    itemsByIdCache.set(items, byId);
  }
  return byId as ReadonlyMap<string, T>;
}

export type FolderResolution = {
  /** The folder to show; null is the manager root. */
  folderId: string | null;
  status: 'ok' | 'missing' | 'not-folder';
};

/**
 * Decides which folder to show for a requested ID. Deleted folders fall back to their nearest
 * surviving ancestor (from the previously known parents), non-folders to their parent folder,
 * and anything else to the root.
 */
export function resolveManagerFolder(
  requestedId: string | null,
  items: readonly ManagerItem[],
  rootId: string | undefined,
  previousParentIds: Pick<ReadonlyMap<string, string | undefined>, 'get'> = new Map(),
): FolderResolution {
  if (requestedId === null || requestedId === rootId) return { folderId: null, status: 'ok' };

  const byId = getManagerItemsById(items);
  const isFolder = (id: string | undefined) => byId.get(id ?? '')?.type === ItemTypeEnum.Folder;
  const requested = byId.get(requestedId);
  if (requested?.type === ItemTypeEnum.Folder) return { folderId: requestedId, status: 'ok' };
  if (requested) {
    return {
      folderId: isFolder(requested.parentId) ? (requested.parentId ?? null) : null,
      status: 'not-folder',
    };
  }

  const visited = new Set<string>([requestedId]);
  let ancestorId = previousParentIds.get(requestedId);
  while (ancestorId && !visited.has(ancestorId)) {
    if (isFolder(ancestorId)) return { folderId: ancestorId, status: 'missing' };
    visited.add(ancestorId);
    ancestorId = previousParentIds.get(ancestorId);
  }
  return { folderId: null, status: 'missing' };
}

/** Full path of a folder, e.g. "Bookmarks bar / News / Tech". */
export function getFolderFullPath(folder: ManagerItem, untitledLabel: string): string {
  const title = folder.title.trim() || untitledLabel;
  return folder.isRootFolder ? title : `${folder.folderPath}${FOLDER_PATH_SEPARATOR}${title}`;
}

export type FolderOption = { value: string; label: string };

/** Every folder with its full path; identical paths are disambiguated with the folder ID. */
export function buildFolderOptions(
  items: readonly ManagerItem[],
  untitledLabel: string,
): FolderOption[] {
  const folders = items.filter((item) => item.type === ItemTypeEnum.Folder);
  const labels = folders.map((folder) => getFolderFullPath(folder, untitledLabel));
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  return folders.map((folder, index) => {
    const label = labels[index];
    return {
      value: folder.id,
      label:
        (counts.get(label) ?? 0) > 1
          ? t('bookmarks_folderOptionWithId', [label, folder.id])
          : label,
    };
  });
}

export type ManagerFolderNode = {
  id: string;
  title: string;
  /** The browser's own top-level folders, which never move. */
  isRootFolder: boolean;
  children: ManagerFolderNode[];
};

/** Folder hierarchy in browser order, starting at the permanent top-level folders. */
export function buildManagerFolderTree(items: readonly ManagerItem[]): ManagerFolderNode[] {
  const childrenByParent = new Map<string, ManagerItem[]>();
  for (const item of items) {
    if (item.type !== ItemTypeEnum.Folder || !item.parentId) continue;
    const siblings = childrenByParent.get(item.parentId) ?? [];
    siblings.push(item);
    childrenByParent.set(item.parentId, siblings);
  }
  const toNode = (folder: ManagerItem): ManagerFolderNode => ({
    id: folder.id,
    title: folder.title,
    isRootFolder: Boolean(folder.isRootFolder),
    children: (childrenByParent.get(folder.id) ?? [])
      .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
      .map(toNode),
  });
  return items
    .filter((item) => item.type === ItemTypeEnum.Folder && item.isRootFolder)
    .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
    .map(toNode);
}

/**
 * Where a top-level folder is stored, when Chrome keeps both kinds: in the signed-in account, or
 * only on this device. The ids are Chrome's for its two headings.
 */
export const MANAGER_SECTION_IDS = { account: 'account_heading', local: 'local_heading' } as const;
export type ManagerSection = keyof typeof MANAGER_SECTION_IDS;

export type ManagerFolderSection = {
  /** Null when the browser keeps one kind only, so the tree shows no headings. */
  section: ManagerSection | null;
  folders: ManagerFolderNode[];
};

/**
 * The folder tree split as Chrome's manager splits it: when there is both an account bookmarks
 * bar and one only on this device, the account folders under one heading and the device's under
 * another; otherwise one list without headings.
 */
export function buildManagerFolderSections(items: readonly ManagerItem[]): ManagerFolderSection[] {
  const folders = buildManagerFolderTree(items);
  const byId = getManagerItemsById(items);
  const syncing = (folder: ManagerFolderNode) => byId.get(folder.id)?.syncing === true;
  const bars = folders.filter(
    (folder) => byId.get(folder.id)?.folderType === BOOKMARKS_BAR_FOLDER_TYPE,
  );
  if (!bars.some(syncing) || bars.every(syncing)) return [{ section: null, folders }];
  return [
    { section: 'account', folders: folders.filter(syncing) },
    { section: 'local', folders: folders.filter((folder) => !syncing(folder)) },
  ];
}

/** A row of the manager's folder tree as it shows: the top level, a section heading, or a folder. */
export type ManagerTreeRow = {
  /** A folder id, a `MANAGER_SECTION_IDS` value, or `MANAGER_TREE_ROOT_ID`. */
  id: string;
  kind: 'root' | 'section' | 'folder';
  folder?: ManagerFolderNode;
  section?: ManagerSection;
  /** From 1, as `aria-level` counts. */
  level: number;
  /** Position among its siblings, from 1, and how many there are. */
  posInSet: number;
  setSize: number;
  /** The row it is inside; undefined at the top. */
  parentId: string | undefined;
  hasChildren: boolean;
  expanded: boolean;
};

/** The tree row for the top level ("Bookmarks"), which shows every top-level folder. */
export const MANAGER_TREE_ROOT_ID = 'root';

/** Marks the chevron that opens or closes a folder tree row; a drag hovering a folder clicks it. */
export const FOLDER_TREE_TOGGLE_ATTRIBUTE = 'data-tree-toggle';

/**
 * The rows the folder tree shows, depth first: the top level, then each section heading (when
 * there are sections) or top-level folder, and the children of every expanded row.
 */
export function flattenManagerTree(
  sections: readonly ManagerFolderSection[],
  expanded: ReadonlySet<string>,
): ManagerTreeRow[] {
  const rows: ManagerTreeRow[] = [];
  // Top-level folders sit beside the top-level row, so their positions count it: `before`.
  const visit = (
    folders: readonly ManagerFolderNode[],
    level: number,
    parentId?: string,
    before = 0,
  ) => {
    folders.forEach((folder, index) => {
      const hasChildren = folder.children.length > 0;
      const isOpen = hasChildren && expanded.has(folder.id);
      rows.push({
        id: folder.id,
        kind: 'folder',
        folder,
        level,
        posInSet: before + index + 1,
        setSize: before + folders.length,
        parentId,
        hasChildren,
        expanded: isOpen,
      });
      if (isOpen) visit(folder.children, level + 1, folder.id);
    });
  };
  const headed = sections.filter(
    (entry): entry is ManagerFolderSection & { section: ManagerSection } => entry.section !== null,
  );
  const topCount = 1 + (headed.length > 0 ? headed.length : (sections[0]?.folders.length ?? 0));
  rows.push({
    id: MANAGER_TREE_ROOT_ID,
    kind: 'root',
    level: 1,
    posInSet: 1,
    setSize: topCount,
    parentId: undefined,
    hasChildren: false,
    expanded: false,
  });
  if (headed.length === 0) {
    visit(sections[0]?.folders ?? [], 1, undefined, 1);
    return rows;
  }
  headed.forEach((entry, index) => {
    const { section } = entry;
    const id = MANAGER_SECTION_IDS[section];
    const isOpen = entry.folders.length > 0 && expanded.has(id);
    rows.push({
      id,
      kind: 'section',
      section,
      level: 1,
      posInSet: index + 2,
      setSize: topCount,
      parentId: undefined,
      hasChildren: entry.folders.length > 0,
      expanded: isOpen,
    });
    if (isOpen) visit(entry.folders, 2, id);
  });
  return rows;
}

function hasAncestorIn(
  item: ManagerItem,
  ids: ReadonlySet<string>,
  byId: ReadonlyMap<string, ManagerItem>,
): boolean {
  const visited = new Set<string>();
  let parentId = item.parentId;
  while (parentId && !visited.has(parentId)) {
    if (ids.has(parentId)) return true;
    visited.add(parentId);
    parentId = byId.get(parentId)?.parentId;
  }
  return false;
}

/** Drops selected items that sit inside another selected folder; the folder carries them. */
export function pruneNestedSelection<T extends ManagerItem>(
  selected: readonly T[],
  items: readonly ManagerItem[],
): T[] {
  const byId = getManagerItemsById(items);
  const ids = new Set(selected.map((item) => item.id));
  return selected.filter((item) => !hasAncestorIn(item, ids, byId));
}

/**
 * Splits a selection into the rows the current filters show and a count of rows they hide.
 * Bulk actions act only on the visible part, so a filter can never hide what gets deleted.
 */
export function partitionSelectionByVisibility<T>(
  selected: readonly T[],
  visibleIds: ReadonlySet<string>,
  getId: (row: T) => string,
): { visible: T[]; hiddenCount: number } {
  const visible = selected.filter((row) => visibleIds.has(getId(row)));
  return { visible, hiddenCount: selected.length - visible.length };
}

/**
 * Columns to hide for lack of room at a table width (for example with the Tools sidebar open):
 * registry columns whose `hideBelowWidth` exceeds it. None until the width is known.
 */
export function getSpaceHiddenColumnIds(tableWidth: number | undefined): string[] {
  if (tableWidth === undefined) return [];
  return BOOKMARK_COLUMNS.filter(
    (column) => column.hideBelowWidth !== undefined && tableWidth < column.hideBelowWidth,
  ).map((column) => column.id);
}

export type FolderMoveDirection = 'up' | 'down' | 'top' | 'bottom';

/** Whether a reorder would change anything: the first item cannot go up, the last not down. */
export function canMoveWithinFolder(
  direction: FolderMoveDirection,
  index: number,
  siblingCount: number,
): boolean {
  return direction === 'up' || direction === 'top' ? index > 0 : index < siblingCount - 1;
}

/**
 * Folders that can receive the selection: not a selected folder or anything inside one, and not
 * the folder every selected item is already in (moving there would change nothing).
 */
export function getMoveTargetFolders(
  selected: readonly ManagerItem[],
  items: readonly ManagerItem[],
): ManagerItem[] {
  const byId = getManagerItemsById(items);
  const ids = new Set(selected.map((item) => item.id));
  const parentIds = new Set(selected.map((item) => item.parentId));
  const sharedParentId = parentIds.size === 1 ? [...parentIds][0] : undefined;
  return items.filter(
    (item) =>
      item.type === ItemTypeEnum.Folder &&
      item.id !== sharedParentId &&
      !ids.has(item.id) &&
      !hasAncestorIn(item, ids, byId),
  );
}

/** Folders from the top level down to (and including) the given folder. */
export function getManagerFolderAncestors(
  items: readonly ManagerItem[],
  folderId: string | null,
): ManagerItem[] {
  const byId = getManagerItemsById(items);
  const path: ManagerItem[] = [];
  const visited = new Set<string>();
  let current = folderId ? byId.get(folderId) : undefined;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

/**
 * A folder path shortened to at most `maxFolders` shown folders: the first, then the ones in
 * between `hidden` (for a "…" menu), then the last ones, the open folder included. A path that
 * fits is all `head`.
 */
export function collapseFolderPath<T>(
  path: readonly T[],
  maxFolders: number,
): { head: T[]; hidden: T[]; tail: T[] } {
  if (path.length <= maxFolders) return { head: [...path], hidden: [], tail: [] };
  const tailLength = Math.max(1, maxFolders - 1);
  return {
    head: path.slice(0, 1),
    hidden: path.slice(1, path.length - tailLength),
    tail: path.slice(path.length - tailLength),
  };
}

/**
 * The URLs to open for `rows`, as Chrome's manager does: a bookmark's own, and for a folder the
 * bookmarks directly inside it, in folder order. Bookmarklets are left out.
 */
export function getOpenableUrls(
  rows: readonly (ManagerItem & { url?: string })[],
  items: readonly (ManagerItem & { url?: string })[],
): string[] {
  const openable = (item: ManagerItem & { url?: string }) =>
    item.type === ItemTypeEnum.Link && Boolean(item.url) && !isScriptUrl(item.url);
  return rows.flatMap((row) => {
    if (row.type !== ItemTypeEnum.Folder) return openable(row) ? [row.url as string] : [];
    return items
      .filter((item) => item.parentId === row.id && openable(item))
      .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
      .map((item) => item.url as string);
  });
}

/** Date range filter for epoch-millisecond values that includes the whole start and end days. */
export function isWithinDateRange(
  value: unknown,
  range: { from?: Date; to?: Date } | undefined,
): boolean {
  if (!range?.from && !range?.to) return true;
  if (typeof value !== 'number') return false;
  if (range.from && value < startOfDay(range.from).getTime()) return false;
  if (range.to && value > endOfDay(range.to).getTime()) return false;
  return true;
}
