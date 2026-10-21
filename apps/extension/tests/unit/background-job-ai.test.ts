import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { TOOL_DEFINITIONS } from '@/components/bookmarks/tools/tool-definitions';
import {
  acceptJob,
  claimJob,
  closeJobDb,
  getJob,
  getJobItems,
  JOB_DB_NAME,
  type JobRecord,
  markItemInFlight,
} from '@/lib/job-store';
import { saveSettings } from '@/lib/settings-storage';
import type { AISettings } from '@/services/ai-client';
import {
  resetJobCoordinatorForTests,
  runJobCommand,
  whenJobsIdle,
} from '@/services/job-coordinator';
import { AIHostError } from '@/services/quick-save-ai-host';
import { installFakeBookmarks } from '../fake-bookmarks';
import { installFakePermissions } from '../fake-permissions';

// The AI host page and the AI service are stand-ins: these tests check the job's contract (what
// is sent, when it stops, what it keeps), not a provider.
const ai = vi.hoisted(() => ({
  generate: vi.fn(),
  service: {
    enabled: true,
    provider: 'custom',
    model: 'synthetic-model',
    apiKey: '',
    baseUrl: 'https://provider.invalid/v1',
  } as AISettings,
}));
vi.mock('@/services/quick-save-ai-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/quick-save-ai-host')>()),
  withAIHost: async (
    _settings: unknown,
    _options: unknown,
    work: (session: { readHead: () => never; generate: typeof ai.generate }) => Promise<unknown>,
  ) =>
    work({
      readHead: () => {
        throw new Error('not used');
      },
      generate: ai.generate,
    }),
}));
vi.mock('@/services/ai-settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/ai-settings')>()),
  getActiveAISettings: async () => ai.service,
}));

/** The batch a request was for, by its first bookmark's title. */
const batchOf = (prompt: string) =>
  (JSON.parse(prompt) as { bookmarks: { title: string }[] }).bookmarks[0]?.title;

/** Moves each bookmark of the batch into "Sorted". */
const answer = (prompt: string) => ({
  operations: (JSON.parse(prompt) as { bookmarks: { id: string; title: string }[] }).bookmarks.map(
    (bookmark) => ({
      bookmarkId: bookmark.id,
      bookmarkTitle: bookmark.title,
      toFolderPath: 'Folder/Sorted',
      confidence: 0.9,
      reason: 'Sorted',
    }),
  ),
  summary: 'Sorted',
});

const start = async () => {
  const response = await runJobCommand({
    type: 'start',
    commandId: crypto.randomUUID(),
    kind: 'reorganization',
    source: 'manager',
    scope: { mode: 'folder', folderId: 'f' },
  });
  if (!response.ok || !response.job) throw new Error('not accepted');
  return response.job;
};

const requested = () => ai.generate.mock.calls.map(([request]) => batchOf(request.prompt));

const plan = async (job: JobRecord) => {
  const items = await getJobItems(job.id);
  const stored = await getJob(job.id);
  if (!stored) throw new Error('no job');
  return TOOL_DEFINITIONS.reorganization.job?.result(
    stored,
    items.flatMap((item) => (item.state === 'done' ? [item.result] : [])),
  );
};

beforeEach(async () => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  ai.generate.mockReset();
  ai.generate.mockImplementation(async ({ prompt }: { prompt: string }) => answer(prompt));
  ai.service = { ...ai.service, model: 'synthetic-model' };
  await closeJobDb();
  globalThis.indexedDB = new IDBFactory();
  resetJobCoordinatorForTests();
  installFakePermissions();
  // Two bookmarks a request: five bookmarks make three batches.
  await saveSettings({ language: 'en', aiEnabled: true, reorganizationBatchSize: 2 });
  installFakeBookmarks([
    { id: 'f', title: 'Folder' },
    ...['One', 'Two', 'Three', 'Four', 'Five'].map((title, index) => ({
      id: `b${index + 1}`,
      parentId: 'f',
      title,
      url: `https://e2e.invalid/${index + 1}`,
    })),
  ]);
});

afterEach(async () => {
  await whenJobsIdle().catch(() => undefined);
});

