import { beforeEach, describe, expect, it, vi } from 'vitest';

const created = vi.hoisted(() => ({
  items: [] as Array<{ parentId: string; title: string }>,
  next: 1,
}));

vi.mock('@/services/bookmarks', () => ({
  createBookmark: vi.fn(async (details: { parentId: string; title: string; url?: string }) => {
    if (details.url?.startsWith('bad:')) throw new Error('Invalid URL.');
    if (details.title === 'Broken Folder') throw new Error('Cannot create folder.');
    created.items.push({ parentId: details.parentId, title: details.title });
    return { id: `n${created.next++}`, ...details };
  }),
}));

const { importBookmarks, jsonImportFormat, parseBookmarks } = await import(
  '@/services/bookmark-import'
);

beforeEach(() => {
  created.items = [];
  created.next = 1;
});

describe('JSON import parsing', () => {
  it('imports valid entries of an array and counts invalid ones as skipped', () => {
    const result = parseBookmarks(
      JSON.stringify([
        { title: 'Good', url: 'https://e2e.invalid/good' },
        42,
        null,
        'text',
        { url: 17 },
        {},
        { title: 'Folder', children: [{ title: 'Child', url: 'https://e2e.invalid/c' }, false] },
      ]),
      jsonImportFormat,
    );
    expect(result.bookmarks.map((node) => node.title)).toEqual(['Good', 'Folder']);
    expect(result.bookmarks[1].children?.map((node) => node.title)).toEqual(['Child']);
    expect(result).toMatchObject({ bookmarkCount: 2, folderCount: 1, skipped: 6 });
  });

  it('unwraps an exported container without adding a level', () => {
    const { bookmarks } = parseBookmarks(
      JSON.stringify({ title: 'Bookmarks', children: [{ title: 'Bar', children: [] }] }),
      jsonImportFormat,
    );
    expect(bookmarks.map((node) => node.title)).toEqual(['Bar']);
  });

  it('rejects malformed JSON', () => {
    expect(() => parseBookmarks('{nope', jsonImportFormat)).toThrow();
  });
});

describe('import creation', () => {
  it('counts bookmarks, folders, and failures separately, including failed folder contents', async () => {
    const { bookmarks } = parseBookmarks(
      JSON.stringify([
        { title: 'Ok', url: 'https://e2e.invalid/ok' },
        { title: 'Rejected', url: 'bad:url' },
        { title: 'Folder', children: [{ title: 'Inner', url: 'https://e2e.invalid/in' }] },
        { title: 'Broken Folder', children: [{ title: 'Lost', url: 'https://e2e.invalid/x' }] },
      ]),
      jsonImportFormat,
    );
    const outcome = await importBookmarks(bookmarks, 'target');
    expect(outcome).toMatchObject({ bookmarksCreated: 2, foldersCreated: 1, failed: 3 });
    expect(outcome.errors).toHaveLength(2);
    expect(created.items.map((item) => item.title)).toEqual(['Ok', 'Folder', 'Inner']);
  });
});
