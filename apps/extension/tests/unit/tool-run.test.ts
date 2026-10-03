import { DOMParser as LinkedomParser } from 'linkedom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { TOOL_DEFINITIONS, type ToolOutcome } from '@/components/bookmarks/tools/tool-definitions';
import {
  createToolRun,
  type ToolRunDeps,
  type UndoOffer,
} from '@/components/bookmarks/tools/tool-run';
import { setLanguage } from '@/hooks/use-i18n';
import { bookmarkMetadataValue } from '@/lib/bookmark-metadata-storage';
import { defaultSettings, type Settings } from '@/lib/settings-schema';
import { saveSettings } from '@/lib/settings-storage';
import type { AISettings } from '@/services/ai-client';
import { getScopedNodes } from '@/services/bookmark-tooling';
import { BOOKMARK_DELETION_UNDO_WINDOW_MS } from '@/services/bookmarks';
import type { BookmarkTreeNode } from '@/types';
import { type FakeBookmarks, installFakeBookmarks } from '../fake-bookmarks';

// The AI tests stub the `ai` SDK: they check the run's contract, not live provider compatibility.
const mocks = vi.hoisted(() => ({
  generateObject: vi.fn(),
  createAIModel: vi.fn(() => ({ provider: 'synthetic' })),
  validateAISettings: vi.fn(),
}));
vi.mock('ai', () => ({ generateObject: mocks.generateObject }));
vi.mock('@/services/ai-client', () => ({
  createAIModel: mocks.createAIModel,
  validateAISettings: mocks.validateAISettings,
}));

const FOLDER = 'folder';

const aiService: AISettings = {
  enabled: true,
  provider: 'custom',
  model: 'synthetic-model',
  apiKey: '',
  baseUrl: 'https://provider.invalid/v1',
};

type Notice = { outcome: ToolOutcome; undo?: UndoOffer };

let bookmarks: FakeBookmarks;
let tree: BookmarkTreeNode[];
let notices: Notice[];
let settings: Settings;

const seed = (items: Array<{ id: string; title: string; url: string }>) => {
  bookmarks = installFakeBookmarks([
    { id: FOLDER, title: 'Folder' },
    ...items.map((item) => ({ ...item, parentId: FOLDER })),
  ]);
};

const readTree = async () => (await fakeBrowser.bookmarks.getTree()) as BookmarkTreeNode[];

function deps(overrides: Partial<ToolRunDeps> = {}): ToolRunDeps {
  return {
    settings: () => settings,
    nodes: (scope) => getScopedNodes(tree, FOLDER, scope),
    freshNodes: async (scope) => getScopedNodes(await readTree(), FOLDER, scope),
    refresh: async () => {
      tree = await readTree();
    },
    aiSettings: async () => aiService,
    saveFile: (_request, write) => write(_request.nodes),
    notify: (outcome, undo) => notices.push({ outcome, undo }),
    ...overrides,
  };
}

const titles = () => bookmarks.childIds(FOLDER).map((id) => bookmarks.get(id)?.title);

beforeEach(async () => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  mocks.generateObject.mockReset();
  // Services that read stored settings switch the language to it, so store English too.
  await saveSettings({ language: 'en' });
  setLanguage('en');
  settings = { ...defaultSettings, language: 'en' };
  notices = [];
});