describe('AI Folder Reorganization as a background job', () => {
  it('sends one request a batch and builds the plan from the saved answers (J37, J41)', async () => {
    const job = await start();
    await whenJobsIdle();
    expect(await getJob(job.id)).toMatchObject({ state: 'succeeded', total: 3 });
    expect(requested()).toEqual(['One', 'Three', 'Five']);
    // The plan waits for review: nothing moved.
    expect((await plan(job))?.operations.map((op) => op.bookmarkTitle)).toEqual([
      'One',
      'Two',
      'Three',
      'Four',
      'Five',
    ]);
    expect((await fakeBrowser.bookmarks.getChildren('f')).map((node) => node.title)).toContain(
      'One',
    );
    // The job keeps where its requests go as a digest, never the service's settings.
    expect(JSON.stringify((await getJob(job.id))?.options)).not.toContain('provider.invalid');
  });

  it('keeps the other batches when one answer does not fit (J39)', async () => {
    ai.generate.mockImplementation(async ({ prompt }: { prompt: string }) => {
      if (batchOf(prompt) === 'Three') throw new AIHostError('No object', 'answer');
      return answer(prompt);
    });
    const job = await start();
    await whenJobsIdle();
    expect(await getJob(job.id)).toMatchObject({
      state: 'partial',
      done: { succeeded: 2, failed: 1 },
    });
    expect((await plan(job))?.operations.map((op) => op.bookmarkTitle)).toEqual([
      'One',
      'Two',
      'Five',
    ]);
  });

  it('pauses on a failed request with the reason, and resumes without asking for done batches again (J33, J35)', async () => {
    let failures = 1;
    ai.generate.mockImplementation(async ({ prompt }: { prompt: string }) => {
      if (batchOf(prompt) === 'Three' && failures-- > 0) {
        throw new AIHostError('The API key was rejected.');
      }
      return answer(prompt);
    });
    const job = await start();
    await whenJobsIdle();
    expect(await getJob(job.id)).toMatchObject({
      state: 'paused',
      done: { succeeded: 1 },
      lastError: { code: 'ai-request', message: 'The API key was rejected.' },
    });
    // Nothing runs again on its own.
    await runJobCommand({ type: 'pause', jobId: job.id });
    await whenJobsIdle();
    expect(requested()).toEqual(['One', 'Three']);

    await runJobCommand({ type: 'resume', jobId: job.id });
    await whenJobsIdle();
    expect(await getJob(job.id)).toMatchObject({ state: 'succeeded' });
    expect((await getJob(job.id))?.lastError).toBeUndefined();
    expect(requested()).toEqual(['One', 'Three', 'Three', 'Five']);
  });

  it('asks before sending again a request a stopped worker left unanswered (J38)', async () => {
    const job = await start();
    await whenJobsIdle();
    // A second job, left by a worker that stopped while its first request was out.
    ai.generate.mockClear();
    const { job: orphan } = await acceptJob({
      commandId: crypto.randomUUID(),
      kind: 'reorganization',
      source: 'manager',
      scope: job.scope,
      options: job.options,
      inputs: (await getJobItems(job.id)).map((item) => item.input),
      now: Date.now(),
    });
    const claimed = await claimJob(orphan.id, 'stopped-worker');
    if (!claimed) throw new Error('not claimed');
    await markItemInFlight(orphan.id, claimed.generation, 0, Date.now());

    resetJobCoordinatorForTests();
    await runJobCommand({ type: 'pause', jobId: crypto.randomUUID() });
    await whenJobsIdle();
    expect(await getJob(orphan.id)).toMatchObject({
      state: 'paused',
      lastError: { code: 'uncertain-request' },
    });
    expect(ai.generate).not.toHaveBeenCalled();

    // Resuming is the user's choice to send it again.
    await runJobCommand({ type: 'resume', jobId: orphan.id });
    await whenJobsIdle();
    expect(await getJob(orphan.id)).toMatchObject({ state: 'succeeded' });
    expect(requested()).toEqual(['One', 'Three', 'Five']);
  });

  it('sends nothing more to a service that changed while paused, or while AI is off (J52, J53)', async () => {
    const job = await start();
    await runJobCommand({ type: 'pause', jobId: job.id });
    await whenJobsIdle();
    const sentBefore = ai.generate.mock.calls.length;

    ai.service = { ...ai.service, model: 'another-model' };
    await runJobCommand({ type: 'resume', jobId: job.id });
    await whenJobsIdle();
    expect(await getJob(job.id)).toMatchObject({
      state: 'paused',
      lastError: { code: 'ai-service-changed' },
    });

    ai.service = { ...ai.service, model: 'synthetic-model' };
    await saveSettings({ aiEnabled: false });
    await runJobCommand({ type: 'resume', jobId: job.id });
    await whenJobsIdle();
    expect(await getJob(job.id)).toMatchObject({ state: 'paused', lastError: { code: 'ai-off' } });
    expect(ai.generate.mock.calls.length).toBe(sentBefore);
  });

  it('keeps the key, its headers, and the service address out of everything the job stores (J54)', async () => {
    // A value that must never be written: the key, a header, and the address it goes to.
    const canary = 'canary-key-0f3c9d';
    ai.service = {
      ...ai.service,
      apiKey: canary,
      baseUrl: `https://${canary}.invalid/v1`,
      extraHeaders: { 'X-Canary': canary },
    };
    const job = await start();
    await whenJobsIdle();
    expect((await getJob(job.id))?.state).toBe('succeeded');
    const raw = await openDB(JOB_DB_NAME);
    const stored = JSON.stringify(
      await Promise.all([...raw.objectStoreNames].map((name) => raw.getAll(name))),
    );
    raw.close();
    expect(stored).toContain('Folder/Sorted');
    expect(stored).not.toContain(canary);
  });
});
