import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import { quickSaveActionSchema } from '@/lib/quick-save-validation';
import { addRecentFolder } from '@/lib/recent-folders-storage';
import { defaultSettings, type Settings } from '@/lib/settings-schema';
import { saveSettings } from '@/lib/settings-storage';
import { fetchBookmarkTree } from '@/services/bookmarks';
import {
  buildQuickSaveView,
  handleQuickSaveAction,
  moveQuickSave,
  type QuickSaveRecord,
  quickSaveActions,
  quickSaveRecordValue,
  runQuickSave,
  undoQuickSave,
} from '@/services/quick-save';
import { chooseQuickSaveTarget } from '@/services/quick-save-target';
import { type FakeBookmarks, installFakeBookmarks } from '../fake-bookmarks';
import { readStoredData, STORAGE_ITEMS } from './storage-helpers';

let bookmarks: FakeBookmarks;

const tab = (url: string, title: string) =>
  ({ id: 7, index: 0, windowId: 1, url, title, active: true }) as Browser.tabs.Tab;

const settings = (overrides: Partial<Settings> = {}): Settings => ({
  ...defaultSettings,
  language: 'en',
  ...overrides,
});

beforeEach(async () => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  bookmarks = installFakeBookmarks([
    { id: 'bar', title: 'Bookmarks Bar' },
    { id: 'other', title: 'Other Bookmarks' },
    { id: 'dev', parentId: 'bar', title: 'Dev' },
    { id: 'react', parentId: 'dev', title: 'React' },
    { id: 'r1', parentId: 'react', title: 'Hooks reference', url: 'https://react.dev/reference' },
    { id: 'cooking', parentId: 'bar', title: 'Cooking' },
    { id: 'c1', parentId: 'cooking', title: 'Pasta recipe', url: 'https://food.example/pasta' },
    { id: 'reading', parentId: 'other', title: 'Reading' },
  ]);
  await saveSettings({ language: 'en' });
  setLanguage('en');
});

describe('chooseQuickSaveTarget', () => {
  it('each strategy picks its own folder and offers ranked, then recent, alternatives', async () => {
    const tree = await fetchBookmarkTree();
    const input = {
      fixedFolderId: 'reading',
      recentFolderIds: ['cooking', 'reading'],
      ranked: [
        { id: 'react', score: 5 },
        { id: 'dev', score: 3 },
      ],
      minScore: 2,
      alternatives: 3,
    };
    const pick = (strategy: Settings['quickSaveFolderStrategy']) => {
      const target = chooseQuickSaveTarget(tree, { ...input, strategy });
      return [target?.folder.id, target?.fallback, target?.alternatives.map((folder) => folder.id)];
    };
    expect(pick('best_match')).toEqual(['react', undefined, ['dev', 'cooking', 'reading']]);
    expect(pick('last_used')).toEqual(['cooking', undefined, ['react', 'dev', 'reading']]);
    expect(pick('fixed')).toEqual(['reading', undefined, ['react', 'dev', 'cooking']]);
    expect(chooseQuickSaveTarget(tree, { ...input, strategy: 'best_match' })?.folder.path).toEqual([
      'Bookmarks Bar',
      'Dev',
      'React',
    ]);
  });

  it('falls back to the last used folder, then the bookmarks bar, when nothing matches', async () => {
    const tree = await fetchBookmarkTree();
    const base = { fixedFolderId: '', ranked: [], minScore: 2, alternatives: 2 };
    expect(
      chooseQuickSaveTarget(tree, {
        ...base,
        strategy: 'best_match',
        recentFolderIds: ['cooking'],
      }),
    ).toMatchObject({ folder: { id: 'cooking' }, fallback: 'noMatch' });
    expect(
      chooseQuickSaveTarget(tree, { ...base, strategy: 'best_match', recentFolderIds: ['gone'] }),
    ).toMatchObject({ folder: { id: 'bar' }, fallback: 'noMatch' });
    // A weak match is offered as an alternative but not chosen.
    const weak = chooseQuickSaveTarget(tree, {
      ...base,
      strategy: 'best_match',
      ranked: [{ id: 'react', score: 1 }],
      recentFolderIds: ['cooking'],
    });
    expect(weak).toMatchObject({ folder: { id: 'cooking' }, fallback: 'noMatch' });
    expect(weak?.alternatives.map((folder) => folder.id)).toEqual(['react']);
    // A first save with "last used" simply goes to the bookmarks bar.
    const first = chooseQuickSaveTarget(tree, {
      ...base,
      strategy: 'last_used',
      recentFolderIds: [],
    });
    expect(first?.folder.id).toBe('bar');
    expect(first?.fallback).toBeUndefined();
  });

  it('a chosen folder that no longer exists falls back and says so', async () => {
    const tree = await fetchBookmarkTree();
    const target = chooseQuickSaveTarget(tree, {
      strategy: 'fixed',
      fixedFolderId: 'deleted-folder',
      recentFolderIds: ['reading'],
      ranked: [],
      minScore: 2,
      alternatives: 2,
    });
    expect(target).toMatchObject({ folder: { id: 'reading' }, fallback: 'fixedMissing' });
    const view = buildQuickSaveView(
      {
        id: 'x',
        mode: 'local',
        status: 'saved',
        at: 0,
        delivery: 'page',
        page: { title: 'T', url: 'https://e.example/' },
        bookmarkId: 'b',
        folderId: 'reading',
        path: ['Other Bookmarks', 'Reading'],
        createdFolderIds: [],
        origin: { kind: 'created' },
        alternatives: [],
        fallback: 'fixedMissing',
      },
      settings(),
    );
    expect(view.title).toBe('Saved to Reading');
    expect(view.detail).toBe('Other Bookmarks / Reading');
    expect(view.note).toBe(
      'Your quick save folder no longer exists, so the page went to your last used folder or the bookmarks bar.',
    );
  });

  it('never targets the folder that already holds the page', async () => {
    const tree = await fetchBookmarkTree();
    const target = chooseQuickSaveTarget(tree, {
      strategy: 'best_match',
      fixedFolderId: '',
      recentFolderIds: ['react'],
      ranked: [
        { id: 'react', score: 5 },
        { id: 'dev', score: 3 },
      ],
      minScore: 2,
      alternatives: 3,
      excludeIds: new Set(['react']),
    });
    expect(target?.folder.id).toBe('dev');
    expect(target?.alternatives.map((folder) => folder.id)).not.toContain('react');
  });
});

