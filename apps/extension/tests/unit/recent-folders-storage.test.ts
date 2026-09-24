import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  addRecentFolder,
  getRecentFolders,
  normalizeRecentFolders,
  RECENT_FOLDERS_STORAGE_LIMIT,
  removeRecentFolders,
  updateRecentFolderTitle,
} from '@/lib/recent-folders-storage';

const KEY = 'bookmark-scout-recent-folders';
let folders: Map<string, string>;

async function readStored() {
  return (await fakeBrowser.storage.local.get(KEY))[KEY] as { id: string; title: string }[];
}

beforeEach(() => {
  fakeBrowser.reset();
  folders = new Map();
  vi.spyOn(fakeBrowser.bookmarks, 'get').mockImplementation((async (id: string) => {
    const title = folders.get(id);
    if (title === undefined) throw new Error("Can't find bookmark for id.");
    return [{ id, title }];
  }) as never);
});

describe('recent folders storage', () => {
  it('stores up to the maximum configurable limit, most recent first, without duplicates', async () => {
    for (let index = 0; index < 12; index += 1) {
      folders.set(String(index), `Folder ${index}`);
      await addRecentFolder(String(index), `Folder ${index}`);
    }
    await addRecentFolder('5', 'Folder 5');

    const stored = await readStored();
    expect(stored).toHaveLength(RECENT_FOLDERS_STORAGE_LIMIT);
    expect(stored[0].id).toBe('5');
    expect(new Set(stored.map((folder) => folder.id)).size).toBe(stored.length);
    expect((await getRecentFolders(8)).map((folder) => folder.id)).toEqual([
      '5',
      '11',
      '10',
      '9',
      '8',
      '7',
      '6',
      '4',
    ]);
  });

  it('drops duplicate and malformed entries from stored data', () => {
    expect(
      normalizeRecentFolders([
        { id: 'a', title: 'A', lastUsed: 2 },
        { id: 'a', title: 'A old', lastUsed: 1 },
        { title: 'missing id' },
        null,
      ]),
    ).toEqual([{ id: 'a', title: 'A', lastUsed: 2 }]);
  });

  it('prunes deleted folders and picks up renamed titles on read', async () => {
    folders.set('a', 'Alpha');
    folders.set('b', 'Beta');
    await addRecentFolder('a', 'Alpha');
    await addRecentFolder('b', 'Beta');
    folders.delete('a');
    folders.set('b', 'Beta renamed');

    expect(await getRecentFolders()).toMatchObject([{ id: 'b', title: 'Beta renamed' }]);
    expect(await readStored()).toMatchObject([{ id: 'b', title: 'Beta renamed' }]);
  });

  it('removes deleted folder subtrees and applies renames from bookmark events', async () => {
    await addRecentFolder('a', 'Alpha');
    await addRecentFolder('b', 'Beta');
    await addRecentFolder('c', 'Gamma');
    await removeRecentFolders(['a', 'c']);
    await updateRecentFolderTitle('b', 'Beta 2');
    expect(await readStored()).toMatchObject([{ id: 'b', title: 'Beta 2' }]);
  });
});