describe('duplicates', () => {
  beforeEach(async () => {
    seed([
      { id: 'a1', title: 'A1', url: 'https://e2e.invalid/a' },
      { id: 'a2', title: 'A2', url: 'https://e2e.invalid/a' },
      { id: 'a3', title: 'A3', url: 'https://e2e.invalid/a' },
      { id: 'b1', title: 'B1', url: 'https://e2e.invalid/b' },
    ]);
    settings = { ...settings, duplicatesKeepRule: 'first' };
    tree = await readTree();
  });

  it('scans, removes the extras, closes the review, and undoes once from the toast', async () => {
    const run = createToolRun(TOOL_DEFINITIONS.duplicates, deps());
    await run.run('folder');
    expect(run.getState()).toMatchObject({ phase: 'review', open: true });
    expect(run.getState().result?.groups).toHaveLength(1);

    await run.apply();
    expect(titles()).toEqual(['A1', 'B1']);
    expect(run.getState()).toMatchObject({ phase: 'done', open: false });
    const [removal] = notices;
    expect(removal.outcome).toMatchObject({
      title: 'Duplicates removed',
      description: '2 duplicate bookmarks removed',
      variant: 'success',
    });

    void removal.undo?.run();
    void removal.undo?.run();
    await vi.waitFor(() => expect(notices).toHaveLength(2));
    expect(titles()).toEqual(['A1', 'A2', 'A3', 'B1']);
    expect(notices[1].outcome).toMatchObject({
      title: 'Deletion undone',
      description:
        'Restored: 2. Could not restore: 0. Restored bookmarks count as newly added, so a keep ' +
        'rule based on date may keep a different copy next time.',
    });
    expect(notices[1].undo).toBeUndefined();
    // The dialog's Undo shares the toast's single revert.
    await run.undo();
    expect(notices).toHaveLength(2);
  });

  it('closes the toast when Undo is used from the review', async () => {
    const run = createToolRun(TOOL_DEFINITIONS.duplicates, deps());
    await run.run('folder');
    await fakeBrowser.bookmarks.update('a2', { url: 'https://e2e.invalid/edited' });
    await run.apply();
    const undoToast = { dismiss: vi.fn() };
    notices[0].undo?.attach(undoToast);

    await run.undo();
    expect(undoToast.dismiss).toHaveBeenCalledOnce();
    expect(titles()).toEqual(['A1', 'A2', 'A3', 'B1']);
  });

  describe('when the undo window passes', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    const applyPartially = async () => {
      const run = createToolRun(TOOL_DEFINITIONS.duplicates, deps());
      await run.run('folder');
      await fakeBrowser.bookmarks.update('a2', { url: 'https://e2e.invalid/edited' });
      await run.apply();
      expect(run.getState().notice).toMatchObject({ canUndo: true });
      return run;
    };

    it('hides Undo in the review and the toast and never reverts', async () => {
      const run = await applyPartially();
      const undoToast = { dismiss: vi.fn() };
      notices[0].undo?.attach(undoToast);

      vi.advanceTimersByTime(BOOKMARK_DELETION_UNDO_WINDOW_MS + 1);
      // The partial outcome stays readable without its Undo.
      expect(run.getState().notice).toEqual({
        message: 'Removed: 1. Skipped because they changed or were already removed: 1. Failed: 0.',
        canUndo: false,
      });
      expect(undoToast.dismiss).toHaveBeenCalledOnce();

      await run.undo();
      await notices[0].undo?.run();
      expect(titles()).toEqual(['A1', 'A2', 'B1']);
      // No "could not undo" report either.
      expect(notices).toHaveLength(1);
    });

    it('checks the clock when a late timer has not fired yet', async () => {
      const run = await applyPartially();
      vi.setSystemTime(Date.now() + BOOKMARK_DELETION_UNDO_WINDOW_MS + 1);

      await run.undo();
      expect(titles()).toEqual(['A1', 'A2', 'B1']);
      expect(run.getState().notice).toMatchObject({ canUndo: false });
      expect(notices).toHaveLength(1);
    });
  });

  it('keeps a partial removal open, rescanned, with an undo notice', async () => {
    const run = createToolRun(TOOL_DEFINITIONS.duplicates, deps());
    await run.run('folder');
    await fakeBrowser.bookmarks.update('a2', { url: 'https://e2e.invalid/edited' });

    await run.apply();
    expect(titles()).toEqual(['A1', 'A2', 'B1']);
    const state = run.getState();
    expect(state).toMatchObject({ phase: 'review', open: true, notice: { canUndo: true } });
    expect(state.notice?.message).toBe(
      'Removed: 1. Skipped because they changed or were already removed: 1. Failed: 0.',
    );
    expect(state.result?.groups).toEqual([]);
    expect(notices[0].outcome).toMatchObject({
      title: 'Some duplicates were not removed',
      variant: 'destructive',
    });

    await run.undo();
    expect(titles()).toEqual(['A1', 'A2', 'A3', 'B1']);
    expect(run.getState().notice).toBeNull();
    // The rescan after undo sees the restored duplicate again.
    expect(run.getState().result?.groups).toHaveLength(1);
  });

  it('offers no undo when nothing was removed', async () => {
    const run = createToolRun(TOOL_DEFINITIONS.duplicates, deps());
    await run.run('folder');
    await fakeBrowser.bookmarks.update('a1', { url: 'https://e2e.invalid/moved' });

    await run.apply();
    expect(run.getState().notice).toMatchObject({ canUndo: false });
    expect(notices[0].undo).toBeUndefined();
  });
});

