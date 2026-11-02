/**
 * The cleaners as actions (`services/cleaner-actions.ts`) and the plannable `changeUrl`: finding
 * the addresses URL Cleaner would clean and the bookmarks the Privacy Scanner flags, with the
 * user's settings, then cleaning an address through a plan the user approves.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import { defaultSettings } from '@/lib/settings-schema';
import { saveSettings } from '@/lib/settings-storage';
import type { ActionContext } from '@/services/action-kit';
import { actionApprovalPreview, runAction } from '@/services/actions';
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
    { id: 'news', parentId: 'bar', title: 'News' },
    {
      id: 'b1',
      parentId: 'news',
      title: 'Story',
      url: 'https://e2e.invalid/story?utm_source=feed&id=7',
    },
    {
      id: 'b2',
      parentId: 'news',
      title: 'Reset link',
      url: 'https://e2e.invalid/reset?token=abc123secret',
    },
    { id: 'b3', parentId: 'news', title: 'Clean', url: 'https://e2e.invalid/clean' },
  ]);
});

describe('cleaner actions', () => {
  it('finds the addresses URL Cleaner would clean, in a folder or everywhere', async () => {
    const found = await run('findUrlCleanups', { folder: 'Bookmarks Bar/News' });
    expect(found).toMatchObject({
      total: 1,
      items: [
        {
          ref: 'b:b1',
          url: 'https://e2e.invalid/story?utm_source=feed&id=7',
          cleanedUrl: 'https://e2e.invalid/story?id=7',
          removedParams: ['utm_source'],
        },
      ],
    });
    expect(await run('findUrlCleanups', { folder: 'Nowhere' })).toMatchObject({ error: {} });
  });

  it('flags private values without sending the address that holds them', async () => {
    const found = await run('scanPrivacy', {});
    expect(found.items).toEqual([
      expect.objectContaining({
        ref: 'b:b2',
        findings: expect.arrayContaining(['sensitiveParam:token']),
      }),
    ]);
    expect(JSON.stringify(found)).not.toContain('abc123secret');
  });

  it('cleans an address through a plan the user approves, and refuses folders and non-web addresses', async () => {
    const plan = await run('proposeChanges', {
      summary: 'Clean tracking',
      changes: [
        { action: 'changeUrl', input: { ref: 'b:b1', url: 'https://e2e.invalid/story?id=7' } },
      ],
    });
    expect(plan.changes).toEqual([
      {
        kind: 'changeUrl',
        title: 'Story',
        from: 'https://e2e.invalid/story?utm_source=feed&id=7',
        to: 'https://e2e.invalid/story?id=7',
      },
    ]);
    expect(
      await actionApprovalPreview('applyChanges')?.stored?.load(plan.planId as string),
    ).toMatchObject({
      lines: ['Change the address of “Story” to https://e2e.invalid/story?id=7'],
    });
    expect(await run('applyChanges', { planId: plan.planId })).toMatchObject({ applied: 1 });
    expect(bookmarks.get('b1')?.url).toBe('https://e2e.invalid/story?id=7');

    for (const change of [
      { action: 'changeUrl', input: { ref: 'f:news', url: 'https://e2e.invalid/' } },
      { action: 'changeUrl', input: { ref: 'b:b3', url: 'javascript:alert(1)' } },
    ]) {
      expect(await run('proposeChanges', { summary: 'x', changes: [change] })).toMatchObject({
        error: { code: 'invalid_input' },
      });
    }
  });
});
