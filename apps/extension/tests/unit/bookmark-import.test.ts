import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import { bookmarkMetadataValue } from '@/lib/bookmark-metadata-storage';
import { buildExportRoot, jsonFormat } from '@/services/bookmark-export';
import {
  applyImportPlan,
  isSameImportPlan,
  jsonImportFormat,
  listImportTargets,
  parseBookmarks,
  planImport,
} from '@/services/bookmark-import';
import type { BookmarkTreeNode } from '@/types';
import { type FakeBookmarks, installFakeBookmarks } from '../fake-bookmarks';
import { auditRecords, resetAuditDatabase } from './audit-helpers';

/** The browser side: an empty import target folder. */
let bookmarks: FakeBookmarks;

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  setLanguage('en');
  bookmarks = installFakeBookmarks([
    { id: 'target', title: 'Target' },
    { id: 'other', title: 'Other folder' },
  ]);
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

  it('counts entries whose URL the browser cannot store as invalid', () => {
    const result = parseJson([
      { title: 'Good', url: 'https://e2e.invalid/good' },
      { title: 'Broken', url: 'not a url' },
      { title: 'Folder', children: [{ title: 'Half', url: 'https//missing-colon' }] },
    ]);
    expect(result.bookmarks.map((node) => node.title)).toEqual(['Good', 'Folder']);
    expect(result.bookmarks[1].children).toEqual([]);
    expect(result).toMatchObject({ bookmarkCount: 1, folderCount: 1, skipped: 2 });
    const plan = planImport(result, browserTree(), 'target', 'import-all');
    expect(plan.counts).toMatchObject({ bookmarksToCreate: 1, invalid: 2 });
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
      separatorsToCreate: 0,
      separatorsUnsupported: 0,
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
    // Each error names its entry, so the user can tell which one to fix.
    expect(outcome.errors).toEqual([
      'Could not import "Rejected": create failed: Rejected',
      'Could not import "Broken Folder": create failed: Broken Folder',
    ]);
    expect(titles('target')).toEqual(['Ok', 'Folder']);
    const [, folderId] = bookmarks.childIds('target');
    expect(titles(folderId)).toEqual(['Inner']);
    expect(outcome.createdRootIds).toEqual(bookmarks.childIds('target'));
  });

  it('gives each created bookmark its own tags and summary from a JSON export, also when URLs repeat', async () => {
    const exported = jsonFormat.serialize(
      buildExportRoot([
        {
          id: 'f',
          title: 'Saved',
          children: [
            { id: 'a', parentId: 'f', title: 'Tagged', url: 'https://e2e.invalid/tagged' },
            { id: 'b', parentId: 'f', title: 'Plain', url: 'https://e2e.invalid/plain' },
            // Two bookmarks of one URL, each with its own tags and summary.
            { id: 'd1', parentId: 'f', title: 'Same page, work', url: 'https://e2e.invalid/same' },
            { id: 'd2', parentId: 'f', title: 'Same page, home', url: 'https://e2e.invalid/same' },
          ],
        },
      ]),
      {
        metadata: {
          a: { tags: ['docs'], summary: 'A guide' },
          d1: { tags: ['work'], summary: 'For work' },
          d2: { tags: ['home'] },
          other: { tags: ['not exported'] },
        },
      },
    );
    const file = JSON.parse(exported);
    expect(file.metadata).toBeUndefined();
    expect(file.children[0].children).toEqual([
      {
        title: 'Tagged',
        url: 'https://e2e.invalid/tagged',
        tags: ['docs'],
        summary: 'A guide',
      },
      { title: 'Plain', url: 'https://e2e.invalid/plain' },
      {
        title: 'Same page, work',
        url: 'https://e2e.invalid/same',
        tags: ['work'],
        summary: 'For work',
      },
      { title: 'Same page, home', url: 'https://e2e.invalid/same', tags: ['home'] },
    ]);

    const plan = planImport(
      parseBookmarks(exported, jsonImportFormat),
      browserTree(),
      'target',
      'import-all',
    );
    await applyImportPlan(plan);
    const [folderId] = bookmarks.childIds('target');
    const [tagged, plain, work, home] = bookmarks.childIds(folderId);
    expect(plain).toBeDefined();
    expect(await bookmarkMetadataValue.get()).toEqual({
      [tagged]: { tags: ['docs'], summary: 'A guide' },
      [work]: { tags: ['work'], summary: 'For work' },
      [home]: { tags: ['home'] },
    });
  });

  it('still reads tags and summaries by URL from an export made before they were per bookmark', async () => {
    const older = JSON.stringify({
      title: 'Bookmarks',
      children: [
        { title: 'Tagged', url: 'https://e2e.invalid/tagged' },
        { title: 'Dup', url: 'https://e2e.invalid/a' },
      ],
      metadata: {
        'https://e2e.invalid/tagged': { tags: ['docs'], summary: 'A guide' },
        'https://e2e.invalid/a': { tags: ['skipped'] },
      },
    });
    const plan = planImport(
      parseBookmarks(older, jsonImportFormat),
      browserTree(),
      'target',
      'skip-anywhere',
    );
    await applyImportPlan(plan);
    const [tagged] = bookmarks.childIds('target');
    // The duplicate was skipped, so its tags have no bookmark to go to.
    expect(await bookmarkMetadataValue.get()).toEqual({
      [tagged]: { tags: ['docs'], summary: 'A guide' },
    });
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

    expect(await outcome.undo()).toEqual({ removed: 2, failed: 1 });
    // Undo runs once; a second call reports the first result without touching bookmarks.
    expect(await outcome.undo()).toEqual({ removed: 2, failed: 1 });
    expect(titles('target')).toEqual(['Other']);
    expect(titles(otherId)).toEqual(['Mine']);
  });

  it('undo keeps imported items the user edited, moved, or re-tagged since (L23)', async () => {
    const plan = planImport(
      parseJson([
        { title: 'Renamed later', url: 'https://e2e.invalid/renamed' },
        { title: 'Folder', children: [{ title: 'Inner', url: 'https://e2e.invalid/inner' }] },
        { title: 'Re-addressed', url: 'https://e2e.invalid/old' },
        { title: 'Tagged later', url: 'https://e2e.invalid/tagged' },
        { title: 'Moved out', url: 'https://e2e.invalid/moved' },
        { title: 'Untouched', url: 'https://e2e.invalid/untouched' },
      ]),
      browserTree(),
      'target',
      'import-all',
    );
    const outcome = await applyImportPlan(plan);
    const [renamed, folder, readdressed, tagged, moved] = bookmarks.childIds('target');
    const [inner] = bookmarks.childIds(folder);
    await fakeBrowser.bookmarks.update(renamed, { title: 'My name' });
    await fakeBrowser.bookmarks.update(inner, { title: 'Edited inside' });
    await fakeBrowser.bookmarks.update(readdressed, { url: 'https://e2e.invalid/new' });
    await bookmarkMetadataValue.set({ [tagged]: { tags: ['mine'] } });
    await fakeBrowser.bookmarks.move(moved, { parentId: 'other' });

    expect(await outcome.undo()).toEqual({ removed: 1, failed: 5 });
    expect(titles('target')).toEqual(['My name', 'Folder', 'Re-addressed', 'Tagged later']);
    expect(titles(folder)).toEqual(['Edited inside']);
    expect(bookmarks.get(moved)?.parentId).toBe('other');
  });
});

describe('imports in the History', () => {
  it('records one import as one record, with what the browser rejected', async () => {
    await resetAuditDatabase();
    bookmarks.fail.create.add('Rejected');
    const plan = planImport(
      parseJson([
        { title: 'Kept', url: 'https://e2e.invalid/kept' },
        { title: 'Rejected', url: 'https://e2e.invalid/rejected' },
        { title: 'Folder', children: [{ title: 'Inner', url: 'https://e2e.invalid/inner' }] },
      ]),
      browserTree(),
      'target',
      'import-all',
    );
    await applyImportPlan(plan);
    const [record, ...others] = await auditRecords();
    expect(others).toEqual([]);
    expect(record).toMatchObject({
      source: 'import',
      label: { action: 'add', count: 3, tool: 'tools_import' },
      state: 'partially_applied',
      counts: { applied: 3, failed: 1 },
    });
  });
});
