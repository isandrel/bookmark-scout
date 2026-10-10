/**
 * Browser bookmarks API service layer.
 * Centralizes all browser bookmarks API interactions.
 */

import { z } from 'zod';
import type { LinkOpenTarget } from '@/lib/settings-schema';
import type { BookmarkTreeNode } from '@/types';

const undoConfig = readConfig(
  'bookmarks/undo',
  z.strictObject({ deletion_undo_window_ms: z.number().int().positive() }),
);

/** How long a deletion can be undone from the popup or side panel. */
export const BOOKMARK_DELETION_UNDO_WINDOW_MS = undoConfig.deletion_undo_window_ms;

/** Chrome 134+ and Edge mark the bookmarks bar with this `folderType`. */
const BOOKMARKS_BAR_FOLDER_TYPE = 'bookmarks-bar';
/** Firefox's bookmarks toolbar has a fixed GUID and no `folderType`. */
const FIREFOX_TOOLBAR_FOLDER_ID = 'toolbar_____';

export type RecoverableBookmarkNode = {
  title: string;
  url?: string;
  index?: number;
  /** Firefox separators have no URL or children and must not be recreated as folders. */
  type?: 'separator';
  /** Tags and summary stored for the node, re-keyed to its new ID on restore. */
  metadata?: StoredBookmarkMetadata;
  children?: RecoverableBookmarkNode[];
};

export type BookmarkDeletionSnapshot = {
  parentId: string;
  node: RecoverableBookmarkNode;
  /** Epoch milliseconds after which the snapshot is no longer restorable. */
  expiresAt: number;
  /** Browser ID of the deleted node, used to find its place among siblings on restore. */
  id?: string;
};

// Per-folder reference order of children, including deleted ones that can still be restored
// (tombstones, with their expiry), so several undos in any order rebuild the original order.
const siblingOrders = new Map<string, string[]>();
const restorableDeletions = new Map<string, number>();

function isRestorableDeletion(id: string, now: number): boolean {
  return (restorableDeletions.get(id) ?? Number.NEGATIVE_INFINITY) >= now;
}

async function rememberSiblingOrder(parentId: string, id: string, expiresAt: number, now: number) {
  for (const [deletedId, expiry] of restorableDeletions) {
    if (expiry < now) restorableDeletions.delete(deletedId);
  }
  const children = await requireBookmarksApi().getChildren(parentId);
  siblingOrders.set(
    parentId,
    mergeSiblingOrder(
      siblingOrders.get(parentId),
      children.map((child) => child.id),
      (siblingId) => isRestorableDeletion(siblingId, now),
    ),
  );
  restorableDeletions.set(id, expiresAt);
}

export type BookmarkRestoreErrorCode = 'expired' | 'parent-missing' | 'restore-failed';

export class BookmarkRestoreError extends Error {
  constructor(
    message: string,
    readonly code: BookmarkRestoreErrorCode,
  ) {
    super(message);
    this.name = 'BookmarkRestoreError';
  }
}

function toRecoverableNode(
  node: Browser.bookmarks.BookmarkTreeNode,
  metadataById: StoredBookmarkMetadataById,
): RecoverableBookmarkNode {
  const nodeType = (node as { type?: string }).type;
  const metadata = metadataById[node.id];
  return {
    title: node.title,
    ...(node.url ? { url: node.url } : {}),
    ...(typeof node.index === 'number' ? { index: node.index } : {}),
    ...(nodeType === 'separator' ? { type: 'separator' as const } : {}),
    ...(metadata ? { metadata } : {}),
    ...(node.children
      ? { children: node.children.map((child) => toRecoverableNode(child, metadataById)) }
      : {}),
  };
}

/**
 * Gets the favicon URL for a given page URL using Chrome's favicon API.
 * @param pageUrl - The URL of the page to get the favicon for
 * @param size - The size of the favicon (default: the favicon size setting's default)
 */
