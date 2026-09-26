import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  BOOKMARK_METADATA_STORAGE_KEY,
  getStoredBookmarkMetadata,
  removeStoredBookmarkMetadata,
  saveBookmarkMetadata,
} from '@/lib/bookmark-metadata-storage';
import {
  BOOKMARK_DELETION_UNDO_WINDOW_MS,
  BookmarkRestoreError,
  captureBookmarkDeletion,
  deleteBookmark,
  restoreBookmarkDeletion,
} from '@/services/bookmarks';

type FakeNode = {
  id: string;
  parentId?: string;
  title: string;
  url?: string;
  type?: 'separator';
  children?: FakeNode[];
};

type CreateDetails = {
  parentId: string;
  index?: number;
  title?: string;
  url?: string;
  type?: 'separator';
};

type SnapshotShape = { title: string; url?: string; type?: string; children?: SnapshotShape[] };

let nodes: Map<string, FakeNode>;
let nextId: number;
let failCreateAfter: number | undefined;
let createCalls: number;

function withIndex(node: FakeNode): Browser.bookmarks.BookmarkTreeNode {
  const parent = node.parentId ? nodes.get(node.parentId) : undefined;
  const index = parent?.children?.indexOf(node);
  return {
    id: node.id,
    parentId: node.parentId,
    title: node.title,
    ...(node.url ? { url: node.url } : {}),
    ...(node.type ? { type: node.type } : {}),
    ...(typeof index === 'number' && index >= 0 ? { index } : {}),
    ...(node.children ? { children: node.children.map(withIndex) } : {}),
  } as Browser.bookmarks.BookmarkTreeNode;
}

function findNode(id: string): FakeNode {
  const node = nodes.get(id);
  if (!node) throw new Error("Can't find bookmark for id.");
  return node;
}

function addNode(parentId: string, details: Omit<CreateDetails, 'parentId'>): FakeNode {
  const parent = nodes.get(parentId);
  if (!parent?.children) throw new Error(`Parent ${parentId} is not a folder.`);
  const index = details.index ?? parent.children.length;
  if (index > parent.children.length) throw new Error('Index out of bounds.');
  const node: FakeNode = {
    id: String(nextId++),
    parentId,
    title: details.title ?? '',
    ...(details.url ? { url: details.url } : {}),
    ...(details.type ? { type: details.type } : {}),
    ...(details.url || details.type ? {} : { children: [] }),
  };
  parent.children.splice(index, 0, node);
  nodes.set(node.id, node);
  return node;
}

function removeTree(id: string) {
  const node = nodes.get(id);
  if (!node) throw new Error("Can't find bookmark for id.");
  for (const child of [...(node.children ?? [])]) removeTree(child.id);
  const parent = node.parentId ? nodes.get(node.parentId) : undefined;
  if (parent?.children) parent.children.splice(parent.children.indexOf(node), 1);
  nodes.delete(id);
}

function shape(id: string): SnapshotShape {
  const node = nodes.get(id);
  if (!node) throw new Error(`Missing ${id}`);
  return {
    title: node.title,
    ...(node.url ? { url: node.url } : {}),
    ...(node.type ? { type: node.type } : {}),
    ...(node.children ? { children: node.children.map((child) => shape(child.id)) } : {}),
  };
}

function childTitles(id: string): string[] {
  return (nodes.get(id)?.children ?? []).map((child) => child.title);
}

beforeEach(() => {
  fakeBrowser.reset();
  nodes = new Map([['0', { id: '0', title: '', children: [] }]]);
  nextId = 1;
  failCreateAfter = undefined;
  createCalls = 0;

  vi.restoreAllMocks();

  // fakeBrowser does not implement bookmarks; model the promise API over the in-memory tree.
  vi.spyOn(fakeBrowser.bookmarks, 'getSubTree').mockImplementation(async (id: string) => [
    withIndex(findNode(id)),
  ]);
  vi.spyOn(fakeBrowser.bookmarks, 'get').mockImplementation((async (id: string) => [
    withIndex(findNode(id)),
  ]) as typeof fakeBrowser.bookmarks.get);
  vi.spyOn(fakeBrowser.bookmarks, 'create').mockImplementation(async (details) => {
    createCalls += 1;
    if (failCreateAfter !== undefined && createCalls > failCreateAfter) {
      throw new Error('Simulated create failure.');
    }
    return withIndex(addNode(details.parentId ?? '', details as CreateDetails));
  });
  vi.spyOn(fakeBrowser.bookmarks, 'removeTree').mockImplementation(async (id: string) => {
    removeTree(id);
  });

  const root = addNode('0', { title: 'Root Folder' });
  addNode(root.id, { title: 'Before', url: 'https://example.com/before' });
  const target = addNode(root.id, { title: 'Target Folder' });
  addNode(target.id, { title: 'First', url: 'https://example.com/first' });
  const nested = addNode(target.id, { title: 'Nested' });
  addNode(nested.id, { title: 'Deep', url: 'https://example.com/deep' });
  addNode(nested.id, { title: 'Empty Folder' });
  addNode(target.id, { title: '', type: 'separator' });
  addNode(target.id, { title: 'Last', url: 'https://example.com/last' });
  addNode(root.id, { title: 'After', url: 'https://example.com/after' });
});