describe('runQuickSave', () => {
  it('saves to the best matching folder, tracks it as recent, and offers others', async () => {
    const record = await runQuickSave(
      'quick-save',
      tab('https://react.dev/learn', 'Quick Start – React'),
    );
    expect(record).toMatchObject({
      status: 'saved',
      folderId: 'react',
      path: ['Bookmarks Bar', 'Dev', 'React'],
    });
    const saved = bookmarks.get(record.bookmarkId ?? '');
    expect(saved).toMatchObject({
      parentId: 'react',
      title: 'Quick Start – React',
      url: 'https://react.dev/learn',
    });
    const recent = await readStoredData(STORAGE_ITEMS.recentFolders);
    expect((recent as { id: string }[])[0].id).toBe('react');
    // Kept for Undo after the worker restarts; the page could not show it here, so the popup does.
    expect(await quickSaveRecordValue.get()).toMatchObject({ id: record.id, delivery: 'popup' });
  });

  it('does not save a page twice: it reports where the page already is', async () => {
    const before = bookmarks.childIds('cooking').length;
    const record = await runQuickSave('quick-save', tab('https://food.example/pasta', 'Pasta'));
    expect(record).toMatchObject({
      status: 'duplicate',
      bookmarkId: 'c1',
      folderId: 'cooking',
      origin: { kind: 'existing', parentId: 'cooking' },
    });
    expect(bookmarks.childIds('cooking')).toHaveLength(before);
    expect(record.alternatives.map((alternative) => alternative.folderId)).not.toContain('cooking');
    expect(buildQuickSaveView(record, settings()).title).toBe('Already in Cooking');
  });

  it('uses the last used folder and the chosen folder when the setting says so', async () => {
    await addRecentFolder('reading', 'Reading');
    await saveSettings({ quickSaveFolderStrategy: 'last_used' });
    const lastUsed = await runQuickSave('quick-save', tab('https://react.dev/a', 'React A'));
    expect(lastUsed.folderId).toBe('reading');

    await saveSettings({ quickSaveFolderStrategy: 'fixed', quickSaveFixedFolder: 'cooking' });
    const fixed = await runQuickSave('quick-save', tab('https://react.dev/b', 'React B'));
    expect(fixed.folderId).toBe('cooking');
  });

  it('refuses AI quick save while AI is off, offering the AI settings', async () => {
    const record = await runQuickSave('ai-quick-save', tab('https://react.dev/c', 'React C'));
    expect(record).toMatchObject({ status: 'failed', failure: 'aiUnavailable' });
    expect(bookmarks.writes.filter((write) => write.startsWith('create'))).toEqual([]);
    const view = buildQuickSaveView(record, settings());
    expect(view.title).toBe('AI quick save is not set up');
    expect(view.actions).toEqual([
      { id: 'openAISettings', label: 'Open AI settings', primary: true },
      { id: 'saveWithoutAI', label: 'Save without AI' },
    ]);
  });

  it('reports a tab without a page instead of saving', async () => {
    const record = await runQuickSave('quick-save', { id: 3, index: 0 } as Browser.tabs.Tab);
    expect(record).toMatchObject({ status: 'failed', failure: 'noPage' });
  });
});