export function getFaviconUrl(pageUrl: string, size: number = defaultSettings.faviconSize): string {
  // The _favicon path is a Chromium feature, so it is not one of the typed public paths.
  const url = new URL(browser.runtime.getURL('/_favicon/' as '/'));
  url.searchParams.set('pageUrl', pageUrl);
  url.searchParams.set('size', size.toString());
  return url.toString();
}

/**
 * The icon to show for a bookmark: the icon saved by Refresh Site Icons for its origin, then the
 * browser's icon cache when `useBrowserCache` (Chrome and Edge, with the Use the browser's icon
 * cache setting on and the optional `favicon` permission granted), else null so the caller shows
 * its generic icon.
 */
export function getSiteIconUrl(
  pageUrl: string,
  size: number = defaultSettings.faviconSize,
  cachedIcon?: string | null,
  useBrowserCache = false,
): string | null {
  if (cachedIcon) return cachedIcon;
  return useBrowserCache ? getFaviconUrl(pageUrl, size) : null;
}

/**
 * Converts a Chrome bookmark node to our BookmarkTreeNode type.
 */
function processNode(node: Browser.bookmarks.BookmarkTreeNode): BookmarkTreeNode {
  return {
    id: node.id,
    parentId: node.parentId,
    index: node.index,
    title: node.title,
    url: node.url,
    dateAdded: node.dateAdded,
    dateGroupModified: node.dateGroupModified,
    ...(node.folderType ? { folderType: node.folderType } : {}),
    ...(node.unmodifiable ? { unmodifiable: node.unmodifiable } : {}),
    children: node.children ? node.children.map(processNode) : undefined,
    isOpen: false,
  };
}

function requireBookmarksApi(): typeof browser.bookmarks {
  if (!browser?.bookmarks) throw new Error(t('error_bookmarksApiUnavailable'));
  return browser.bookmarks;
}

/**
 * Fetches the entire bookmark tree.
 * @returns Promise resolving to the bookmark tree
 */
export async function fetchBookmarkTree(): Promise<BookmarkTreeNode[]> {
  const tree = await requireBookmarksApi().getTree();
  return tree.map(processNode);
}

/**
 * The bookmarks bar (Firefox: bookmarks toolbar) among the permanent folders of `tree`, found by
 * what each browser reports instead of a browser-specific id: Chrome's and Edge's `folderType`,
 * then Firefox's toolbar GUID, then the first permanent folder, where older Chrome versions
 * without `folderType` keep the bar.
 */
export function findBookmarksBarFolder<T extends Pick<BookmarkTreeNode, 'id' | 'parentId'> & {
  folderType?: string;
  children?: T[];
}>(tree: readonly T[]): T | undefined {
  const permanent = tree.filter(isBookmarkTreeRoot).flatMap((root) => root.children ?? []);
  return (
    permanent.find((folder) => folder.folderType === BOOKMARKS_BAR_FOLDER_TYPE) ??
    permanent.find((folder) => folder.id === FIREFOX_TOOLBAR_FOLDER_ID) ??
    permanent[0]
  );
}

/** Id of the bookmarks bar in this browser, or undefined when the tree has no folders. */
export async function getBookmarksBarId(): Promise<string | undefined> {
  return findBookmarksBarFolder(await requireBookmarksApi().getTree())?.id;
}

/**
 * Gets a single bookmark by ID.
 * @param id - The bookmark ID
 */
export async function getBookmark(id: string): Promise<Browser.bookmarks.BookmarkTreeNode> {
  const [result] = await requireBookmarksApi().get(id);
  if (!result) throw new Error(t('error_bookmarkNotFound'));
  return result;
}

/**
 * Gets the named folders containing an item, from the browser's bookmark root
 * down to its immediate parent. The synthetic "Root" used by the manager is
 * not a browser bookmark ID.
 */
export async function getBookmarkFolderPath(parentId?: string): Promise<string[]> {
  const path: string[] = [];
  const visited = new Set<string>();
  let folderId = parentId;

  while (folderId && folderId !== 'Root' && !visited.has(folderId)) {
    visited.add(folderId);
    const folder = await getBookmark(folderId);
    // The browser's unnamed root has no parent and is represented by the UI label.
    if (folder.parentId) path.unshift(folder.title);
    folderId = folder.parentId;
  }

  return path;
}

