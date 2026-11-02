/**
 * Exporting and importing bookmarks as actions (`services/data-actions.ts`): an export of a folder
 * in each format with the export settings, and an import of JSON into a folder that skips
 * duplicates and always asks an agent first.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import { defaultSettings } from '@/lib/settings-schema';
import { saveSettings } from '@/lib/settings-storage';
import type { ActionContext } from '@/services/action-kit';
import { actionApproval, runAction } from '@/services/actions';
import { type FakeBookmarks, installFakeBookmarks } from '../fake-bookmarks';

let bookmarks: FakeBookmarks;

const context = (): ActionContext => ({
  client: { kind: 'askAI' },
  settings: { ...defaultSettings, language: 'en' },
  activeTab: async () => undefined,
});

const run = (name: string, input: unknown) =>
  runAction(name, input, context()) as Promise<Record<string, unknown>>;

beforeEach(async () => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  await saveSettings({ language: 'en' });
  setLanguage('en');
  bookmarks = installFakeBookmarks([
    { id: 'bar', title: 'Bookmarks Bar' },
    { id: 'docs', parentId: 'bar', title: 'Docs' },
    { id: 'b1', parentId: 'docs', title: 'Spec', url: 'https://e2e.invalid/spec' },
    { id: 'inbox', parentId: 'bar', title: 'Inbox' },
  ]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('data actions', () => {
  it('exports a folder as text in each format', async () => {
    const json = await run('exportBookmarkFile', { format: 'json', folder: 'Bookmarks Bar/Docs' });
    expect(json.bookmarks).toBe(1);
    expect(JSON.parse(json.content as string)).toMatchObject({
      children: [{ title: 'Docs', children: [{ title: 'Spec', url: 'https://e2e.invalid/spec' }] }],
    });
    const markdown = await run('exportBookmarkFile', { format: 'markdown', folder: 'f:docs' });
    expect(markdown.content).toContain('[Spec](https://e2e.invalid/spec)');
    expect(await run('exportBookmarkFile', { format: 'json', folder: 'Nowhere' })).toMatchObject({
      error: {},
    });
  });

  it('imports JSON into a folder, skipping addresses already bookmarked', async () => {
    const content = JSON.stringify({
      title: 'Bookmarks',
      children: [
        { title: 'Spec again', url: 'https://e2e.invalid/spec' },
        { title: 'Reading', children: [{ title: 'Guide', url: 'https://e2e.invalid/guide' }] },
      ],
    });
    expect(
      await run('importBookmarkFile', { format: 'json', content, folder: 'Bookmarks Bar/Inbox' }),
    ).toEqual({
      bookmarksCreated: 1,
      foldersCreated: 1,
      skipped: 1,
      failed: 0,
    });
    const [folderId] = bookmarks.childIds('inbox');
    expect(bookmarks.get(folderId)?.title).toBe('Reading');
  });

  it('refuses unreadable text, an empty file, and HTML without a page to parse it', async () => {
    const folder = 'Bookmarks Bar/Inbox';
    expect(await run('importBookmarkFile', { format: 'json', content: '{', folder })).toMatchObject(
      {
        error: { code: 'invalid_input' },
      },
    );
    expect(
      await run('importBookmarkFile', {
        format: 'json',
        content: '{"title":"x","children":[]}',
        folder,
      }),
    ).toMatchObject({ error: { code: 'invalid_input' } });
    vi.stubGlobal('DOMParser', undefined);
    expect(
      await run('importBookmarkFile', { format: 'html', content: '<dl></dl>', folder }),
    ).toMatchObject({
      error: { code: 'unavailable' },
    });
    expect(bookmarks.childIds('inbox')).toEqual([]);
  });

  it('always asks before an agent imports', () => {
    expect(
      actionApproval(
        'importBookmarkFile',
        { format: 'json', content: '{}', folder: 'x' },
        { untrustedContentSeen: false },
      ),
    ).toBe('always');
  });
});
