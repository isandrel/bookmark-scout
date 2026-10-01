import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage, t } from '@/hooks/use-i18n';
import { getBookmarkDisplayTitle } from '@/lib/bookmark-tree';
import { useBookmarkStore } from '@/stores/bookmark-store';

type FakeNode = {
  id: string;
  parentId?: string;
  title: string;
  url?: string;
  children?: FakeNode[];
};

const PAGE = { title: 'Current Page', url: 'https://example.com/page' };

let nodes: Map<string, FakeNode>;
let nextId: number;
/** When set, bookmark creation waits for this promise, keeping a save in flight. */
let createGate: Promise<void> | undefined;

function toApi(node: FakeNode): Browser.bookmarks.BookmarkTreeNode {
  const parent = node.parentId ? nodes.get(node.parentId) : undefined;
  const index = parent?.children?.indexOf(node);
  return {
    id: node.id,
    parentId: node.parentId,
    title: node.title,
    ...(node.url ? { url: node.url } : {}),
    ...(typeof index === 'number' && index >= 0 ? { index } : {}),
    ...(node.children ? { children: node.children.map(toApi) } : {}),
  } as Browser.bookmarks.BookmarkTreeNode;
}

function findNode(id: string): FakeNode {
  const node = nodes.get(id);
  if (!node) throw new Error("Can't find bookmark for id.");
  return node;
}

function addNode(parentId: string, title: string, url?: string): FakeNode {
  const parent = findNode(parentId);
  const node: FakeNode = {
    id: String(nextId++),
    parentId,
    title,
    ...(url ? { url } : { children: [] }),
  };
  parent.children?.push(node);
  nodes.set(node.id, node);
  return node;
}

function childTitles(id: string): string[] {
  return (findNode(id).children ?? []).map((child) => child.title);
}

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

let bar: FakeNode;
let folder: FakeNode;

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  setLanguage('en');
  nodes = new Map([['0', { id: '0', title: '', children: [] }]]);
  nextId = 1;
  createGate = undefined;

  // fakeBrowser does not implement bookmarks; model the promise API over the in-memory tree.
  vi.spyOn(fakeBrowser.bookmarks, 'getTree').mockImplementation(async () => [toApi(findNode('0'))]);
  vi.spyOn(fakeBrowser.bookmarks, 'get').mockImplementation((async (id: string) => [
    toApi(findNode(id)),
  ]) as typeof fakeBrowser.bookmarks.get);
  vi.spyOn(fakeBrowser.bookmarks, 'getChildren').mockImplementation(async (id: string) =>
    (findNode(id).children ?? []).map(toApi),
  );
  vi.spyOn(fakeBrowser.bookmarks, 'create').mockImplementation(async (details) => {
    await createGate;
    return toApi(addNode(details.parentId ?? '', details.title ?? '', details.url));
  });
  // Chrome semantics: within one folder, the index counts positions before the item is removed.
  vi.spyOn(fakeBrowser.bookmarks, 'move').mockImplementation(async (id, destination) => {
    const node = findNode(id);
    const source = findNode(node.parentId ?? '');
    const target = findNode(destination.parentId ?? node.parentId ?? '');
    const from = source.children?.indexOf(node) ?? 0;
    let index = destination.index ?? target.children?.length ?? 0;
    if (source === target && index > from) index -= 1;
    source.children?.splice(from, 1);
    target.children?.splice(index, 0, node);
    node.parentId = target.id;
    return toApi(node);
  });
  vi.spyOn(fakeBrowser.tabs, 'query').mockImplementation(async () => [
    { ...PAGE, id: 1, index: 0, active: true } as Browser.tabs.Tab,
  ]);

  bar = addNode('0', 'Bookmarks bar');
  folder = addNode(bar.id, 'Reading');
  useBookmarkStore.setState({
    folders: [],
    filteredFolders: [],
    debouncedQuery: '',
    expandedFolders: [],
    preSearchExpandedFolders: null,
    searchExpansion: null,
    expandFoldersOnSearch: true,
    addingToFolderIds: [],
  });
});

describe('addBookmarkToFolder', () => {
  it('saves once when a second request arrives while the first is still saving', async () => {
    const gate = deferred();
    createGate = gate.promise;
    const { addBookmarkToFolder } = useBookmarkStore.getState();

    const first = addBookmarkToFolder(folder.id);
    const second = addBookmarkToFolder(folder.id);
    await vi.waitFor(() =>
      expect(useBookmarkStore.getState().addingToFolderIds).toEqual([folder.id]),
    );
    gate.resolve();

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult.success).toBe(true);
    expect(secondResult).toMatchObject({ success: false, skipped: true, silent: true });
    expect(childTitles(folder.id)).toEqual([PAGE.title]);
    expect(useBookmarkStore.getState().addingToFolderIds).toEqual([]);
  });

  it('still reports an already saved page once the first save has finished', async () => {
    const { addBookmarkToFolder } = useBookmarkStore.getState();
    await addBookmarkToFolder(folder.id);
    const again = await addBookmarkToFolder(folder.id);

    expect(again).toMatchObject({ success: false, skipped: true });
    expect(again.silent).toBeUndefined();
    expect(again.message).toBe('"Current Page" is already in "Reading".');
    expect(childTitles(folder.id)).toEqual([PAGE.title]);
  });

  it('saves into different folders at the same time', async () => {
    const other = addNode(bar.id, 'Later');
    const { addBookmarkToFolder } = useBookmarkStore.getState();
    await Promise.all([addBookmarkToFolder(folder.id), addBookmarkToFolder(other.id)]);

    expect(childTitles(folder.id)).toEqual([PAGE.title]);
    expect(childTitles(other.id)).toEqual([PAGE.title]);
  });
});

