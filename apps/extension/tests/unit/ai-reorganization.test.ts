import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import type { AISettings } from '@/services/ai-client';
import {
  applyReorganizationPlan,
  countPlannedNewFolders,
  generateReorganizationPlan,
  type MoveBookmarkOp,
  type ReorganizationPlan,
  stripLeadingFolder,
} from '@/services/ai-reorganization';
import type { BookmarkTreeNode } from '@/types';
import { type FakeBookmarks, installFakeBookmarks } from '../fake-bookmarks';

const mocks = vi.hoisted(() => ({
  generateObject: vi.fn(),
  createAIModel: vi.fn(() => ({})),
  validateAISettings: vi.fn(),
}));

vi.mock('ai', () => ({ generateObject: mocks.generateObject }));
vi.mock('@/services/ai-client', () => ({
  createAIModel: mocks.createAIModel,
  validateAISettings: mocks.validateAISettings,
}));
vi.mock('@/lib/logger', () => ({
  aiLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

const aiSettings: AISettings = {
  enabled: true,
  provider: 'openai',
  model: 'test-model',
  apiKey: 'synthetic-test-key',
};

/** Root > Bookmarks Bar > Source (One, Two, Three), Target; Root > Other Bookmarks. */
const bookmarkTree: BookmarkTreeNode[] = [
  {
    id: '0',
    title: '',
    children: [
      {
        id: '1',
        parentId: '0',
        title: 'Bookmarks Bar',
        folderType: 'bookmarks-bar',
        children: [
          {
            id: '10',
            parentId: '1',
            title: 'Source',
            children: [
              { id: 'b1', parentId: '10', title: 'One', url: 'https://one.example' },
              { id: 'b2', parentId: '10', title: 'Two', url: 'https://two.example' },
              { id: 'b3', parentId: '10', title: 'Three', url: 'https://three.example' },
            ],
          },
          { id: '20', parentId: '1', title: 'Target', children: [] },
        ],
      },
      { id: '2', parentId: '0', title: 'Other Bookmarks', children: [] },
    ],
  },
];

const sourceFolder = bookmarkTree[0].children?.[0].children?.[0] as BookmarkTreeNode;

function suggest(bookmarkId: string, toFolderPath: string, confidence = 0.9) {
  return { bookmarkId, bookmarkTitle: bookmarkId, toFolderPath, confidence, reason: 'r' };
}

function moveOperation(
  bookmarkId: string,
  confidence: number,
  overrides: Partial<MoveBookmarkOp> = {},
): MoveBookmarkOp {
  return {
    type: 'move',
    bookmarkId,
    bookmarkTitle: `Bookmark ${bookmarkId}`,
    bookmarkUrl: `https://${bookmarkId}.example`,
    fromFolderId: '10',
    fromFolderPath: 'Bookmarks Bar/Source',
    toFolderPath: 'Bookmarks Bar/Target',
    toFolderId: '20',
    newFolderTitles: [],
    confidence,
    reason: 'Synthetic test operation',
    ...overrides,
  };
}

function planWithOperations(operations: MoveBookmarkOp[]): ReorganizationPlan {
  return {
    operations,
    summary: 'Synthetic plan',
    createdAt: 1,
    safety: {
      dryRunFirst: true,
      minConfidence: 0.6,
      batchSize: 2,
      batchCount: 1,
      excludedLowConfidence: 0,
    },
  };
}

beforeEach(() => {
  fakeBrowser.reset();
  vi.clearAllMocks();
  setLanguage('en');
  mocks.validateAISettings.mockImplementation((settings: AISettings) => {
    if (!settings.enabled) throw new Error('AI features are disabled');
  });
});

describe('AI reorganization safety settings', () => {
  it('keeps provider calls behind the AI opt-in setting', async () => {
    await expect(
      generateReorganizationPlan(bookmarkTree, { ...aiSettings, enabled: false }),
    ).rejects.toThrow('AI features are disabled');
    expect(mocks.generateObject).not.toHaveBeenCalled();
  });

  it('batches synthetic provider requests, filters low-confidence moves, and never mutates during preview', async () => {
    const bookmarks = installFakeBookmarks([]);
    mocks.generateObject
      .mockResolvedValueOnce({
        object: {
          operations: [
            suggest('b1', 'Bookmarks Bar/Target', 0.4),
            suggest('b2', 'Bookmarks Bar/Target', 0.8),
          ],
          summary: 'First batch',
        },
      })
      .mockResolvedValueOnce({
        object: {
          operations: [suggest('b3', 'Bookmarks Bar/Target', 0.9)],
          summary: 'Second batch',
        },
      });

    const plan = await generateReorganizationPlan(bookmarkTree, aiSettings, {
      dryRunFirst: true,
      minConfidence: 0.6,
      batchSize: 2,
    });

    expect(mocks.generateObject).toHaveBeenCalledTimes(2);
    const requestSizes = mocks.generateObject.mock.calls.map(([request]) => {
      return JSON.parse(request.prompt).bookmarks.length;
    });
    expect(requestSizes).toEqual([2, 1]);
    expect(plan.operations.map((operation) => operation.bookmarkId)).toEqual(['b2', 'b3']);
    expect(plan.safety).toMatchObject({
      dryRunFirst: true,
      minConfidence: 0.6,
      batchSize: 2,
      batchCount: 2,
      excludedLowConfidence: 1,
    });
    expect(bookmarks.writes).toEqual([]);
  });

  it('blocks mutation when preview confirmation is required but absent', async () => {
    const bookmarks = installFakeBookmarks([]);
    const result = await applyReorganizationPlan(planWithOperations([moveOperation('b1', 0.9)]));

    expect(result).toEqual({
      status: 'blocked',
      error: 'Preview must be confirmed before applying reorganization changes',
    });
    expect(bookmarks.writes).toEqual([]);
  });
});

describe('planning target folders', () => {
  it('keeps existing targets, plans missing folders under the deepest existing one, and drops no-op moves', async () => {
    mocks.generateObject.mockResolvedValue({
      object: {
        operations: [
          suggest('b1', 'Bookmarks Bar/Target'),
          suggest('b2', 'Bookmarks Bar/Target/Docs'),
          suggest('b3', ' Reading / Later '),
          suggest('b4', '/'),
        ],
        summary: 'New folders',
      },
    });
    const tree = structuredClone(bookmarkTree);
    tree[0].children?.[0].children?.[0].children?.push({
      id: 'b4',
      parentId: '10',
      title: 'Four',
      url: 'https://four.example',
    });

    const plan = await generateReorganizationPlan(tree, aiSettings);
    expect(
      plan.operations.map(
        ({ bookmarkId, fromFolderId, toFolderId, toFolderPath, newFolderTitles }) => ({
          bookmarkId,
          fromFolderId,
          toFolderId,
          toFolderPath,
          newFolderTitles,
        }),
      ),
    ).toEqual([
      {
        bookmarkId: 'b1',
        fromFolderId: '10',
        toFolderId: '20',
        toFolderPath: 'Bookmarks Bar/Target',
        newFolderTitles: [],
      },
      {
        bookmarkId: 'b2',
        fromFolderId: '10',
        toFolderId: '20',
        toFolderPath: 'Bookmarks Bar/Target/Docs',
        newFolderTitles: ['Docs'],
      },
      // A path that starts with no existing folder becomes a new category on the bookmarks bar.
      {
        bookmarkId: 'b3',
        fromFolderId: '10',
        toFolderId: '1',
        toFolderPath: 'Bookmarks Bar/Reading/Later',
        newFolderTitles: ['Reading', 'Later'],
      },
    ]);
    expect(countPlannedNewFolders(plan)).toBe(3);
  });

  it('creates new categories inside the folder a folder-scoped run covers', async () => {
    mocks.generateObject.mockResolvedValue({
      object: { operations: [suggest('b1', 'Ideas'), suggest('b2', 'Source')], summary: '' },
    });

    const plan = await generateReorganizationPlan([sourceFolder], aiSettings);
    expect(plan.operations).toEqual([
      expect.objectContaining({
        bookmarkId: 'b1',
        toFolderId: '10',
        toFolderPath: 'Source/Ideas',
        newFolderTitles: ['Ideas'],
      }),
    ]);
  });
});

describe('applying a reorganization plan', () => {
  let bookmarks: FakeBookmarks;
  const titlesIn = (folderId: string) =>
    bookmarks.childIds(folderId).map((id) => bookmarks.get(id)?.title);

  beforeEach(() => {
    bookmarks = installFakeBookmarks([
      { id: '1', title: 'Bookmarks Bar' },
      { id: '2', title: 'Other Bookmarks' },
      { id: '10', parentId: '1', title: 'Source' },
      { id: '20', parentId: '1', title: 'Target' },
      ...['b1', 'b2', 'b3', 'b4'].map((id) => ({
        id,
        parentId: '10',
        title: `Bookmark ${id}`,
        url: `https://${id}.example`,
      })),
    ]);
  });

  it('allows apply without preview confirmation when dry-run-first is disabled', async () => {
    const plan = planWithOperations([moveOperation('b1', 0.9)]);
    plan.safety.dryRunFirst = false;

    const result = await applyReorganizationPlan(plan);

    expect(result).toMatchObject({ status: 'applied', applied: 1, skipped: 0, failed: 0 });
    expect(titlesIn('20')).toEqual(['Bookmark b1']);
  });

  it('skips low-confidence moves and continues after a failed move', async () => {
    bookmarks.fail.move.add('b3');
    const plan = planWithOperations([
      moveOperation('b1', 0.9),
      moveOperation('b2', 0.5),
      moveOperation('b3', 0.8),
      moveOperation('b4', 0.95),
    ]);

    const result = await applyReorganizationPlan(plan, { previewConfirmed: true });

    expect(result).toMatchObject({
      status: 'applied',
      applied: 2,
      skipped: 0,
      failed: 1,
      issues: [{ id: 'b3', title: 'Bookmark b3', reason: 'failed' }],
    });
    expect(titlesIn('20')).toEqual(['Bookmark b1', 'Bookmark b4']);
    expect(titlesIn('10')).toEqual(['Bookmark b2', 'Bookmark b3']);
  });

  it('never moves a bookmark the user moved, edited, or deleted after the preview', async () => {
    const plan = planWithOperations([
      moveOperation('b1', 0.9),
      moveOperation('b2', 0.9),
      moveOperation('b3', 0.9),
      moveOperation('b4', 0.9),
    ]);
    await fakeBrowser.bookmarks.move('b2', { parentId: '2' });
    await fakeBrowser.bookmarks.update('b3', { url: 'https://elsewhere.example' });
    await fakeBrowser.bookmarks.removeTree('b4');

    const result = await applyReorganizationPlan(plan, { previewConfirmed: true });

    expect(result).toMatchObject({ applied: 1, skipped: 3, failed: 0 });
    expect(titlesIn('20')).toEqual(['Bookmark b1']);
    expect(titlesIn('2')).toEqual(['Bookmark b2']);
    expect(titlesIn('10')).toEqual(['Bookmark b3']);
  });

  it('creates missing target folders once and undo moves everything back and removes them', async () => {
    const plan = planWithOperations([
      moveOperation('b1', 0.9, { newFolderTitles: ['Reading', 'Later'], toFolderId: '1' }),
      moveOperation('b2', 0.9, { newFolderTitles: ['Reading'], toFolderId: '1' }),
      moveOperation('b3', 0.9, { newFolderTitles: ['Reading', 'Later'], toFolderId: '1' }),
      moveOperation('b4', 0.9),
    ]);

    const result = await applyReorganizationPlan(plan, { previewConfirmed: true });
    if (result.status !== 'applied') throw new Error('not applied');
    expect(result).toMatchObject({ applied: 4, foldersCreated: 2, skipped: 0, failed: 0 });
    expect(titlesIn('1')).toEqual(['Source', 'Target', 'Reading']);
    const [readingId] = bookmarks.childIds('1').slice(-1);
    expect(titlesIn(readingId)).toEqual(['Later', 'Bookmark b2']);
    const [laterId] = bookmarks.childIds(readingId);
    expect(titlesIn(laterId)).toEqual(['Bookmark b1', 'Bookmark b3']);

    expect(await result.undo()).toEqual({ restored: 4, failed: 0 });
    expect(titlesIn('10')).toEqual(['Bookmark b1', 'Bookmark b2', 'Bookmark b3', 'Bookmark b4']);
    expect(titlesIn('1')).toEqual(['Source', 'Target']);
    expect(titlesIn('20')).toEqual([]);
  });

  it('reuses a folder with the suggested title that exists by the time the plan is applied', async () => {
    await fakeBrowser.bookmarks.create({ parentId: '1', title: 'Reading' });
    const plan = planWithOperations([
      moveOperation('b1', 0.9, { newFolderTitles: ['Reading'], toFolderId: '1' }),
    ]);

    const result = await applyReorganizationPlan(plan, { previewConfirmed: true });
    expect(result).toMatchObject({ applied: 1, foldersCreated: 0 });
    expect(titlesIn('1')).toEqual(['Source', 'Target', 'Reading']);
  });

  it('undo leaves bookmarks moved again and created folders the user added to', async () => {
    const plan = planWithOperations([
      moveOperation('b1', 0.9, { newFolderTitles: ['Reading'], toFolderId: '1' }),
      moveOperation('b2', 0.9),
    ]);
    const result = await applyReorganizationPlan(plan, { previewConfirmed: true });
    if (result.status !== 'applied') throw new Error('not applied');
    const readingId = bookmarks.childIds('1')[2];
    await fakeBrowser.bookmarks.create({
      parentId: readingId,
      title: 'Mine',
      url: 'https://m.example',
    });
    await fakeBrowser.bookmarks.move('b2', { parentId: '2' });

    expect(await result.undo()).toEqual({ restored: 1, failed: 1 });
    expect(titlesIn('10')).toEqual(['Bookmark b1', 'Bookmark b3', 'Bookmark b4']);
    expect(titlesIn('2')).toEqual(['Bookmark b2']);
    expect(titlesIn(readingId)).toEqual(['Mine']);
  });
});

describe('plan paths for display', () => {
  it('drops the bookmarks bar title the browser reports, in any language', () => {
    expect(stripLeadingFolder('Favorites bar/Work/Docs', 'Favorites bar')).toBe('Work/Docs');
    expect(stripLeadingFolder('ブックマーク バー/仕事', 'ブックマーク バー')).toBe('仕事');
    expect(stripLeadingFolder('Bookmarks Toolbar/News', 'Bookmarks Toolbar')).toBe('News');
  });

  it('keeps other paths, the bar itself, and look-alike prefixes', () => {
    expect(stripLeadingFolder('Other Bookmarks/Work', 'Bookmarks Bar')).toBe(
      'Other Bookmarks/Work',
    );
    expect(stripLeadingFolder('Bookmarks Bar', 'Bookmarks Bar')).toBe('Bookmarks Bar');
    expect(stripLeadingFolder('Bookmarks Bar 2/Work', 'Bookmarks Bar')).toBe(
      'Bookmarks Bar 2/Work',
    );
    expect(stripLeadingFolder('Bookmarks Bar/Work', undefined)).toBe('Bookmarks Bar/Work');
  });
});
