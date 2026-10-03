import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  applyImportPlan,
  isSameImportPlan,
  jsonImportFormat,
  listImportTargets,
  parseBookmarks,
  planImport,
  undoImport,
} from '@/services/bookmark-import';
import type { BookmarkTreeNode } from '@/types';
import { type FakeBookmarks, installFakeBookmarks } from '../fake-bookmarks';

/** The browser side: an empty import target folder. */
let bookmarks: FakeBookmarks;

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  bookmarks = installFakeBookmarks([{ id: 'target', title: 'Target' }]);
});

const titles = (folderId: string) =>
  bookmarks.childIds(folderId).map((id) => bookmarks.get(id)?.title);

/** Root > Bookmarks bar > Target (A, Sub > B), Other bookmarks (C), Managed (read-only). */
function browserTree(): BookmarkTreeNode[] {
  return [
    {
      id: '0',
      title: '',
      children: [
        {
          id: '1',
          parentId: '0',
          title: 'Bookmarks bar',
          children: [
            {
              id: 'target',
              parentId: '1',
              title: 'Target',
              children: [
                { id: 'a', parentId: 'target', title: 'A', url: 'https://e2e.invalid/a' },
                {
                  id: 'sub',
                  parentId: 'target',
                  title: 'Sub',
                  children: [
                    { id: 'b', parentId: 'sub', title: 'B', url: 'https://e2e.invalid/b' },
                  ],
                },
              ],
            },
          ],
        },
        {
          id: '2',
          parentId: '0',
          title: 'Other bookmarks',
          children: [{ id: 'c', parentId: '2', title: 'C', url: 'https://e2e.invalid/c' }],
        },
        { id: 'managed', parentId: '0', title: 'Managed', unmodifiable: 'managed', children: [] },
      ],
    },
  ];
}

function parseJson(value: unknown) {
  return parseBookmarks(JSON.stringify(value), jsonImportFormat);
}

describe('JSON import parsing', () => {
  it('imports valid entries of an array and counts invalid ones as skipped', () => {
    const result = parseJson([
      { title: 'Good', url: 'https://e2e.invalid/good' },
      42,
      null,
      'text',
      { url: 17 },
      {},
      { title: 'Folder', children: [{ title: 'Child', url: 'https://e2e.invalid/c' }, false] },
    ]);
    expect(result.bookmarks.map((node) => node.title)).toEqual(['Good', 'Folder']);
    expect(result.bookmarks[1].children?.map((node) => node.title)).toEqual(['Child']);
    expect(result).toMatchObject({ bookmarkCount: 2, folderCount: 1, skipped: 6 });
  });

  it('unwraps an exported container without adding a level', () => {
    const { bookmarks } = parseJson({
      title: 'Bookmarks',
      children: [{ title: 'Bar', children: [] }],
    });
    expect(bookmarks.map((node) => node.title)).toEqual(['Bar']);
  });

  it('rejects malformed JSON', () => {
    expect(() => parseBookmarks('{nope', jsonImportFormat)).toThrow();
  });
});

describe('import targets', () => {
  it('lists writable folders with full paths and excludes the root and managed folders', () => {
    expect(listImportTargets(browserTree())).toEqual([
      { id: '1', label: 'Bookmarks bar' },
      { id: 'target', label: 'Bookmarks bar / Target' },
      { id: 'sub', label: 'Bookmarks bar / Target / Sub' },
      { id: '2', label: 'Other bookmarks' },
    ]);
  });
});