describe('createFolder', () => {
  it('creates one folder when the same name is submitted twice while saving', async () => {
    const gate = deferred();
    createGate = gate.promise;
    const { createFolder } = useBookmarkStore.getState();

    const first = createFolder(folder.id, 'Twice');
    const second = createFolder(folder.id, ' Twice ');
    gate.resolve();
    const results = await Promise.all([first, second]);

    expect(results[0].success).toBe(true);
    expect(results[1].silent).toBe(true);
    expect(childTitles(folder.id)).toEqual(['Twice']);
  });
});

describe('handleDrop', () => {
  let ids: string[];

  beforeEach(() => {
    ids = ['A', 'B', 'C', 'D'].map((title) => addNode(folder.id, title, `https://e.x/${title}`).id);
  });

  const reorder = (sourceId: string, targetIndex: number) =>
    useBookmarkStore.getState().handleDrop({
      type: 'bookmark-reorder',
      sourceId,
      sourceParentId: folder.id,
      sourceIndex: ids.indexOf(sourceId),
      targetId: '',
      targetParentId: folder.id,
      targetIndex,
    });

  it('reports the position the item landed at when moving it down', async () => {
    // Dropped below C: the index counts A itself, so A ends up third.
    const result = await reorder(ids[0], 3);

    expect(childTitles(folder.id)).toEqual(['B', 'C', 'A', 'D']);
    expect(result).toMatchObject({ success: true, message: '"A" reordered to position 3' });
  });

  it('reports the position when moving an item up', async () => {
    const result = await reorder(ids[3], 1);

    expect(childTitles(folder.id)).toEqual(['A', 'D', 'B', 'C']);
    expect(result.message).toBe('"D" reordered to position 2');
  });

  it('stays silent when the item is dropped where it already is', async () => {
    const below = await reorder(ids[0], 1);
    const above = await reorder(ids[1], 1);

    expect(childTitles(folder.id)).toEqual(['A', 'B', 'C', 'D']);
    expect(below).toMatchObject({ skipped: true, silent: true });
    expect(above).toMatchObject({ skipped: true, silent: true });
  });
});

describe('search expansion', () => {
  beforeEach(async () => {
    const nested = addNode(folder.id, 'Nested');
    addNode(nested.id, 'Needle deep', 'https://e.x/deep');
    addNode(folder.id, 'Needle top', 'https://e.x/top');
    await useBookmarkStore.getState().fetchFolders();
    useBookmarkStore.getState().setDebouncedQuery('Needle');
  });

  it('collapses and expands every result folder while expandFoldersOnSearch is on', () => {
    const { setSearchExpansion } = useBookmarkStore.getState();
    expect(useBookmarkStore.getState().expandedFolders).toContain(folder.id);

    setSearchExpansion('collapse');
    expect(useBookmarkStore.getState().expandedFolders).toEqual([]);

    setSearchExpansion('expand');
    expect(useBookmarkStore.getState().expandedFolders).toEqual(
      expect.arrayContaining([bar.id, folder.id]),
    );
  });

  it('keeps the choice for a refined query and resets it when the search is cleared', () => {
    const { setSearchExpansion, setDebouncedQuery } = useBookmarkStore.getState();
    setSearchExpansion('collapse');
    setDebouncedQuery('Needle d');
    expect(useBookmarkStore.getState().expandedFolders).toEqual([]);

    setDebouncedQuery('');
    expect(useBookmarkStore.getState().searchExpansion).toBeNull();
  });
});

describe('getBookmarkDisplayTitle', () => {
  it('shows blank titles as the localized "Untitled"', () => {
    expect(getBookmarkDisplayTitle('')).toBe('Untitled');
    expect(getBookmarkDisplayTitle('   ')).toBe('Untitled');
    expect(getBookmarkDisplayTitle(undefined)).toBe('Untitled');
    expect(getBookmarkDisplayTitle(' Kept ')).toBe(' Kept ');

    setLanguage('ja');
    expect(getBookmarkDisplayTitle('')).toBe(t('popup_untitled'));
    expect(getBookmarkDisplayTitle('')).not.toBe('Untitled');
  });
});