describe('URL cleaner', () => {
  it('cleans unchanged bookmarks, skips edited ones, and reports a partial result', async () => {
    seed([
      { id: '1', title: 'One', url: 'https://e2e.invalid/a?utm_source=x' },
      { id: '2', title: 'Two', url: 'https://e2e.invalid/b?utm_source=x' },
      { id: '3', title: 'Three', url: 'https://e2e.invalid/c?utm_source=x' },
    ]);
    bookmarks.fail.update.add('3');
    tree = await readTree();
    const run = createToolRun(TOOL_DEFINITIONS.urlCleaner, deps());
    await run.run('all');
    expect(run.getState().result?.previews).toHaveLength(3);
    await fakeBrowser.bookmarks.update('2', { url: 'https://e2e.invalid/edited' });

    await run.apply();
    expect(bookmarks.get('1')?.url).toBe('https://e2e.invalid/a');
    expect(bookmarks.get('2')?.url).toBe('https://e2e.invalid/edited');
    expect(run.getState()).toMatchObject({ phase: 'done', open: false });
    expect(notices[0].outcome).toEqual({
      title: 'Some URLs were not cleaned',
      description: 'Updated: 1. Skipped because they changed after the preview: 1. Failed: 1.',
      variant: 'destructive',
    });
    expect(notices[0].undo).toBeUndefined();
  });
});