/**
 * Gets the direct children of a bookmark folder.
 */
export async function getBookmarkChildren(
  id: string,
): Promise<Browser.bookmarks.BookmarkTreeNode[]> {
  return requireBookmarksApi().getChildren(id);
}

/**
 * Creates a new bookmark or folder.
 * @param details - The bookmark creation details
 */
export async function createBookmark(details: {
  parentId?: string;
  index?: number;
  title?: string;
  url?: string;
  /** Firefox-only; Chrome has no separators and never receives this field. */
  type?: 'separator';
}): Promise<Browser.bookmarks.BookmarkTreeNode> {
  return requireBookmarksApi().create(details);
}

/**
 * Moves a bookmark to a new location.
 * @param id - The bookmark ID
 * @param destination - The new parent folder ID and/or index
 */
export async function moveBookmark(
  id: string,
  destination: { parentId?: string; index?: number },
): Promise<Browser.bookmarks.BookmarkTreeNode> {
  return requireBookmarksApi().move(id, destination);
}

/**
 * Moves an item to the top or bottom of its folder, or one place up or down. Does nothing for an
 * item without a parent or one already at that end of its folder.
 */
export async function moveBookmarkWithinFolder(
  item: { id: string; parentId?: string },
  direction: FolderMoveDirection,
): Promise<void> {
  const { id, parentId } = item;
  if (!parentId) return;
  const siblings = await getBookmarkChildren(parentId);
  const currentIndex = siblings.findIndex((sibling) => sibling.id === id);
  if (currentIndex < 0) return;

  // The browser inserts before the item at the target index, counting the moved item itself,
  // so moving down one slot targets index + 2.
  const targetIndex = {
    top: 0,
    up: Math.max(0, currentIndex - 1),
    down: Math.min(siblings.length, currentIndex + 2),
    bottom: siblings.length,
  }[direction];
  if (direction === 'down' && currentIndex >= siblings.length - 1) return;
  if ((direction === 'up' || direction === 'top') && currentIndex === 0) return;
  await moveBookmark(id, { parentId, index: targetIndex });
}

/**
 * Updates an existing bookmark.
 */
export async function updateBookmark(
  id: string,
  changes: Browser.bookmarks.UpdateChanges,
): Promise<Browser.bookmarks.BookmarkTreeNode> {
  return requireBookmarksApi().update(id, changes);
}

/**
 * Deletes a bookmark or folder (and all its contents).
 * @param id - The bookmark/folder ID
 */
export async function deleteBookmark(id: string): Promise<void> {
  return requireBookmarksApi().removeTree(id);
}

/**
 * Captures an in-memory snapshot of a bookmark or folder subtree before deletion
 * so it can be recreated within {@link BOOKMARK_DELETION_UNDO_WINDOW_MS}.
 */
export async function captureBookmarkDeletion(
  id: string,
  now: number = Date.now(),
): Promise<BookmarkDeletionSnapshot> {
  const [node] = await getBookmarkSubTree(id);
  if (!node?.parentId) {
    throw new Error(t('error_bookmarkNoParent'));
  }

  // Tags and summaries are keyed by browser ID, which changes when the tree is recreated.
  const metadataById = await getStoredBookmarkMetadata(subtreeIds(node)).catch(
    () => ({}) as StoredBookmarkMetadataById,
  );
  const expiresAt = now + BOOKMARK_DELETION_UNDO_WINDOW_MS;
  // Ordering is best effort: without it a restore falls back to the captured index.
  await rememberSiblingOrder(node.parentId, id, expiresAt, now).catch(() => undefined);
  return {
    parentId: node.parentId,
    node: toRecoverableNode(node, metadataById),
    expiresAt,
    id,
  };
}