describe('undo and move', () => {
  const aiRecord = (overrides: Partial<QuickSaveRecord> = {}): QuickSaveRecord => ({
    id: 'q1',
    mode: 'ai',
    status: 'saved',
    at: Date.now(),
    tabId: 7,
    delivery: 'page',
    page: { title: 'Article', url: 'https://news.example/a' },
    path: [],
    createdFolderIds: [],
    origin: { kind: 'created' },
    alternatives: [],
    ...overrides,
  });

  it('undo removes the bookmark and the folders this save created', async () => {
    const news = await fakeBrowser.bookmarks.create({ parentId: 'bar', title: 'News' });
    const world = await fakeBrowser.bookmarks.create({ parentId: news.id, title: 'World' });
    const saved = await fakeBrowser.bookmarks.create({
      parentId: world.id,
      title: 'Article',
      url: 'https://news.example/a',
    });
    const record = aiRecord({
      bookmarkId: saved.id,
      folderId: world.id,
      path: ['Bookmarks Bar', 'News', 'World'],
      createdFolderIds: [news.id, world.id],
    });
    const undone = await undoQuickSave(record);
    expect(undone.status).toBe('removed');
    expect(bookmarks.get(saved.id)).toBeUndefined();
    expect(bookmarks.get(world.id)).toBeUndefined();
    expect(bookmarks.get(news.id)).toBeUndefined();
    expect(buildQuickSaveView(undone, settings()).title).toBe('Bookmark removed');
  });

  it('undo keeps a created folder the user has put something else in', async () => {
    const news = await fakeBrowser.bookmarks.create({ parentId: 'bar', title: 'News' });
    const saved = await fakeBrowser.bookmarks.create({
      parentId: news.id,
      title: 'Article',
      url: 'https://news.example/a',
    });
    await fakeBrowser.bookmarks.create({
      parentId: news.id,
      title: 'Other',
      url: 'https://news.example/b',
    });
    await undoQuickSave(
      aiRecord({
        bookmarkId: saved.id,
        folderId: news.id,
        path: ['News'],
        createdFolderIds: [news.id],
      }),
    );
    expect(bookmarks.get(saved.id)).toBeUndefined();
    expect(bookmarks.get(news.id)).toBeDefined();
  });

  it('moving to an AI suggestion creates its folders and removes the empty ones it left', async () => {
    const news = await fakeBrowser.bookmarks.create({ parentId: 'bar', title: 'News' });
    const saved = await fakeBrowser.bookmarks.create({
      parentId: news.id,
      title: 'Article',
      url: 'https://news.example/a',
    });
    const record = aiRecord({
      bookmarkId: saved.id,
      folderId: news.id,
      path: ['Bookmarks Bar', 'News'],
      createdFolderIds: [news.id],
      recommendation: {
        type: 'new',
        folderPath: 'News',
        parentPath: '',
        confidence: 0.9,
        reason: 'r',
      },
      alternatives: [
        {
          path: ['Bookmarks Bar', 'Dev', 'Tools'],
          recommendation: {
            type: 'new',
            folderPath: 'Dev/Tools',
            parentPath: '',
            confidence: 0.8,
            reason: 'r',
          },
        },
      ],
    });
    const moved = await moveQuickSave(record, 0);
    const tools = bookmarks
      .childIds('dev')
      .map((id) => bookmarks.get(id))
      .find((node) => node?.title === 'Tools');
    expect(tools).toBeDefined();
    expect(bookmarks.get(saved.id)?.parentId).toBe(tools?.id);
    expect(bookmarks.get(news.id)).toBeUndefined();
    expect(moved).toMatchObject({
      status: 'saved',
      folderId: tools?.id,
      createdFolderIds: [tools?.id],
    });
    // The folder it left is offered again, as the suggestion that recreates it.
    expect(moved.alternatives[0]).toMatchObject({
      path: ['Bookmarks Bar', 'News'],
      recommendation: { folderPath: 'News' },
    });
    expect(moved.alternatives[0].folderId).toBeUndefined();

    // Undo after the move removes the bookmark and the folder the move created.
    const undone = await undoQuickSave(moved);
    expect(undone.status).toBe('removed');
    expect(bookmarks.get(tools?.id ?? '')).toBeUndefined();
  });

  it('moving a page that was already saved can be undone back to where it was', async () => {
    const record = aiRecord({
      mode: 'local',
      status: 'duplicate',
      bookmarkId: 'c1',
      folderId: 'cooking',
      path: ['Bookmarks Bar', 'Cooking'],
      origin: {
        kind: 'existing',
        parentId: 'cooking',
        index: 0,
        path: ['Bookmarks Bar', 'Cooking'],
      },
      alternatives: [{ path: ['Other Bookmarks', 'Reading'], folderId: 'reading' }],
    });
    const moved = await moveQuickSave(record, 0);
    expect(bookmarks.get('c1')?.parentId).toBe('reading');
    expect(buildQuickSaveView(moved, settings()).actions.map((action) => action.id)).toEqual([
      'undo',
    ]);
    const back = await undoQuickSave(moved);
    expect(bookmarks.get('c1')?.parentId).toBe('cooking');
    expect(back).toMatchObject({ status: 'duplicate', folderId: 'cooking' });
  });
});