describe('import plan (dry run)', () => {
  const file = () =>
    parseJson([
      { title: 'A again', url: 'https://e2e.invalid/a' },
      { title: 'New', url: 'https://e2e.invalid/new' },
      {
        title: 'Folder',
        children: [
          { title: 'B again', url: 'https://e2e.invalid/b' },
          { title: 'C again', url: 'https://e2e.invalid/c' },
          { title: 'Deep', children: [{ title: 'New twice', url: 'https://e2e.invalid/new' }] },
        ],
      },
      { title: 'Only dupes', children: [{ title: 'C dup', url: 'https://e2e.invalid/c' }] },
      { title: 'Empty in file', children: [] },
      7,
    ]);

  it('classifies duplicates in the target, elsewhere, and within the file', () => {
    const plan = planImport(file(), browserTree(), 'target', 'import-all');
    expect(plan.conflicts.map(({ title, kind }) => [title, kind])).toEqual([
      ['A again', 'in-target'],
      ['B again', 'in-target'],
      ['C again', 'elsewhere'],
      ['New twice', 'in-file'],
      ['C dup', 'elsewhere'],
    ]);
    expect(plan.counts).toEqual({
      bookmarksToCreate: 6,
      foldersToCreate: 4,
      bookmarksToSkip: 0,
      foldersToSkip: 0,
      invalid: 1,
      duplicatesInTarget: 2,
      duplicatesElsewhere: 2,
      duplicatesInFile: 1,
    });
  });

  it('skips every known URL with skip-anywhere and drops folders left with nothing to create', () => {
    const plan = planImport(file(), browserTree(), 'target', 'skip-anywhere');
    expect(plan.counts).toMatchObject({
      bookmarksToCreate: 1,
      foldersToCreate: 1,
      bookmarksToSkip: 5,
      foldersToSkip: 3,
    });
    const folder = plan.nodes[2];
    expect(folder).toMatchObject({ title: 'Folder', action: 'skip' });
    expect(folder.children?.map((child) => child.action)).toEqual(['skip', 'skip', 'skip']);
    expect(plan.nodes.map((node) => [node.title, node.action])).toEqual([
      ['A again', 'skip'],
      ['New', 'create'],
      ['Folder', 'skip'],
      ['Only dupes', 'skip'],
      ['Empty in file', 'create'],
    ]);
    expect(plan.conflicts.every((conflict) => conflict.skipped)).toBe(true);
  });

  it('skip-in-target keeps URLs that exist only outside the target', () => {
    const plan = planImport(file(), browserTree(), 'target', 'skip-in-target');
    expect(plan.conflicts.map(({ title, skipped }) => [title, skipped])).toEqual([
      ['A again', true],
      ['B again', true],
      ['C again', false],
      ['New twice', true],
      ['C dup', false],
    ]);
    expect(plan.counts).toMatchObject({ bookmarksToCreate: 3, bookmarksToSkip: 3 });
    // The target's subfolders count as the target, so B is a target duplicate.
    const otherTarget = planImport(file(), browserTree(), '2', 'skip-in-target');
    expect(otherTarget.conflicts.map(({ title, kind }) => [title, kind])).toEqual([
      ['A again', 'elsewhere'],
      ['B again', 'elsewhere'],
      ['C again', 'in-target'],
      ['New twice', 'in-file'],
      ['C dup', 'in-target'],
    ]);
  });

  it('keeps nested folder structure in plan order', () => {
    const plan = planImport(
      parseJson([
        {
          title: 'L1',
          children: [
            { title: 'L2', children: [{ title: 'Leaf', url: 'https://e2e.invalid/leaf' }] },
          ],
        },
      ]),
      browserTree(),
      'target',
      'skip-anywhere',
    );
    expect(plan.nodes).toEqual([
      {
        title: 'L1',
        action: 'create',
        children: [
          {
            title: 'L2',
            action: 'create',
            children: [{ title: 'Leaf', url: 'https://e2e.invalid/leaf', action: 'create' }],
          },
        ],
      },
    ]);
    expect(plan.counts).toMatchObject({ bookmarksToCreate: 1, foldersToCreate: 2 });
  });

  it('plans nothing for an empty file', () => {
    const plan = planImport(parseJson([]), browserTree(), 'target', 'import-all');
    expect(plan.nodes).toEqual([]);
    expect(plan.counts.bookmarksToCreate + plan.counts.foldersToCreate).toBe(0);
  });

  it('reports malformed entries as invalid without planning them', () => {
    const plan = planImport(
      parseJson([null, { url: 3 }, { title: 'Ok', url: 'https://e2e.invalid/ok' }]),
      browserTree(),
      'target',
      'import-all',
    );
    expect(plan.counts).toMatchObject({ bookmarksToCreate: 1, invalid: 2 });
  });

  it('rejects a missing, bookmark, root, or managed target', () => {
    for (const id of ['missing', 'a', '0', 'managed']) {
      expect(() => planImport(parseJson([]), browserTree(), id, 'import-all')).toThrow();
    }
  });

  it('never calls the browser while planning', () => {
    planImport(file(), browserTree(), 'target', 'import-all');
    expect(fakeBrowser.bookmarks.create).not.toHaveBeenCalled();
    expect(bookmarks.writes).toEqual([]);
  });

  it('detects a stale preview when the tree changed', () => {
    const before = planImport(file(), browserTree(), 'target', 'skip-anywhere');
    const changedTree = browserTree();
    changedTree[0].children?.[1].children?.push({
      id: 'new',
      parentId: '2',
      title: 'New',
      url: 'https://e2e.invalid/new',
    });
    const after = planImport(file(), changedTree, 'target', 'skip-anywhere');
    expect(
      isSameImportPlan(before, planImport(file(), browserTree(), 'target', 'skip-anywhere')),
    ).toBe(true);
    expect(isSameImportPlan(before, after)).toBe(false);
  });
});

describe('applying an import plan', () => {
  it('creates planned items, counts skips, and reports a partial failure', async () => {
    bookmarks.fail.create.add('Rejected');
    bookmarks.fail.create.add('Broken Folder');
    const plan = planImport(
      parseJson([
        { title: 'Ok', url: 'https://e2e.invalid/ok' },
        { title: 'Rejected', url: 'bad:url' },
        { title: 'Folder', children: [{ title: 'Inner', url: 'https://e2e.invalid/in' }] },
        { title: 'Broken Folder', children: [{ title: 'Lost', url: 'https://e2e.invalid/x' }] },
        { title: 'Dup', url: 'https://e2e.invalid/a' },
        5,
      ]),
      browserTree(),
      'target',
      'skip-anywhere',
    );
    const outcome = await applyImportPlan(plan);
    expect(outcome).toMatchObject({
      bookmarksCreated: 2,
      foldersCreated: 1,
      skipped: 2,
      failed: 3,
    });
    expect(outcome.errors).toEqual(['create failed: Rejected', 'create failed: Broken Folder']);
    expect(titles('target')).toEqual(['Ok', 'Folder']);
    const [, folderId] = bookmarks.childIds('target');
    expect(titles(folderId)).toEqual(['Inner']);
    expect(outcome.createdRootIds).toEqual(bookmarks.childIds('target'));
  });

  it('undo removes created items but keeps an imported folder the user added to', async () => {
    const plan = planImport(
      parseJson([
        { title: 'Link', url: 'https://e2e.invalid/link' },
        { title: 'Folder', children: [{ title: 'Inner', url: 'https://e2e.invalid/in' }] },
        { title: 'Other', children: [] },
      ]),
      browserTree(),
      'target',
      'import-all',
    );
    const outcome = await applyImportPlan(plan);
    const otherId = bookmarks.childIds('target')[2];
    await fakeBrowser.bookmarks.create({ parentId: otherId, title: 'Mine' });

    expect(await undoImport(outcome)).toEqual({ removed: 2, failed: 1 });
    expect(titles('target')).toEqual(['Other']);
    expect(titles(otherId)).toEqual(['Mine']);
  });
});