async function recreateBookmarkNode(
  node: RecoverableBookmarkNode,
  parentId: string,
  index: number | undefined,
  restoredMetadata: StoredBookmarkMetadataById,
): Promise<Browser.bookmarks.BookmarkTreeNode> {
  const restored = await createBookmark({
    parentId,
    ...(typeof index === 'number' ? { index } : {}),
    title: node.title,
    ...(node.url ? { url: node.url } : {}),
    ...(node.type ? { type: node.type } : {}),
  });

  if (node.metadata) restoredMetadata[restored.id] = node.metadata;

  // Children are recreated in their captured order, so sequential indexes are always in bounds.
  const children = node.children ?? [];
  for (const [childIndex, child] of children.entries()) {
    await recreateBookmarkNode(child, restored.id, childIndex, restoredMetadata);
  }
  return restored;
}

/**
 * Recreates a captured deletion under its original parent. Browser-generated IDs and
 * dates are new. A partially restored tree is rolled back before the error is thrown.
 */
export async function restoreBookmarkDeletion(
  snapshot: BookmarkDeletionSnapshot,
  now: number = Date.now(),
): Promise<Browser.bookmarks.BookmarkTreeNode> {
  if (now > snapshot.expiresAt) {
    throw new BookmarkRestoreError(t('toast_restoreExpired'), 'expired');
  }

  const parent = await getBookmarkSubTree(snapshot.parentId).then(
    ([node]) => node,
    () => undefined,
  );
  if (!parent || parent.url) {
    throw new BookmarkRestoreError(t('toast_restoreParentMissing'), 'parent-missing');
  }
  const siblings = parent.children ?? [];

  // Other deletions may have been undone since, so place the item by the remembered order;
  // otherwise clamp the captured index so the browser accepts it.
  const order = siblingOrders.get(snapshot.parentId);
  const orderedIndex =
    snapshot.id && order
      ? findRestoreIndex(
          order,
          snapshot.id,
          new Map(siblings.map((sibling, position) => [sibling.id, position])),
        )
      : undefined;
  const index =
    orderedIndex ??
    (typeof snapshot.node.index === 'number'
      ? Math.min(snapshot.node.index, siblings.length)
      : undefined);

  let restoredRoot: Browser.bookmarks.BookmarkTreeNode | undefined;
  const restoredMetadata: StoredBookmarkMetadataById = {};
  try {
    restoredRoot = await createBookmark({
      parentId: snapshot.parentId,
      ...(typeof index === 'number' ? { index } : {}),
      title: snapshot.node.title,
      ...(snapshot.node.url ? { url: snapshot.node.url } : {}),
      ...(snapshot.node.type ? { type: snapshot.node.type } : {}),
    });
    if (snapshot.node.metadata) restoredMetadata[restoredRoot.id] = snapshot.node.metadata;
    const children = snapshot.node.children ?? [];
    for (const [childIndex, child] of children.entries()) {
      await recreateBookmarkNode(child, restoredRoot.id, childIndex, restoredMetadata);
    }
  } catch (error) {
    if (restoredRoot) {
      try {
        await deleteBookmark(restoredRoot.id);
      } catch {
        // Keep the original restore failure if best-effort rollback also fails.
      }
    }
    throw new BookmarkRestoreError(
      getErrorMessage(error, 'toast_errorRestoringDeletion'),
      'restore-failed',
    );
  }

  if (snapshot.id) {
    // Later restores treat the recreated item as the one it replaces.
    restorableDeletions.delete(snapshot.id);
    const siblingOrder = siblingOrders.get(snapshot.parentId);
    const position = siblingOrder?.indexOf(snapshot.id) ?? -1;
    if (siblingOrder && position >= 0) siblingOrder[position] = restoredRoot.id;
  }

  if (Object.keys(restoredMetadata).length > 0) {
    // The bookmarks are already back; losing tags must not report the whole undo as failed.
    await mergeStoredBookmarkMetadata(restoredMetadata, {
      tagMode: 'replace',
      summaryMode: 'replace',
      dedupeTags: true,
    }).catch((error: unknown) => console.error('Failed to restore bookmark metadata:', error));
  }
  return restoredRoot;
}

