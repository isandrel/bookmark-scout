/**
 * The manager's saved searches as actions (`services/saved-search-actions.ts`): listing, saving
 * from search text and a folder or from a whole query, renaming, and deleting, through the saved
 * searches' own checks, with the reason Bookmark Scout's pages word for each failure.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import { getSavedSearches } from '@/lib/saved-searches-storage';
import { defaultSettings } from '@/lib/settings-schema';
import { saveSettings } from '@/lib/settings-storage';
import type { ActionContext } from '@/services/action-kit';
import { actionApprovalPreview, runAction } from '@/services/actions';
import { installFakeBookmarks } from '../fake-bookmarks';

const context = (client: ActionContext['client'] = { kind: 'askAI' }): ActionContext => ({
  client,
  settings: { ...defaultSettings, language: 'en' },
  activeTab: async () => undefined,
});

const run = (name: string, input: unknown, client?: ActionContext['client']) =>
  runAction(name, input, context(client)) as Promise<Record<string, unknown>>;

beforeEach(async () => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  await saveSettings({ language: 'en' });
  setLanguage('en');
  installFakeBookmarks([
    { id: 'bar', title: 'Bookmarks Bar' },
    { id: 'docs', parentId: 'bar', title: 'Docs' },
  ]);
});

describe('saved search actions', () => {
  it('saves a search from text and a folder, lists it, renames it, and deletes it', async () => {
    const saved = await run('saveSearch', {
      name: 'Guides',
      search: 'tag:guide',
      folder: 'Bookmarks Bar/Docs',
    });
    expect(saved).toMatchObject({
      name: 'Guides',
      search: 'tag:guide',
      folder: 'Bookmarks Bar/Docs',
      query: { filters: { title: 'tag:guide' }, folderId: 'docs', sorting: [] },
    });
    expect(await run('listSavedSearches', {})).toEqual({ searches: [saved] });
    expect(await run('renameSearch', { id: saved.id, name: 'Docs guides' })).toMatchObject({
      id: saved.id,
      name: 'Docs guides',
    });
    expect(await run('deleteSearch', { id: saved.id })).toMatchObject({ name: 'Docs guides' });
    expect(await getSavedSearches()).toEqual([]);
  });

  it('keeps a whole query from the manager as given', async () => {
    const query = {
      filters: { domain: ['github.com'], type: ['link'] },
      sorting: [{ id: 'title', desc: true }],
    };
    const saved = await run(
      'saveSearch',
      { name: 'GitHub', query },
      { kind: 'ui', page: 'manager' },
    );
    expect(saved).toMatchObject({ name: 'GitHub', query });
    expect(saved).not.toHaveProperty('search');
  });

  it('refuses with the reason pages word: duplicate names, nothing to find, unknown ids', async () => {
    await run('saveSearch', { name: 'Guides', search: 'guide' });
    expect(await run('saveSearch', { name: 'guides', search: 'other' })).toMatchObject({
      error: { code: 'invalid_input', reason: 'duplicate-name' },
    });
    expect(await run('saveSearch', { name: 'Empty' })).toMatchObject({
      error: { reason: 'invalid-query' },
    });
    expect(
      await run('saveSearch', { name: 'Both', search: 'x', query: { filters: {}, sorting: [] } }),
    ).toMatchObject({ error: { code: 'invalid_input' } });
    expect(await run('saveSearch', { name: 'Nowhere', folder: 'Nowhere' })).toMatchObject({
      error: {},
    });
    expect(await run('renameSearch', { id: 'nothing', name: 'X' })).toMatchObject({
      error: { code: 'not_found', reason: 'not-found' },
    });
    expect(await run('deleteSearch', { id: 'nothing' })).toMatchObject({
      error: { code: 'not_found' },
    });
  });

  it('says what a save keeps in the approval', () => {
    expect(
      actionApprovalPreview('saveSearch')?.lines?.({ name: 'Guides', search: 'tag:guide' }),
    ).toEqual(['Save the search “Guides”: tag:guide']);
  });
});
