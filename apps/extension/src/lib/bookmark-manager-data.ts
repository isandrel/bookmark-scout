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
};

const FOLDER_TYPE = 'folder';

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
  previousParentIds: ReadonlyMap<string, string | undefined> = new Map(),
): FolderResolution {
  if (requestedId === null || requestedId === rootId) return { folderId: null, status: 'ok' };

  const byId = new Map(items.map((item) => [item.id, item]));
  const isFolder = (id: string | undefined) => byId.get(id ?? '')?.type === FOLDER_TYPE;
  const requested = byId.get(requestedId);
  if (requested?.type === FOLDER_TYPE) return { folderId: requestedId, status: 'ok' };
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
  return folder.isRootFolder ? title : `${folder.folderPath} / ${title}`;
}

export type FolderOption = { value: string; label: string };

/** Every folder with its full path; identical paths are disambiguated with the folder ID. */
export function buildFolderOptions(
  items: readonly ManagerItem[],
  untitledLabel: string,
): FolderOption[] {
  const folders = items.filter((item) => item.type === FOLDER_TYPE);
  const labels = folders.map((folder) => getFolderFullPath(folder, untitledLabel));
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  return folders.map((folder, index) => {
    const label = labels[index];
    return {
      value: folder.id,
      label: (counts.get(label) ?? 0) > 1 ? `${label} (#${folder.id})` : label,
    };
  });
}

export type ManagerFolderNode = { id: string; title: string; children: ManagerFolderNode[] };

/** Folder hierarchy in browser order, starting at the permanent top-level folders. */
export function buildManagerFolderTree(items: readonly ManagerItem[]): ManagerFolderNode[] {
  const childrenByParent = new Map<string, ManagerItem[]>();
  for (const item of items) {
    if (item.type !== FOLDER_TYPE || !item.parentId) continue;
    const siblings = childrenByParent.get(item.parentId) ?? [];
    siblings.push(item);
    childrenByParent.set(item.parentId, siblings);
  }
  const toNode = (folder: ManagerItem): ManagerFolderNode => ({
    id: folder.id,
    title: folder.title,
    children: (childrenByParent.get(folder.id) ?? [])
      .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
      .map(toNode),
  });
  return items
    .filter((item) => item.type === FOLDER_TYPE && item.isRootFolder)
    .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
    .map(toNode);
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
  const byId = new Map(items.map((item) => [item.id, item]));
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

export type FolderMoveDirection = 'up' | 'down' | 'top' | 'bottom';

/** Whether a reorder would change anything: the first item cannot go up, the last not down. */
export function canMoveWithinFolder(
  direction: FolderMoveDirection,
  index: number,
  siblingCount: number,
): boolean {
  return direction === 'up' || direction === 'top' ? index > 0 : index < siblingCount - 1;
}

/** Folders that can receive the selection: not a selected folder or anything inside one. */
export function getMoveTargetFolders(
  selected: readonly ManagerItem[],
  items: readonly ManagerItem[],
): ManagerItem[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const ids = new Set(selected.map((item) => item.id));
  return items.filter(
    (item) => item.type === FOLDER_TYPE && !ids.has(item.id) && !hasAncestorIn(item, ids, byId),
  );
}

/** Folders from the top level down to (and including) the given folder. */
export function getManagerFolderAncestors(
  items: readonly ManagerItem[],
  folderId: string | null,
): ManagerItem[] {
  const byId = new Map(items.map((item) => [item.id, item]));
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
