import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookmarkTreeNode } from '@/types';
import { setLanguage } from '@/hooks/use-i18n';
import type { AISettings } from '@/services/ai-client';
import {
  applyReorganizationPlan,
  type CreateFolderOp,
  generateReorganizationPlan,
  type MoveBookmarkOp,
  type ReorganizationPlan,
} from '@/services/ai-reorganization';

const mocks = vi.hoisted(() => ({
  generateObject: vi.fn(),
  createAIModel: vi.fn(() => ({})),
  validateAISettings: vi.fn(),
  create: vi.fn(),
  removeTree: vi.fn(),
  update: vi.fn(),
  move: vi.fn(),
  getTree: vi.fn(),
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
vi.mock('wxt/browser', () => ({
  browser: {
    bookmarks: {
      create: mocks.create,
      removeTree: mocks.removeTree,
      update: mocks.update,
      move: mocks.move,
      getTree: mocks.getTree,
    },
  },
}));

const aiSettings: AISettings = {
  enabled: true,
  provider: 'openai',
  model: 'test-model',
  apiKey: 'synthetic-test-key',
};

const bookmarkTree: BookmarkTreeNode[] = [
  {
    id: '1',
    title: 'Bookmarks Bar',
    children: [
      {
        id: '10',
        title: 'Source',
        children: [
          { id: 'b1', title: 'One', url: 'https://one.example' },
          { id: 'b2', title: 'Two', url: 'https://two.example' },
          { id: 'b3', title: 'Three', url: 'https://three.example' },
        ],
      },
      { id: '20', title: 'Target', children: [] },
    ],
  },
];

function moveOperation(bookmarkId: string, confidence: number): MoveBookmarkOp {
  return {
    type: 'move',
    bookmarkId,
    bookmarkTitle: `Bookmark ${bookmarkId}`,
    bookmarkUrl: `https://${bookmarkId}.example`,
    fromFolderPath: 'Bookmarks Bar/Source',
    toFolderPath: 'Bookmarks Bar/Target',
    toFolderId: '20',
    confidence,
    reason: 'Synthetic test operation',
  };
}

function planWithOperations(
  operations: Array<MoveBookmarkOp | CreateFolderOp>,
): ReorganizationPlan {
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
  vi.clearAllMocks();
  setLanguage('en');
  mocks.validateAISettings.mockImplementation((settings: AISettings) => {
    if (!settings.enabled) throw new Error('AI features are disabled');
  });
  mocks.create.mockResolvedValue({ id: 'created-folder' });
  mocks.removeTree.mockResolvedValue(undefined);
  mocks.update.mockResolvedValue(undefined);
  mocks.move.mockResolvedValue(undefined);
});

describe('AI reorganization safety settings', () => {
  it('keeps provider calls behind the AI opt-in setting', async () => {
    await expect(
      generateReorganizationPlan(bookmarkTree, { ...aiSettings, enabled: false }),
    ).rejects.toThrow('AI features are disabled');
    expect(mocks.generateObject).not.toHaveBeenCalled();
    expect(mocks.move).not.toHaveBeenCalled();
  });

  it('batches synthetic provider requests, filters low-confidence moves, and never mutates during preview', async () => {
    mocks.generateObject
      .mockResolvedValueOnce({
        object: {
          operations: [
            {
              bookmarkId: 'b1',
              bookmarkTitle: 'One',
              toFolderPath: 'Bookmarks Bar/Target',
              confidence: 0.4,
              reason: 'Low confidence',
            },
            {
              bookmarkId: 'b2',
              bookmarkTitle: 'Two',
              toFolderPath: 'Bookmarks Bar/Target',
              confidence: 0.8,
              reason: 'High confidence',
            },
          ],
          summary: 'First batch',
        },
      })
      .mockResolvedValueOnce({
        object: {
          operations: [
            {
              bookmarkId: 'b3',
              bookmarkTitle: 'Three',
              toFolderPath: 'Bookmarks Bar/Target',
              confidence: 0.9,
              reason: 'High confidence',
            },
          ],
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
    expect(
      plan.operations.map((operation) => operation.type === 'move' && operation.bookmarkId),
    ).toEqual(['b2', 'b3']);
    expect(plan.safety).toMatchObject({
      dryRunFirst: true,
      minConfidence: 0.6,
      batchSize: 2,
      batchCount: 2,
      excludedLowConfidence: 1,
    });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.removeTree).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.move).not.toHaveBeenCalled();
  });

  it('blocks mutation when preview confirmation is required but absent', async () => {
    const result = await applyReorganizationPlan(planWithOperations([moveOperation('b1', 0.9)]));

    expect(result).toEqual({
      success: false,
      errors: ['Preview must be confirmed before applying reorganization changes'],
      applied: 0,
      skipped: 0,
    });
    expect(mocks.move).not.toHaveBeenCalled();
  });

  it('allows apply without preview confirmation when dry-run-first is disabled', async () => {
    const plan = planWithOperations([moveOperation('b1', 0.9)]);
    plan.safety.dryRunFirst = false;

    const result = await applyReorganizationPlan(plan);

    expect(result).toEqual({ success: true, errors: [], applied: 1, skipped: 0 });
    expect(mocks.move).toHaveBeenCalledWith('b1', { parentId: '20' });
  });

  it('skips low-confidence moves and continues after a partial apply failure', async () => {
    mocks.move.mockImplementation(async (bookmarkId: string) => {
      if (bookmarkId === 'b3') {
        throw new Error('Synthetic move failure');
      }
    });
    const plan = planWithOperations([
      moveOperation('b1', 0.9),
      moveOperation('b2', 0.5),
      moveOperation('b3', 0.8),
      moveOperation('b4', 0.95),
    ]);

    const result = await applyReorganizationPlan(plan, { previewConfirmed: true });

    expect(mocks.move.mock.calls.map(([bookmarkId]) => bookmarkId)).toEqual(['b1', 'b3', 'b4']);
    expect(result).toEqual({
      success: false,
      errors: ['Could not change "Bookmark b3": Synthetic move failure'],
      applied: 2,
      skipped: 1,
    });
  });

  it('creates new top-level folders in the bookmarks bar the browser reports', async () => {
    // Firefox: no folderType, fixed GUIDs, and the menu folder listed before the toolbar.
    mocks.getTree.mockResolvedValue([
      {
        id: 'root________',
        title: '',
        children: [
          { id: 'menu________', parentId: 'root________', title: 'Menu', children: [] },
          { id: 'toolbar_____', parentId: 'root________', title: 'Toolbar', children: [] },
        ],
      },
    ]);
    const plan = planWithOperations([
      { type: 'create', name: 'Reading', parentPath: '', description: 'Articles' },
      { ...moveOperation('b1', 0.9), toFolderId: undefined, toFolderPath: 'Reading' },
    ]);

    const result = await applyReorganizationPlan(plan, { previewConfirmed: true });

    expect(mocks.create).toHaveBeenCalledWith({ parentId: 'toolbar_____', title: 'Reading' });
    expect(mocks.move).toHaveBeenCalledWith('b1', { parentId: 'created-folder' });
    expect(result).toEqual({ success: true, errors: [], applied: 2, skipped: 0 });
  });
});