describe('network tools', () => {
  const fetchMock = vi.fn();
  beforeEach(async () => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('DOMParser', LinkedomParser);
    seed([
      { id: '1', title: 'Old one', url: 'https://e2e.invalid/1' },
      { id: '2', title: 'Old two', url: 'https://e2e.invalid/2' },
      { id: '3', title: 'Script', url: 'javascript:void(0)' },
    ]);
    tree = await readTree();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('applies only the picked metadata titles and skips ones renamed since the scan', async () => {
    fetchMock.mockImplementation(
      async (url: string) =>
        new Response(`<html><head><title>New ${url.slice(-1)}</title></head></html>`, {
          headers: { 'content-type': 'text/html' },
        }),
    );
    const run = createToolRun(TOOL_DEFINITIONS.metadataFetcher, deps());
    await run.run('all');
    const items = run.getState().result?.items ?? [];
    expect(items.map((item) => item.suggestedTitle)).toEqual(['New 1', 'New 2', undefined]);
    await fakeBrowser.bookmarks.update('2', { title: 'Renamed by user' });

    await run.apply(items.slice(0, 2));
    expect(titles()).toEqual(['New 1', 'Renamed by user', 'Script']);
    expect(notices[0].outcome).toMatchObject({
      title: 'Some titles were not updated',
      description: 'Updated: 1. Skipped because they changed after the scan: 1. Failed: 0.',
    });
  });

  it('opens the dead-link review without an apply step', async () => {
    fetchMock.mockImplementation(async (url: string) => ({
      status: url.endsWith('/2') ? 404 : 200,
      ok: !url.endsWith('/2'),
      redirected: false,
      url: '',
      body: { cancel: vi.fn(async () => undefined) },
    }));
    const run = createToolRun(TOOL_DEFINITIONS.deadLinks, deps());
    await run.run('all');
    expect(run.getState()).toMatchObject({ phase: 'review', open: true });
    expect(run.getState().result?.items.map((item) => item.status)).toEqual([
      'ok',
      'error',
      'skipped',
    ]);
    await run.apply();
    expect(notices).toEqual([]);
  });

  it('reports a failed scan as a toast and leaves the review closed', async () => {
    // The site icon scan reads the saved icons first.
    vi.spyOn(fakeBrowser.storage.local, 'get').mockRejectedValue(new Error('storage down'));
    const run = createToolRun(TOOL_DEFINITIONS.siteIcons, deps());
    await run.run('all');
    expect(run.getState()).toMatchObject({ phase: 'idle', open: false });
    expect(notices[0].outcome).toEqual({
      title: 'Tool failed',
      description: 'storage down',
      variant: 'destructive',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('AI tools', () => {
  beforeEach(async () => {
    seed([{ id: '1', title: 'Paper', url: 'https://e2e.invalid/paper' }]);
    tree = await readTree();
  });

  it('checks that AI is on before reading the AI service', async () => {
    const aiSettings = vi.fn(async () => aiService);
    settings = { ...settings, aiEnabled: false };
    const run = createToolRun(TOOL_DEFINITIONS.autoTagging, deps({ aiSettings }));
    await run.run('folder');
    expect(aiSettings).not.toHaveBeenCalled();
    expect(mocks.generateObject).not.toHaveBeenCalled();
    expect(notices[0].outcome.description).toBe('AI features are disabled');
  });

  it('[mocked provider contract] saves reviewed tags to bookmark metadata', async () => {
    settings = { ...settings, aiEnabled: true };
    mocks.generateObject.mockResolvedValue({
      object: { items: [{ bookmarkId: '1', title: 'Paper', tags: ['research'], reason: 'r' }] },
    });
    const run = createToolRun(TOOL_DEFINITIONS.autoTagging, deps());
    await run.run('folder');
    expect(run.getState().result).toEqual([
      expect.objectContaining({ bookmarkId: '1', tags: ['research'] }),
    ]);

    await run.apply();
    await expect(bookmarkMetadataValue.get()).resolves.toEqual({ '1': { tags: ['research'] } });
    expect(notices[0].outcome).toMatchObject({ title: 'Metadata saved.', variant: 'success' });
    expect(run.getState()).toMatchObject({ phase: 'done', open: false, result: null });
  });

  it('[mocked provider contract] skips suggestions for bookmarks deleted or moved since the scan', async () => {
    seed([
      { id: '1', title: 'Paper', url: 'https://e2e.invalid/paper' },
      { id: '2', title: 'Gone', url: 'https://e2e.invalid/gone' },
      { id: '3', title: 'Moved', url: 'https://e2e.invalid/moved' },
    ]);
    tree = await readTree();
    settings = { ...settings, aiEnabled: true };
    mocks.generateObject.mockResolvedValue({
      object: {
        items: ['1', '2', '3'].map((bookmarkId) => ({
          bookmarkId,
          title: bookmarkId,
          summary: `About ${bookmarkId}`,
        })),
      },
    });
    const run = createToolRun(TOOL_DEFINITIONS.summarizer, deps());
    await run.run('folder');
    expect(run.getState().result).toHaveLength(3);
    await fakeBrowser.bookmarks.remove('2');
    await fakeBrowser.bookmarks.update('3', { url: 'https://e2e.invalid/elsewhere' });

    await run.apply();
    await expect(bookmarkMetadataValue.get()).resolves.toEqual({ '1': { summary: 'About 1' } });
    expect(notices[0].outcome).toEqual({
      title: 'Some suggestions were not saved',
      description:
        'Saved: 1. Skipped because the bookmark was deleted or its URL changed since the scan: 2.',
      variant: 'destructive',
    });
  });

  it('[mocked provider contract] reorganization shows its review while scanning and moves on apply', async () => {
    installFakeBookmarks([
      { id: 'bar', title: 'Bar' },
      { id: 'work', parentId: 'bar', title: 'Work' },
      { id: 'b1', parentId: 'bar', title: 'Report', url: 'https://e2e.invalid/report' },
    ]);
    const move = vi
      .spyOn(fakeBrowser.bookmarks, 'move')
      .mockImplementation(async (id) => ({ id, title: '' }) as Browser.bookmarks.BookmarkTreeNode);
    tree = await readTree();
    settings = { ...settings, aiEnabled: true, reorganizationDryRunFirst: true };
    mocks.generateObject.mockResolvedValue({
      object: {
        operations: [
          {
            bookmarkId: 'b1',
            bookmarkTitle: 'Report',
            toFolderPath: 'Bar/Work',
            confidence: 0.9,
            reason: 'work',
          },
        ],
        summary: 'Move reports',
      },
    });
    const run = createToolRun(TOOL_DEFINITIONS.reorganization, deps());
    const running = run.run('all');
    expect(run.getState()).toMatchObject({ phase: 'scanning', open: true });
    await running;
    expect(run.getState()).toMatchObject({ phase: 'review', open: true });

    await run.apply();
    expect(move).toHaveBeenCalledWith('b1', { parentId: 'work' });
    expect(notices[0].outcome.title).toBe('Reorganization Complete');
    expect(run.getState()).toMatchObject({ phase: 'done', open: false });
  });

  it('shows reorganization failures inside the review instead of a toast', async () => {
    settings = { ...settings, aiEnabled: true };
    mocks.generateObject.mockRejectedValue(new Error('provider down'));
    const run = createToolRun(TOOL_DEFINITIONS.reorganization, deps());
    await run.run('all');
    expect(run.getState()).toMatchObject({
      phase: 'review',
      open: true,
      errors: ['provider down'],
    });
    expect(notices).toEqual([]);
  });
});

describe('AI context pack', () => {
  it('downloads after the privacy review without opening a review', async () => {
    seed([{ id: '1', title: 'Paper', url: 'https://e2e.invalid/paper' }]);
    tree = await readTree();
    const clicked: string[] = [];
    vi.stubGlobal('document', {
      createElement: () => ({
        click() {
          clicked.push(this.download);
        },
      }),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
    });
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: () => 'blob:', revokeObjectURL: vi.fn() }),
    );
    const saveFile = vi.fn<ToolRunDeps['saveFile']>((request, write) => write(request.nodes));
    const run = createToolRun(TOOL_DEFINITIONS.aiContextPacker, deps({ saveFile }));
    await run.run('folder');
    vi.unstubAllGlobals();

    expect(saveFile.mock.calls[0][0]).toMatchObject({ includeUrls: true });
    expect(clicked).toEqual(['bookmark-context.md']);
    expect(notices[0].outcome.title).toBe('AI context exported');
    expect(run.getState()).toMatchObject({ phase: 'done', open: false });
  });

  it('reports nothing to export for a scope without bookmarks instead of saving a file', async () => {
    seed([]);
    tree = await readTree();
    const saveFile = vi.fn<ToolRunDeps['saveFile']>();
    const run = createToolRun(TOOL_DEFINITIONS.aiContextPacker, deps({ saveFile }));
    await run.run('folder');

    expect(saveFile).not.toHaveBeenCalled();
    expect(notices.map((notice) => notice.outcome)).toEqual([
      {
        title: 'Nothing to export',
        description: 'There are no bookmarks in this scope, so no file was saved.',
      },
    ]);
  });
});

describe('reports', () => {
  it('opens statistics and privacy reviews with the scan result', async () => {
    seed([{ id: '1', title: 'Login', url: 'https://user:pass@e2e.invalid/' }]);
    tree = await readTree();
    const statistics = createToolRun(TOOL_DEFINITIONS.statistics, deps());
    await statistics.run('folder');
    expect(statistics.getState().result?.totalBookmarks).toBe(1);

    const privacy = createToolRun(TOOL_DEFINITIONS.privacyScanner, deps());
    await privacy.run('all');
    expect(privacy.getState().result?.items).toHaveLength(1);
    privacy.close();
    expect(privacy.getState()).toMatchObject({ phase: 'idle', open: false });
  });
});