export async function getBookmarkSubTree(
  id: string,
): Promise<Browser.bookmarks.BookmarkTreeNode[]> {
  return requireBookmarksApi().getSubTree(id);
}

/** The bookmark or folder (with its subtree) as it is now, or undefined if it no longer exists. */
export async function getLiveBookmark(
  id: string,
): Promise<Browser.bookmarks.BookmarkTreeNode | undefined> {
  return getBookmarkSubTree(id).then(
    ([node]) => node,
    () => undefined,
  );
}

// ============================================================================
// Reviewed batch changes
// ============================================================================

/** The bookmark fields a reviewed change compares or writes. */
export type BookmarkFields = { title?: string; url?: string };

/** Values a reviewed change expects the live bookmark to still have, including its folder. */
export type BookmarkExpectation = BookmarkFields & { parentId?: string };

/** Where a reviewed move goes: an existing folder, or folders found or created inside it. */
export type BookmarkMoveTarget = {
  /** An existing folder. */
  parentId: string;
  /**
   * Folder titles under `parentId`, outermost first. Each is reused when a folder with that title
   * is already there and created otherwise; created folders are removed again by undo.
   */
  createPath?: readonly string[];
};

/**
 * One change a tool proposed and the user reviewed. Right before it is written, the live
 * bookmark is read again: if it no longer exists, differs from `expect`, or fails `check`, the
 * change is skipped, so a stale review never overwrites, moves, or deletes a newer edit.
 */
export type BookmarkChange = {
  id: string;
  /** The title the user reviewed, reported back in `issues`. */
  title: string;
  /** Values the live bookmark must still have. */
  expect?: BookmarkExpectation;
  /** Any further condition on the live bookmark (with its subtree), such as a duplicate key. */
  check?: (live: Browser.bookmarks.BookmarkTreeNode) => boolean;
} & (
  | { kind: 'update'; set: BookmarkFields }
  | { kind: 'move'; to: BookmarkMoveTarget }
  | {
      kind: 'remove';
      /** Keep a snapshot so undo can recreate it; on by default. */
      undoable?: boolean;
    }
);

export type BookmarkChangeIssue = {
  id: string;
  title: string;
  /** `changed`: deleted or edited since the review, so it was skipped. */
  reason: 'changed' | 'failed';
};

export type BookmarkChangesUndoResult = { restored: number; failed: number };

export type BookmarkChangesResult = {
  applied: number;
  /** Changes left out because the bookmark changed since the review. */
  skipped: number;
  /** Changes the browser rejected. */
  failed: number;
  /** One entry per skipped or failed change, in the order given. */
  issues: BookmarkChangeIssue[];
  /** Snapshots of the removed bookmarks, in removal order; `undo` restores them. */
  deletions: BookmarkDeletionSnapshot[];
  /** Folders created for moves (see `BookmarkMoveTarget.createPath`). */
  foldersCreated: number;
  /** After this time (epoch milliseconds) removed bookmarks can no longer be restored. */
  expiresAt: number;
  /**
   * Reverts what was applied, once: updates first (newest first), each only while the bookmark
   * still has the written values; then moves (newest first), each only while the bookmark is
   * still in the folder it was moved to; then created folders that are still empty; then
   * removals (newest first, so captured sibling positions stay valid). A later call returns the
   * first call's result.
   */
  undo(): Promise<BookmarkChangesUndoResult>;
};

type AppliedUpdate = { id: string; previous: BookmarkFields; written: BookmarkFields };

type AppliedMove = { id: string; from: { parentId: string; index?: number }; to: string };

function matchesFields(node: Browser.bookmarks.BookmarkTreeNode, fields: BookmarkExpectation = {}) {
  return (Object.keys(fields) as (keyof BookmarkExpectation)[]).every(
    (field) => fields[field] === undefined || node[field] === fields[field],
  );
}

