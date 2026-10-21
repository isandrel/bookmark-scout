/**
 * Keeps an in-memory bookmark tree in step with browser bookmark events without re-reading the
 * whole tree. `applyBookmarkTreeChanges` patches a tree copy-on-write: only the changed nodes and
 * their ancestors are new objects, so every unchanged subtree keeps its identity and memoized
 * work derived from it (rows, sorting, rendering) can be skipped. Anything it cannot apply
 * exactly returns null, and the caller reloads the tree instead.
 *
 * Changes are applied idempotently: a change the tree already reflects (a reload that already saw
 * it) is skipped, so a batch can land on a tree read before or after its events.
 */

import { isSeparatorNode, SEPARATOR_TYPE } from '@/lib/bookmark-separators';
import type { BookmarkTreeNode } from '@/types';

/** A node as the browser reports it; Firefox adds `type` (`bookmark`, `folder`, `separator`). */
export type BrowserBookmarkNode = Browser.bookmarks.BookmarkTreeNode & { type?: string };

/** One browser bookmark event, in the shape the tree patch needs. */
export type BookmarkTreeChange =
  | { type: 'created'; node: BrowserBookmarkNode }
  | { type: 'removed'; id: string; parentId: string }
  | {
      type: 'changed';
      id: string;
      title?: string;
      url?: string;
      /** The browser updates a folder's modified date when its children change. */
      dateGroupModified?: number;
    }
  | { type: 'moved'; id: string; parentId: string; index: number; oldParentId?: string }
  | { type: 'reordered'; id: string; childIds: readonly string[] };

/** The events received during one quiet period, delivered together. */
export type BookmarkEventBatch = {
  changes: BookmarkTreeChange[];
  /** An import or another bulk change happened; the tree must be read again. */
  reload: boolean;
};

function isFolderNode(node: BrowserBookmarkNode): boolean {
  if (node.children !== undefined) return true;
  // Event nodes carry no children; Chrome folders are the nodes without a URL.
  return node.type === undefined ? node.url === undefined : node.type === 'folder';
}

/** Converts a browser node (and its subtree) to the tree node the pages keep. */
export function toBookmarkTreeNode(node: BrowserBookmarkNode): BookmarkTreeNode {
  return {
    id: node.id,
    parentId: node.parentId,
    index: node.index,
    title: node.title,
    url: node.url,
    dateAdded: node.dateAdded,
    dateGroupModified: node.dateGroupModified,
    ...(node.folderType ? { folderType: node.folderType } : {}),
    ...(typeof node.syncing === 'boolean' ? { syncing: node.syncing } : {}),
    ...(node.unmodifiable ? { unmodifiable: node.unmodifiable } : {}),
    ...(isSeparatorNode(node) ? { type: SEPARATOR_TYPE } : {}),
    children: node.children
      ? node.children.map(toBookmarkTreeNode)
      : isFolderNode(node)
        ? []
        : undefined,
    isOpen: false,
  };
}

class InconsistentTreeError extends Error {}

function fail(): never {
  throw new InconsistentTreeError();
}

