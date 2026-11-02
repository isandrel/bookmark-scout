/**
 * The Tools sidebar's long tools as actions (`services/job-actions.ts`): starting a background job
 * through the coordinator the context hands over, listing jobs, reading results a page at a time,
 * and pausing, resuming, and cancelling.
 */
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import { closeJobDb } from '@/lib/job-store';
import { defaultSettings } from '@/lib/settings-schema';
import { saveSettings } from '@/lib/settings-storage';
import type { ActionContext } from '@/services/action-kit';
import { actionApprovalPreview, runAction } from '@/services/actions';
import {
  resetJobCoordinatorForTests,
  runJobCommand,
  whenJobsIdle,
} from '@/services/job-coordinator';
import { installFakeBookmarks } from '../fake-bookmarks';
import { installFakePermissions } from '../fake-permissions';

const context = (overrides: Partial<ActionContext> = {}): ActionContext => ({
  client: { kind: 'askAI' },
  settings: { ...defaultSettings, language: 'en' },
  activeTab: async () => undefined,
  jobCommand: runJobCommand,
  ...overrides,
});

const run = (name: string, input: unknown, overrides: Partial<ActionContext> = {}) =>
  runAction(name, input, context(overrides)) as Promise<Record<string, unknown>>;

beforeEach(async () => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  await closeJobDb();
  globalThis.indexedDB = new IDBFactory();
  resetJobCoordinatorForTests();
  installFakePermissions({ origins: [...WEB_ORIGINS] });
  await saveSettings({ language: 'en' });
  setLanguage('en');
  installFakeBookmarks([
    { id: 'bar', title: 'Bookmarks Bar' },
    { id: 'f', parentId: 'bar', title: 'Reading' },
    { id: 'b1', parentId: 'f', title: 'One', url: 'https://e2e.invalid/1' },
    { id: 'b2', parentId: 'f', title: 'Two', url: 'https://e2e.invalid/2' },
  ]);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status: 200 })),
  );
});

afterEach(async () => {
  await whenJobsIdle().catch(() => undefined);
  vi.unstubAllGlobals();
});

describe('job actions', () => {
  it('starts a tool on a folder as an agent job, lists it, and reads its results a page at a time', async () => {
    const started = await run('startTool', { tool: 'deadLinks', folder: 'Bookmarks Bar/Reading' });
    expect(started).toMatchObject({ tool: 'deadLinks', scope: 'Reading', total: 2 });
    await whenJobsIdle();
    const listed = await run('listBackgroundJobs', {});
    expect(listed.jobs).toEqual([expect.objectContaining({ id: started.id, state: 'succeeded' })]);
    const results = await run('getJobResults', { id: started.id });
    expect(results).toMatchObject({ total: 2, job: { id: started.id } });
    expect(results.results).toHaveLength(2);
  });

  it('refuses an unknown folder before asking, and an unknown job', async () => {
    expect(await run('startTool', { tool: 'deadLinks', folder: 'Nowhere' })).toMatchObject({
      error: {},
    });
    expect(await run('getJobResults', { id: 'nothing' })).toMatchObject({
      error: { code: 'not_found' },
    });
    expect(await run('cancelJob', { id: 'nothing' })).toMatchObject({
      error: { code: 'not_found' },
    });
  });

  it('cancels a job, and sends the command from a page when no coordinator is at hand', async () => {
    const sent: unknown[] = [];
    vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockImplementation(async (message: unknown) => {
      sent.push(message);
      return runJobCommand((message as { command: Parameters<typeof runJobCommand>[0] }).command);
    });
    const started = await run(
      'startTool',
      { tool: 'deadLinks' },
      { client: { kind: 'ui' }, jobCommand: undefined },
    );
    expect(sent).toEqual([
      expect.objectContaining({ command: expect.objectContaining({ source: 'manager' }) }),
    ]);
    const cancelled = await run('cancelJob', { id: started.id });
    expect(['cancelled', 'cancel_requested', 'succeeded']).toContain(cancelled.state);
  });

  it('names the tool and where it runs in the approval', () => {
    expect(actionApprovalPreview('startTool')?.lines?.({ tool: 'deadLinks' })).toEqual([
      'Run Check Dead Links on all bookmarks',
    ]);
  });
});
