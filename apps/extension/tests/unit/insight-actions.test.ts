/**
 * The History, Statistics, and AI Context Packer as read actions (`services/insight-actions.ts`):
 * a change shows in `listHistory` with who made it, `getHistoryChange` gives its
 * items with where they were before, and Statistics and the context pack follow the user's
 * settings for all bookmarks or one folder.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import { AUDIT_ACTORS } from '@/lib/bookmark-audit-store';
import { defaultSettings } from '@/lib/settings-schema';
import { saveSettings } from '@/lib/settings-storage';
import type { ActionContext } from '@/services/action-kit';
import { changesBookmarks, runAction } from '@/services/actions';
import { installFakeBookmarks } from '../fake-bookmarks';
import { resetAuditDatabase } from './audit-helpers';

const context = (overrides: Partial<ActionContext> = {}): ActionContext => ({
  client: { kind: 'askAI' },
  settings: { ...defaultSettings, language: 'en' },
  activeTab: async () => undefined,
  ...overrides,
});

const run = (name: string, input: unknown, overrides: Partial<ActionContext> = {}) =>
  runAction(name, input, context(overrides)) as Promise<Record<string, unknown>>;

beforeEach(async () => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  await resetAuditDatabase();
  await saveSettings({ language: 'en' });
  setLanguage('en');
  installFakeBookmarks([
    { id: 'bar', title: 'Bookmarks Bar' },
    { id: 'work', parentId: 'bar', title: 'Work' },
    { id: 'old', parentId: 'bar', title: 'Old' },
    { id: 'b1', parentId: 'old', title: 'Spec', url: 'https://e2e.invalid/spec' },
    { id: 'b2', parentId: 'old', title: 'Notes', url: 'https://docs.e2e.invalid/notes' },
    { id: 'b3', parentId: 'work', title: 'Board', url: 'https://e2e.invalid/board' },
  ]);
});

describe('history actions', () => {
  it('lists a change with who made it, and reads its items', async () => {
    expect(await run('listHistory', {})).toEqual({ changes: [], total: 0 });
    await run('saveBookmark', {
      url: 'https://e2e.invalid/new',
      title: 'New page',
      folder: 'f:work',
    });
    const listed = (await run('listHistory', {})) as {
      changes: { id: string; by: string; what: string; state: string; at: string }[];
      total: number;
    };
    expect(listed.total).toBe(1);
    const [change] = listed.changes;
    // Who made it comes from where the call ran (`currentAuditSource`), not from this test.
    expect(change).toMatchObject({ state: 'verified_success' });
    expect(AUDIT_ACTORS).toContain(change.by);
    expect(change.what).toContain('New page');
    expect(Number.isNaN(Date.parse(change.at))).toBe(false);

    const read = (await run('getHistoryChange', { id: change.id })) as {
      change: { id: string };
      items: Record<string, unknown>[];
      total: number;
      omitted: number;
    };
    expect(read.change.id).toBe(change.id);
    expect(read).toMatchObject({ total: 1, omitted: 0 });
    expect(read.items[0]).toMatchObject({
      change: 'create',
      outcome: 'applied',
      title: 'New page',
      url: 'https://e2e.invalid/new',
      after: { folderRef: 'f:work' },
    });
  });

  it('refuses an unknown change, and changes no bookmark', async () => {
    expect(await run('getHistoryChange', { id: 'nothing' })).toMatchObject({
      error: { code: 'not_found' },
    });
    for (const id of ['listHistory', 'getHistoryChange', 'getStatistics', 'packContext'] as const) {
      expect(changesBookmarks(id), id).toBe(false);
    }
  });
});

describe('statistics and the context pack', () => {
  it('counts all bookmarks or one folder, with the sections the settings allow', async () => {
    const all = await run('getStatistics', {});
    expect(all).toMatchObject({ totalBookmarks: 3, bookmarksInScope: 3 });
    expect(all.topDomains).toEqual(expect.arrayContaining([{ label: 'e2e.invalid', count: 2 }]));
    const folder = await run('getStatistics', { folder: 'Bookmarks Bar/Old' });
    expect(folder).toMatchObject({ bookmarksInScope: 2 });
    const plain = await run(
      'getStatistics',
      {},
      { settings: { ...defaultSettings, language: 'en', statisticsIncludeDomains: false } },
    );
    expect(plain).not.toHaveProperty('topDomains');
    expect(await run('getStatistics', { folder: 'Nowhere' })).toMatchObject({ error: {} });
  });

  it('packs a folder in the format the user chose', async () => {
    const packed = await run('packContext', { folder: 'f:old' });
    expect(packed).toMatchObject({
      bookmarks: 2,
      format: defaultSettings.aiContextPackerOutputFormat,
    });
    expect(packed.content).toContain('Spec');
    expect(packed.content).not.toContain('Board');
    const xml = await run(
      'packContext',
      {},
      { settings: { ...defaultSettings, language: 'en', aiContextPackerOutputFormat: 'xml' } },
    );
    expect(xml).toMatchObject({ bookmarks: 3, format: 'xml' });
    expect(xml.content).toContain('<');
  });
});
