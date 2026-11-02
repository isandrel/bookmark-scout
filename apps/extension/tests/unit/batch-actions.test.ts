/**
 * `runBatch` (`services/actions.ts`): several calls as one request, one approval, one undo step;
 * and the `ui` client, the user's own pages running actions without the agent limits.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import { aiActivityValue } from '@/lib/ai-activity-storage';
import { defaultSettings } from '@/lib/settings-schema';
import { saveSettings } from '@/lib/settings-storage';
import type { ActionContext } from '@/services/action-kit';
import {
  actionApproval,
  actionApprovalPreview,
  callRisk,
  checkActionCall,
  runAction,
} from '@/services/actions';
import { bookmarkHistoryValue } from '@/services/bookmark-history';
import { type FakeBookmarks, installFakeBookmarks } from '../fake-bookmarks';

let bookmarks: FakeBookmarks;

const context = (overrides: Partial<ActionContext> = {}): ActionContext => ({
  client: { kind: 'askAI' },
  settings: { ...defaultSettings, language: 'en' },
  activeTab: async () => undefined,
  ...overrides,
});

const run = (name: string, input: unknown, overrides: Partial<ActionContext> = {}) =>
  runAction(name, input, context(overrides)) as Promise<Record<string, unknown>>;

const save = (url: string, folder = 'Work') => ({
  action: 'saveBookmark',
  input: { url, folder },
});

beforeEach(async () => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  await saveSettings({ language: 'en' });
  setLanguage('en');
  bookmarks = installFakeBookmarks([
    { id: 'bar', title: 'Bookmarks Bar' },
    { id: 'work', parentId: 'bar', title: 'Work' },
    { id: 'old', parentId: 'bar', title: 'Old' },
    { id: 'b1', parentId: 'old', title: 'Spec', url: 'https://e2e.invalid/spec' },
  ]);
});

describe('runBatch', () => {
  it('runs the steps in order and makes their changes one undo step', async () => {
    const result = await run('runBatch', {
      steps: [
        { action: 'searchBookmarks', input: { query: 'spec' } },
        save('https://e2e.invalid/a'),
        save('https://e2e.invalid/b'),
      ],
    });
    expect((result.results as { action: string }[]).map((step) => step.action)).toEqual([
      'searchBookmarks',
      'saveBookmark',
      'saveBookmark',
    ]);
    expect(result.failedAt).toBeUndefined();
    expect(bookmarks.childIds('work')).toHaveLength(2);
    expect((await bookmarkHistoryValue.get()).undo).toHaveLength(1);

    expect(await run('undoChange', { change: result.change })).toMatchObject({ undone: 2 });
    expect(bookmarks.childIds('work')).toEqual([]);
  });

  it('stops at the first failed step and keeps the steps before it, after checking every step first', async () => {
    const result = await run('runBatch', {
      steps: [
        save('https://e2e.invalid/a'),
        // Passes the checks made before the batch runs, fails when it runs.
        { action: 'listFolders', input: { under: 'No such folder' } },
        save('https://e2e.invalid/c'),
      ],
    });
    expect(result.failedAt).toBe(1);
    expect(result.results).toHaveLength(2);
    expect(bookmarks.childIds('work')).toHaveLength(1);
    // A step the checks catch refuses the whole batch before anything runs.
    expect(
      await run('runBatch', {
        steps: [save('https://e2e.invalid/d'), save('https://e2e.invalid/e', 'No such folder')],
      }),
    ).toMatchObject({ error: { message: expect.stringMatching(/^Step 2:/) } });
    expect(bookmarks.childIds('work')).toHaveLength(1);
  });

  it('refuses before running anything: a step that keeps its own undo step, a batch, or a turned-off action', async () => {
    for (const step of [
      { action: 'undoChange', input: { change: 'x' } },
      { action: 'applyChanges', input: { planId: 'x' } },
      { action: 'runBatch', input: { steps: [] } },
    ]) {
      expect(await run('runBatch', { steps: [save('https://e2e.invalid/a'), step] })).toMatchObject(
        { error: { code: 'not_allowed', message: expect.stringMatching(/^Step 2:/) } },
      );
    }
    const settings = { ...defaultSettings, askAiDisabledActions: ['saveBookmark'] };
    expect(
      await run('runBatch', { steps: [save('https://e2e.invalid/a')] }, { settings }),
    ).toMatchObject({ error: { code: 'not_allowed' } });
    expect(bookmarks.childIds('work')).toEqual([]);
    expect(
      await checkActionCall('runBatch', { steps: [{ action: 'nothing' }] }, context()),
    ).toMatchObject({ error: { code: 'not_found' } });
  });

  it('asks as its riskiest step does, and lists every step in the approval', () => {
    const reads = { steps: [{ action: 'searchBookmarks', input: { query: 'a' } }] };
    const writes = { steps: [reads.steps[0], save('https://e2e.invalid/a')] };
    expect(callRisk('runBatch', reads)).toBe('read');
    expect(callRisk('runBatch', writes)).toBe('write');
    expect(actionApproval('runBatch', reads, { untrustedContentSeen: true })).toBe('none');
    expect(actionApproval('runBatch', writes, { untrustedContentSeen: true })).toBe('untrusted');
    expect(actionApproval('runBatch', writes, { untrustedContentSeen: false })).toBe('none');
    expect(actionApprovalPreview('runBatch')?.lines?.(writes)).toHaveLength(2);
  });
});

describe('the ui client', () => {
  it('runs actions agents are not offered, and leaves no AI activity', async () => {
    await saveSettings({ aiActivityRecording: true });
    const settings = { ...defaultSettings, aiActivityRecording: true };
    // Agents make moves only through an approved plan; the user moves directly.
    expect(
      await run(
        'moveBookmarks',
        { refs: ['b:b1'], to: 'Work' },
        { client: { kind: 'askAI' }, settings },
      ),
    ).toMatchObject({ error: { code: 'not_allowed' } });
    expect(
      await run(
        'moveBookmarks',
        { refs: ['b:b1'], to: 'Work' },
        { client: { kind: 'ui' }, settings },
      ),
    ).not.toHaveProperty('error');
    expect(bookmarks.get('b1')?.parentId).toBe('work');
    expect(await aiActivityValue.get()).toEqual([]);
  });
});