function pickFields(node: Browser.bookmarks.BookmarkTreeNode, fields: BookmarkFields) {
  return Object.fromEntries(
    (Object.keys(fields) as (keyof BookmarkFields)[]).map((field) => [field, node[field]]),
  ) as BookmarkFields;
}

/** Restores deletion snapshots newest first; one failure does not stop the others. */
export async function restoreBookmarkDeletions(
  snapshots: readonly BookmarkDeletionSnapshot[],
): Promise<BookmarkChangesUndoResult> {
  const result: BookmarkChangesUndoResult = { restored: 0, failed: 0 };
  for (const snapshot of [...snapshots].reverse()) {
    try {
      await restoreBookmarkDeletion(snapshot);
      result.restored += 1;
    } catch {
      result.failed += 1;
    }
  }
  return result;
}

async function revertUpdates(updates: readonly AppliedUpdate[]): Promise<BookmarkChangesUndoResult> {
  const result: BookmarkChangesUndoResult = { restored: 0, failed: 0 };
  for (const update of [...updates].reverse()) {
    const live = await getLiveBookmark(update.id);
    // A bookmark edited again since is left alone, so undo never overwrites a newer change.
    if (!live || !matchesFields(live, update.written)) {
      result.failed += 1;
      continue;
    }
    try {
      await updateBookmark(update.id, update.previous);
      result.restored += 1;
    } catch {
      result.failed += 1;
    }
  }
  return result;
}

async function revertMoves(moves: readonly AppliedMove[]): Promise<BookmarkChangesUndoResult> {
  const result: BookmarkChangesUndoResult = { restored: 0, failed: 0 };
  for (const move of [...moves].reverse()) {
    const live = await getLiveBookmark(move.id);
    // A bookmark moved again since is left where the user put it.
    if (live?.parentId !== move.to) {
      result.failed += 1;
      continue;
    }
    try {
      const siblings = await getBookmarkChildren(move.from.parentId);
      await moveBookmark(move.id, {
        parentId: move.from.parentId,
        ...(typeof move.from.index === 'number'
          ? { index: Math.min(move.from.index, siblings.length) }
          : {}),
      });
      result.restored += 1;
    } catch {
      result.failed += 1;
    }
  }
  return result;
}

/** Removes created folders newest first, only while nothing was put in them since. */
async function removeCreatedFolders(ids: readonly string[]): Promise<void> {
  for (const id of [...ids].reverse()) {
    const children = await getBookmarkChildren(id).catch(() => undefined);
    if (children?.length !== 0) continue;
    await deleteBookmark(id).catch(() => undefined);
  }
}

/**
 * Finds or creates each folder of a move target and returns the innermost one. Folders created
 * on the way are added to `created`.
 */
async function resolveMoveTarget(target: BookmarkMoveTarget, created: string[]): Promise<string> {
  let parentId = target.parentId;
  for (const title of target.createPath ?? []) {
    const siblings = await getBookmarkChildren(parentId);
    const existing = siblings.find((sibling) => !sibling.url && sibling.title === title);
    if (existing) {
      parentId = existing.id;
      continue;
    }
    const folder = await createBookmark({ parentId, title });
    created.push(folder.id);
    parentId = folder.id;
  }
  return parentId;
}

/**
 * Writes reviewed changes one by one, in order, re-checking each against the live bookmark
 * first. Every change is attempted; a skipped or failed one never stops the rest.
 */