describe('quick save messages', () => {
  it('accept only well-formed actions', () => {
    const ok = { type: 'quick-save/action', id: 'q1', action: 'move', index: 1 };
    expect(quickSaveActionSchema.safeParse(ok).success).toBe(true);
    for (const bad of [
      { ...ok, index: -1 },
      { ...ok, index: 1.5 },
      { ...ok, extra: true },
      { ...ok, action: 'delete' },
      { type: 'quick-save/action', id: '', action: 'undo' },
      { type: 'other', id: 'q1', action: 'undo' },
      'undo',
      null,
    ]) {
      expect(quickSaveActionSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it('ignore other messages, stale notifications, and other tabs', async () => {
    const record = await runQuickSave('quick-save', tab('https://react.dev/learn', 'Quick Start'));
    const self = { id: fakeBrowser.runtime.id };
    expect(await handleQuickSaveAction({ type: 'something-else' }, self)).toBeNull();
    const undo = { type: 'quick-save/action', id: record.id, action: 'undo' };
    // A notification in another tab, a stale id, and another extension change nothing.
    expect(await handleQuickSaveAction(undo, { ...self, tab: { ...tab('', ''), id: 99 } })).toEqual(
      { view: null },
    );
    expect(
      (await handleQuickSaveAction({ ...undo, id: 'old' }, { ...self, tab: tab('', '') }))?.view
        ?.status,
    ).toBe('expired');
    expect(
      await handleQuickSaveAction(undo, { id: 'another-extension', tab: tab('', '') }),
    ).toEqual({ view: null });
    expect(bookmarks.get(record.bookmarkId ?? '')).toBeDefined();

    // Its own tab's notification can undo it.
    const response = await handleQuickSaveAction(undo, { ...self, tab: tab('', '') });
    expect(response?.view?.title).toBe('Bookmark removed');
    expect(bookmarks.get(record.bookmarkId ?? '')).toBeUndefined();
  });

  it('an older notification says a newer quick save replaced it and changes nothing', async () => {
    const first = await runQuickSave('quick-save', tab('https://react.dev/first', 'React first'));
    const second = await runQuickSave('quick-save', {
      ...tab('https://react.dev/second', 'React second'),
      id: 8,
    });
    const self = { id: fakeBrowser.runtime.id, tab: tab('', '') };
    const response = await handleQuickSaveAction(
      { type: 'quick-save/action', id: first.id, action: 'undo' },
      self,
    );
    expect(response?.view).toMatchObject({
      id: first.id,
      status: 'expired',
      title: 'A newer quick save replaced this one',
      note: 'Undo and Move to work on the latest quick save only. Change this bookmark in the bookmark manager.',
      actions: [],
      alternatives: [],
    });
    expect(bookmarks.get(first.bookmarkId ?? '')).toBeDefined();
    expect(bookmarks.get(second.bookmarkId ?? '')).toBeDefined();
    expect((await quickSaveRecordValue.get())?.id).toBe(second.id);
    // Closing it is quiet, and the popup (no tab) never gets the message.
    expect(
      await handleQuickSaveAction(
        { type: 'quick-save/action', id: first.id, action: 'dismiss' },
        self,
      ),
    ).toEqual({ view: null });
    expect(
      await handleQuickSaveAction(
        { type: 'quick-save/action', id: first.id, action: 'undo' },
        { id: fakeBrowser.runtime.id, url: fakeBrowser.runtime.getURL('/popup.html') },
      ),
    ).toEqual({ view: null });
  });
});

describe('a failed AI quick save', () => {
  const failed = (overrides: Partial<QuickSaveRecord> = {}): QuickSaveRecord => ({
    id: 'q-failed',
    mode: 'ai',
    status: 'failed',
    failure: 'aiFailed',
    error: 'The provider answered with HTTP 400.',
    at: Date.now(),
    tabId: 7,
    documentToken: 'doc-1',
    delivery: 'page',
    page: { title: 'Quick Start – React', url: 'https://react.dev/learn' },
    path: [],
    createdFolderIds: [],
    origin: { kind: 'created' },
    alternatives: [],
    ...overrides,
  });

  it('offers Retry and Save without AI, and only for a page that failed with AI', () => {
    const labels = (record: QuickSaveRecord) =>
      quickSaveActions(record).map(({ id, primary }) => (primary ? `${id}*` : id));
    expect(labels(failed())).toEqual(['retry*', 'saveWithoutAI']);
    expect(labels(failed({ failure: 'saveFailed' }))).toEqual(['retry*', 'saveWithoutAI']);
    expect(labels(failed({ failure: 'aiUnavailable' }))).toEqual([
      'openAISettings*',
      'saveWithoutAI',
    ]);
    // Without AI there is nothing to retry differently, and without a page nothing to save.
    expect(labels(failed({ mode: 'local', failure: 'saveFailed' }))).toEqual([]);
    expect(labels(failed({ failure: 'noPage', page: { title: '', url: '' } }))).toEqual([]);
    expect(labels(failed({ status: 'saved', bookmarkId: 'b1', failure: undefined }))).toEqual([
      'undo',
    ]);
    expect(buildQuickSaveView(failed(), settings()).actions.map(({ label }) => label)).toEqual([
      'Retry',
      'Save without AI',
    ]);
  });

  it('Save without AI saves the same page with the Quick save setting, in place', async () => {
    await quickSaveRecordValue.update(() => failed());
    const self = { id: fakeBrowser.runtime.id, tab: tab('', '') };
    const response = await handleQuickSaveAction(
      { type: 'quick-save/action', id: 'q-failed', action: 'saveWithoutAI' },
      self,
    );
    expect(response?.view).toMatchObject({ id: 'q-failed', title: 'Saved to React' });
    const stored = await quickSaveRecordValue.get();
    expect(stored).toMatchObject({
      id: 'q-failed',
      mode: 'local',
      status: 'saved',
      folderId: 'react',
      page: { url: 'https://react.dev/learn' },
    });
    expect(bookmarks.get(stored?.bookmarkId ?? '')).toMatchObject({
      parentId: 'react',
      url: 'https://react.dev/learn',
    });
  });

  it('Retry asks AI again for the same page', async () => {
    await quickSaveRecordValue.update(() => failed());
    const response = await handleQuickSaveAction(
      { type: 'quick-save/action', id: 'q-failed', action: 'retry' },
      { id: fakeBrowser.runtime.id, tab: tab('', '') },
    );
    // AI is off in these tests, so the retry ends where AI starts: not set up.
    expect(response?.view).toMatchObject({ id: 'q-failed', title: 'AI quick save is not set up' });
    expect(await quickSaveRecordValue.get()).toMatchObject({
      id: 'q-failed',
      mode: 'ai',
      failure: 'aiUnavailable',
    });
    expect(bookmarks.writes.filter((write) => write.startsWith('create'))).toEqual([]);
  });

  it('does nothing for a quick save that did not fail', async () => {
    await quickSaveRecordValue.update(() =>
      failed({ status: 'saved', failure: undefined, bookmarkId: 'r1', folderId: 'react' }),
    );
    await handleQuickSaveAction(
      { type: 'quick-save/action', id: 'q-failed', action: 'saveWithoutAI' },
      { id: fakeBrowser.runtime.id, tab: tab('', '') },
    );
    expect(bookmarks.writes.filter((write) => write.startsWith('create'))).toEqual([]);
  });
});

describe('the notification view', () => {
  it('takes its direction from the app language, never from the page', async () => {
    const record = await runQuickSave('quick-save', tab('https://react.dev/learn', 'Quick Start'));
    expect(buildQuickSaveView(record, settings()).dir).toBe('ltr');
    expect(buildQuickSaveView(record, settings({ language: 'ja' }))).toMatchObject({
      lang: 'ja',
      dir: 'ltr',
    });
  });
});