/** A copy-on-write view of a tree: `edit` returns a node that is safe to change in place. */
function createTreeDraft(roots: readonly BookmarkTreeNode[]) {
  const byId = new Map<string, BookmarkTreeNode>();
  const index = (node: BookmarkTreeNode) => {
    byId.set(node.id, node);
    for (const child of node.children ?? []) index(child);
  };
  for (const root of roots) index(root);

  let draftRoots: BookmarkTreeNode[] | undefined;
  const editable = new Set<BookmarkTreeNode>();

  const copy = (node: BookmarkTreeNode, changes: Partial<BookmarkTreeNode> = {}) => {
    const next = {
      ...node,
      ...(node.children ? { children: [...node.children] } : {}),
      ...changes,
    };
    editable.add(next);
    byId.set(next.id, next);
    return next;
  };

  const siblingsOf = (node: BookmarkTreeNode): BookmarkTreeNode[] => {
    if (node.parentId !== undefined && byId.has(node.parentId)) {
      return edit(node.parentId).children ?? fail();
    }
    draftRoots ??= [...roots];
    return draftRoots;
  };

  const positionIn = (siblings: readonly BookmarkTreeNode[], node: BookmarkTreeNode) => {
    // Indexes are kept current, so the hint almost always hits.
    const hinted = node.index ?? -1;
    const position = siblings[hinted] === node ? hinted : siblings.indexOf(node);
    return position >= 0 ? position : fail();
  };

  function edit(id: string): BookmarkTreeNode {
    const node = byId.get(id) ?? fail();
    if (editable.has(node)) return node;
    const siblings = siblingsOf(node);
    const position = positionIn(siblings, node);
    const next = copy(node);
    siblings[position] = next;
    return next;
  }

  /** Brings `index` back in line with the position of each child from `start` on. */
  const renumber = (children: BookmarkTreeNode[], start: number) => {
    for (let position = Math.max(0, start); position < children.length; position++) {
      const child = children[position];
      if (child.index === position) continue;
      if (editable.has(child)) child.index = position;
      else children[position] = copy(child, { index: position });
    }
  };

  const forget = (node: BookmarkTreeNode) => {
    byId.delete(node.id);
    for (const child of node.children ?? []) forget(child);
  };

  const isInside = (id: string, ancestorId: string) => {
    const visited = new Set<string>();
    let current: string | undefined = id;
    while (current !== undefined && !visited.has(current)) {
      if (current === ancestorId) return true;
      visited.add(current);
      current = byId.get(current)?.parentId;
    }
    return false;
  };

  const apply = (change: BookmarkTreeChange) => {
    switch (change.type) {
      case 'created': {
        // Ids are never reused, so a known id means the tree already has this node.
        if (byId.has(change.node.id)) return;
        const children = edit(change.node.parentId ?? fail()).children ?? fail();
        const position = change.node.index ?? children.length;
        if (position > children.length) fail();
        const node = toBookmarkTreeNode(change.node);
        index(node);
        children.splice(position, 0, node);
        renumber(children, position);
        return;
      }
      case 'removed': {
        const node = byId.get(change.id);
        if (!node) return;
        if (node.parentId !== change.parentId) fail();
        const children = edit(change.parentId).children ?? fail();
        const position = positionIn(children, node);
        children.splice(position, 1);
        forget(node);
        renumber(children, position);
        return;
      }
      case 'changed': {
        const updates: Partial<BookmarkTreeNode> = {};
        if (change.title !== undefined) updates.title = change.title;
        if (change.url !== undefined) updates.url = change.url;
        if (change.dateGroupModified !== undefined) {
          updates.dateGroupModified = change.dateGroupModified;
        }
        const node = byId.get(change.id) ?? fail();
        const keys = Object.keys(updates) as (keyof typeof updates)[];
        if (keys.every((key) => node[key] === updates[key])) return;
        Object.assign(edit(change.id), updates);
        return;
      }
      case 'moved': {
        const node = byId.get(change.id) ?? fail();
        if (node.parentId === change.parentId && node.index === change.index) return;
        const target = byId.get(change.parentId) ?? fail();
        if (!target.children || isInside(target.id, node.id)) fail();
        const source = edit(node.parentId ?? fail()).children ?? fail();
        const from = positionIn(source, node);
        source.splice(from, 1);
        renumber(source, from);
        const children = edit(change.parentId).children ?? fail();
        if (change.index > children.length) fail();
        children.splice(change.index, 0, copy(node, { parentId: change.parentId }));
        renumber(children, change.index);
        // Its descendants stay where they are; only their parent's identity changed.
        return;
      }
      case 'reordered': {
        const parent = byId.get(change.id) ?? fail();
        const current = parent.children ?? fail();
        if (current.length !== change.childIds.length) fail();
        if (current.every((child, position) => child.id === change.childIds[position])) return;
        const reordered = change.childIds.map((id) => {
          const child = byId.get(id);
          return child?.parentId === change.id ? child : fail();
        });
        if (new Set(change.childIds).size !== reordered.length) fail();
        const children = edit(change.id).children ?? fail();
        children.splice(0, children.length, ...reordered);
        renumber(children, 0);
        return;
      }
    }
  };

  return {
    apply,
    changed: () => editable.size > 0 || draftRoots !== undefined,
    roots: () => draftRoots ?? [...roots],
  };
}

/**
 * Applies browser bookmark events to a tree. Returns `roots` itself when nothing changed, a new
 * tree sharing every unchanged subtree otherwise, and null when a change does not fit the tree
 * (a missing parent, an index out of range), which means the tree must be read again.
 */
export function applyBookmarkTreeChanges<Tree extends readonly BookmarkTreeNode[]>(
  roots: Tree,
  changes: readonly BookmarkTreeChange[],
): Tree | BookmarkTreeNode[] | null {
  if (changes.length === 0) return roots;
  const draft = createTreeDraft(roots);
  try {
    for (const change of changes) draft.apply(change);
  } catch (error) {
    if (error instanceof InconsistentTreeError) return null;
    throw error;
  }
  return draft.changed() ? draft.roots() : roots;
}

/** What a page gives `createBookmarkTreeSync`: its current tree, and how to replace or reload it. */
export type BookmarkTreeSyncTarget<Tree extends readonly BookmarkTreeNode[]> = {
  getTree: () => Tree | undefined;
  setTree: (tree: Tree | BookmarkTreeNode[]) => void;
  /** Reads the whole tree again (with the page's own loading and error handling). */
  reload: () => Promise<void>;
};

export type BookmarkTreeSync = {
  reload: () => Promise<void>;
  applyBatch: (batch: BookmarkEventBatch) => Promise<void>;
  /** Shows a change this page made itself right away, before its event arrives. */
  applyChanges: (changes: readonly BookmarkTreeChange[]) => Promise<void>;
};

/**
 * Runs a page's reloads and event patches one at a time, in order, so a patch never lands on a
 * tree that a reload in flight is about to replace. A batch that cannot be applied, an import,
 * or a page that has not loaded its tree yet falls back to a reload.
 */
export function createBookmarkTreeSync<Tree extends readonly BookmarkTreeNode[]>(
  target: BookmarkTreeSyncTarget<Tree>,
): BookmarkTreeSync {
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = (task: () => Promise<void> | void): Promise<void> => {
    const result = queue.then(task);
    queue = result.catch(() => undefined);
    return result;
  };
  const patch = async (changes: readonly BookmarkTreeChange[], reload: boolean) => {
    const tree = target.getTree();
    const patched = !reload && tree ? applyBookmarkTreeChanges(tree, changes) : null;
    if (!patched) return target.reload();
    if (patched !== tree) target.setTree(patched);
  };
  return {
    reload: () => enqueue(target.reload),
    applyBatch: (batch: BookmarkEventBatch) => enqueue(() => patch(batch.changes, batch.reload)),
    applyChanges: (changes: readonly BookmarkTreeChange[]) => enqueue(() => patch(changes, false)),
  };
}