const ROOT_FOLDER_ID = '1';
const TARGET_FOLDER_ID = '3';

describe('bookmark deletion recovery', () => {
  it('restores a nested folder tree with titles, URLs, structure, and order', async () => {
    const before = shape(TARGET_FOLDER_ID);
    const snapshot = await captureBookmarkDeletion(TARGET_FOLDER_ID, 1_000);
    await deleteBookmark(TARGET_FOLDER_ID);
    expect(childTitles(ROOT_FOLDER_ID)).toEqual(['Before', 'After']);

    const restored = await restoreBookmarkDeletion(snapshot, 1_000);

    expect(childTitles(ROOT_FOLDER_ID)).toEqual(['Before', 'Target Folder', 'After']);
    expect(restored.id).not.toBe(TARGET_FOLDER_ID);
    expect(shape(restored.id)).toEqual(before);
  });

  it('keeps the snapshot free of browser IDs and bounded to the undo window', async () => {
    const snapshot = await captureBookmarkDeletion(TARGET_FOLDER_ID, 5_000);
    expect(snapshot.expiresAt).toBe(5_000 + BOOKMARK_DELETION_UNDO_WINDOW_MS);
    expect(JSON.stringify(snapshot.node)).not.toMatch(/"id"|dateAdded/);
  });

  it('refuses to restore after the undo window expires without touching bookmarks', async () => {
    const snapshot = await captureBookmarkDeletion(TARGET_FOLDER_ID, 0);
    await deleteBookmark(TARGET_FOLDER_ID);

    await expect(
      restoreBookmarkDeletion(snapshot, BOOKMARK_DELETION_UNDO_WINDOW_MS + 1),
    ).rejects.toMatchObject({ code: 'expired' });
    expect(childTitles(ROOT_FOLDER_ID)).toEqual(['Before', 'After']);

    await expect(
      restoreBookmarkDeletion(snapshot, BOOKMARK_DELETION_UNDO_WINDOW_MS),
    ).resolves.toBeDefined();
  });

  it('clamps the original position when siblings were removed after deletion', async () => {
    const snapshot = await captureBookmarkDeletion('10', 0);
    expect(snapshot.node.index).toBe(2);
    await deleteBookmark('10');
    await deleteBookmark('2');
    await deleteBookmark(TARGET_FOLDER_ID);

    await restoreBookmarkDeletion(snapshot, 0);
    expect(childTitles(ROOT_FOLDER_ID)).toEqual(['After']);
    expect(nodes.get('1')?.children?.map((child) => child.url)).toEqual([
      'https://example.com/after',
    ]);
  });

  it('fails safely when the original parent folder no longer exists', async () => {
    const snapshot = await captureBookmarkDeletion('4', 0);
    await deleteBookmark(TARGET_FOLDER_ID);
    const error = await restoreBookmarkDeletion(snapshot, 0).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(BookmarkRestoreError);
    expect(error).toMatchObject({ code: 'parent-missing' });
    expect([...nodes.values()].some((node) => node.title === 'First')).toBe(false);
  });

  it('rolls back a partially restored tree when recreation fails', async () => {
    const snapshot = await captureBookmarkDeletion(TARGET_FOLDER_ID, 0);
    await deleteBookmark(TARGET_FOLDER_ID);
    failCreateAfter = createCalls + 3;

    await expect(restoreBookmarkDeletion(snapshot, 0)).rejects.toMatchObject({
      code: 'restore-failed',
    });
    expect(childTitles(ROOT_FOLDER_ID)).toEqual(['Before', 'After']);
  });

  it('restores repeated deletions independently from their own snapshots', async () => {
    const first = await captureBookmarkDeletion('2', 0);
    await deleteBookmark('2');
    const second = await captureBookmarkDeletion('10', 0);
    await deleteBookmark('10');

    await restoreBookmarkDeletion(second, 0);
    expect(childTitles(ROOT_FOLDER_ID)).toEqual(['Target Folder', 'After']);
    await restoreBookmarkDeletion(first, 0);
    expect(childTitles(ROOT_FOLDER_ID)).toEqual(['Before', 'Target Folder', 'After']);
  });

  it('restores tags and summaries for the whole subtree under the recreated IDs', async () => {
    await saveBookmarkMetadata('3', { tags: ['folder-tag'] });
    await saveBookmarkMetadata('6', { tags: ['deep'], summary: 'Deep summary' });
    await saveBookmarkMetadata('10', { summary: 'Outside the deleted subtree' });

    const snapshot = await captureBookmarkDeletion(TARGET_FOLDER_ID, 0);
    expect(JSON.stringify(snapshot.node)).not.toMatch(/"id"/);
    await deleteBookmark(TARGET_FOLDER_ID);
    // Deletion flows and stale-ID reconciliation drop the old entries before undo.
    await removeStoredBookmarkMetadata(['3', '6']);

    const restored = await restoreBookmarkDeletion(snapshot, 0);
    const restoredDeep = nodes.get(restored.id)?.children?.[1]?.children?.[0];
    expect(restoredDeep?.title).toBe('Deep');
    expect(restoredDeep?.id).not.toBe('6');

    expect(await getStoredBookmarkMetadata([restored.id, restoredDeep?.id ?? '', '3', '6'])).toEqual({
      [restored.id]: { tags: ['folder-tag'] },
      [restoredDeep?.id ?? '']: { tags: ['deep'], summary: 'Deep summary' },
    });
    const raw = await fakeBrowser.storage.local.get(BOOKMARK_METADATA_STORAGE_KEY);
    expect(raw[BOOKMARK_METADATA_STORAGE_KEY]).toHaveProperty('10', {
      summary: 'Outside the deleted subtree',
    });
  });

  it('does not write metadata when the deleted subtree had none', async () => {
    const snapshot = await captureBookmarkDeletion(TARGET_FOLDER_ID, 0);
    await deleteBookmark(TARGET_FOLDER_ID);
    await restoreBookmarkDeletion(snapshot, 0);
    const raw = await fakeBrowser.storage.local.get(BOOKMARK_METADATA_STORAGE_KEY);
    expect(raw[BOOKMARK_METADATA_STORAGE_KEY]).toBeUndefined();
  });
});