export async function applyBookmarkChanges(
  changes: readonly BookmarkChange[],
  now: number = Date.now(),
): Promise<BookmarkChangesResult> {
  const issues: BookmarkChangeIssue[] = [];
  const deletions: BookmarkDeletionSnapshot[] = [];
  const updates: AppliedUpdate[] = [];
  const moves: AppliedMove[] = [];
  const createdFolders: string[] = [];
  // Moves that share a target find or create its folders once.
  const moveTargets = new Map<string, Promise<string>>();
  let applied = 0;

  for (const change of changes) {
    const live = await getLiveBookmark(change.id);
    if (!live || !matchesFields(live, change.expect) || (change.check && !change.check(live))) {
      issues.push({ id: change.id, title: change.title, reason: 'changed' });
      continue;
    }
    try {
      if (change.kind === 'update') {
        const previous = pickFields(live, change.set);
        await updateBookmark(change.id, change.set);
        updates.push({ id: change.id, previous, written: change.set });
      } else if (change.kind === 'move') {
        if (!live.parentId) throw new Error(t('error_bookmarkNoParent'));
        const key = JSON.stringify([change.to.parentId, ...(change.to.createPath ?? [])]);
        let target = moveTargets.get(key);
        if (!target) {
          target = resolveMoveTarget(change.to, createdFolders);
          moveTargets.set(key, target);
        }
        const parentId = await target;
        await moveBookmark(change.id, { parentId });
        moves.push({
          id: change.id,
          from: { parentId: live.parentId, index: live.index },
          to: parentId,
        });
      } else if (change.undoable === false) {
        await deleteBookmark(change.id);
      } else {
        const snapshot = await captureBookmarkDeletion(change.id, now);
        await deleteBookmark(change.id);
        deletions.push(snapshot);
      }
      applied += 1;
    } catch {
      issues.push({ id: change.id, title: change.title, reason: 'failed' });
    }
  }

  let undone: Promise<BookmarkChangesUndoResult> | undefined;
  const undo = () => {
    undone ??= (async () => {
      const reverted = await revertUpdates(updates);
      const movedBack = await revertMoves(moves);
      await removeCreatedFolders(createdFolders);
      const restored = await restoreBookmarkDeletions(deletions);
      return {
        restored: reverted.restored + movedBack.restored + restored.restored,
        failed: reverted.failed + movedBack.failed + restored.failed,
      };
    })();
    return undone;
  };

  return {
    applied,
    skipped: issues.filter((issue) => issue.reason === 'changed').length,
    failed: issues.filter((issue) => issue.reason === 'failed').length,
    issues,
    deletions,
    foldersCreated: createdFolders.length,
    expiresAt: Math.min(
      now + BOOKMARK_DELETION_UNDO_WINDOW_MS,
      ...deletions.map((deletion) => deletion.expiresAt),
    ),
    undo,
  };
}

/**
 * Opens a bookmark URL in a new foreground tab.
 */
export async function openBookmarkInNewTab(url: string): Promise<void> {
  await browser.tabs.create({ url, active: true });
}

/**
 * Opens a clicked link where Settings > Behavior > Open links in says. The current tab is the
 * page showing the link: the manager or options tab, or the page behind the popup or side panel.
 */
export async function openUrl(url: string, target: LinkOpenTarget): Promise<void> {
  if (target === 'current_tab') {
    await browser.tabs.update({ url });
    return;
  }
  await browser.tabs.create({ url, active: target === 'new_tab' });
}

/** The manager page, which Chrome and Edge also show as their Bookmarks page. */
export const BOOKMARK_MANAGER_PATH = '/bookmarks.html';

/**
 * Opens the bookmark manager in a new foreground tab. Firefox cannot replace its bookmarks page,
 * so this is the only way in there. A new tab needs no permission; finding an open manager tab to
 * reuse would need `tabs`.
 */
export async function openBookmarkManager(): Promise<void> {
  await browser.tabs.create({ url: browser.runtime.getURL(BOOKMARK_MANAGER_PATH), active: true });
}

/**
 * Gets the current active tab information. Its URL is readable through the toolbar popup's
 * activeTab or the optional `tabs` permission; without either it throws
 * `PermissionRequiredError('currentTab')`, so nothing is saved with an empty URL.
 */
export async function getCurrentTab(): Promise<Browser.tabs.Tab> {
  if (!browser?.tabs) throw new Error(t('error_tabsApiUnavailable'));
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error(t('error_noActiveTab'));
  if (!tab.url) throw new PermissionRequiredError('currentTab');
  return tab;
}
