/**
 * Tags and summaries as actions (`services/metadata-actions.ts`): the tags in use, adding and
 * removing tags on several bookmarks, and setting one bookmark's tags and summary, as the
 * manager's details dialog does through the `ui` client.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import { bookmarkMetadataValue } from '@/lib/bookmark-metadata-storage';
import { defaultSettings } from '@/lib/settings-schema';
import { saveSettings } from '@/lib/settings-storage';
import type { ActionContext } from '@/services/action-kit';
import { actionApprovalPreview, runAction, runUIAction } from '@/services/actions';
import { installFakeBookmarks } from '../fake-bookmarks';

const context = (overrides: Partial<ActionContext> = {}): ActionContext => ({
  client: { kind: 'askAI' },
  settings: { ...defaultSettings, language: 'en' },
  activeTab: async () => undefined,
  ...overrides,
});

const run = (name: string, input: unknown) =>
  runAction(name, input, context()) as Promise<Record<string, unknown>>;

beforeEach(async () => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  await saveSettings({ language: 'en' });
  setLanguage('en');
  installFakeBookmarks([
    { id: 'bar', title: 'Bookmarks Bar' },
    { id: 'work', parentId: 'bar', title: 'Work' },
    { id: 'b1', parentId: 'work', title: 'Spec', url: 'https://e2e.invalid/spec' },
    { id: 'b2', parentId: 'work', title: 'Notes', url: 'https://e2e.invalid/notes' },
  ]);
  await bookmarkMetadataValue.set({
    b1: { tags: ['Docs', 'work'], summary: 'The spec' },
    b2: { tags: ['docs'] },
  });
});

describe('listTags', () => {
  it('lists tags most used first, counting spellings that differ in case as one', async () => {
    expect(await run('listTags', {})).toEqual({
      tags: [
        { tag: 'Docs', bookmarks: 2 },
        { tag: 'work', bookmarks: 1 },
      ],
      total: 2,
    });
    expect(await run('listTags', { query: 'wor' })).toMatchObject({ total: 1 });
  });
});

describe('editTags', () => {
  it('adds and removes tags on several bookmarks and says what each had before', async () => {
    const result = await run('editTags', {
      refs: ['b:b1', 'b:b2'],
      add: ['reading'],
      remove: ['DOCS'],
    });
    expect(result.items).toEqual([
      { ref: 'b:b1', before: ['Docs', 'work'], tags: ['work', 'reading'] },
      { ref: 'b:b2', before: ['docs'], tags: ['reading'] },
    ]);
    expect((await bookmarkMetadataValue.get()).b1).toEqual({
      tags: ['work', 'reading'],
      summary: 'The spec',
    });
  });

  it('refuses a folder or unknown ref and a call that names no tags', async () => {
    expect(await run('editTags', { refs: ['f:work'], add: ['x'] })).toMatchObject({
      error: { code: 'invalid_input' },
    });
    expect(await run('editTags', { refs: ['b:nothing'], add: ['x'] })).toMatchObject({ error: {} });
    expect(await run('editTags', { refs: ['b:b1'] })).toMatchObject({
      error: { code: 'invalid_input' },
    });
  });

  it('lists the tags added and removed in the approval', () => {
    expect(
      actionApprovalPreview('editTags')?.lines?.({
        refs: ['b:b1', 'b:b2'],
        add: ['reading'],
        remove: ['docs'],
      }),
    ).toEqual(['Add reading to 2 bookmarks', 'Remove docs from 2 bookmarks']);
  });
});

describe('setBookmarkDetails', () => {
  it('replaces tags and the summary, returns what it replaced, and runs for the user as the ui client', async () => {
    const result = (await runUIAction('setBookmarkDetails', {
      ref: 'b:b1',
      tags: ['spec', 'Spec'],
      summary: '',
    })) as Record<string, unknown>;
    expect(result).toEqual({
      ref: 'b:b1',
      before: { tags: ['Docs', 'work'], summary: 'The spec' },
      tags: ['spec'],
      summary: '',
    });
    expect(await run('setBookmarkDetails', { ref: 'b:b2' })).toMatchObject({
      error: { code: 'invalid_input' },
    });
  });
});