describe('restoring several deletions out of order', () => {
  beforeEach(() => {
    vi.spyOn(fakeBrowser.bookmarks, 'getChildren').mockImplementation(async (id: string) =>
      (findNode(id).children ?? []).map(withIndex),
    );
  });

  it('puts every item back in its original place whatever order the undos run in', async () => {
    const snapshots = [];
    for (const id of ['2', TARGET_FOLDER_ID, '10']) {
      snapshots.push(await captureBookmarkDeletion(id, 0));
      await deleteBookmark(id);
    }
    expect(childTitles(ROOT_FOLDER_ID)).toEqual([]);

    const [before, target, after] = snapshots;
    await restoreBookmarkDeletion(after, 0);
    await restoreBookmarkDeletion(before, 0);
    await restoreBookmarkDeletion(target, 0);
    expect(childTitles(ROOT_FOLDER_ID)).toEqual(['Before', 'Target Folder', 'After']);
  });

  it('places an item before a neighbour that was deleted earlier and restored first', async () => {
    const target = await captureBookmarkDeletion(TARGET_FOLDER_ID, 0);
    await deleteBookmark(TARGET_FOLDER_ID);
    const before = await captureBookmarkDeletion('2', 0);
    await deleteBookmark('2');

    await restoreBookmarkDeletion(target, 0);
    await restoreBookmarkDeletion(before, 0);
    expect(childTitles(ROOT_FOLDER_ID)).toEqual(['Before', 'Target Folder', 'After']);
  });
});
