import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  acceptJob,
  claimJob,
  closeJobDb,
  commitItem,
  getJob,
  getJobItems,
  transitionJob,
} from '@/lib/job-store';
import { checkDeadLink, RequestAbortedError } from '@/services/bookmark-network-tools';
import {
  resetJobCoordinatorForTests,
  runJobCommand,
  whenJobsIdle,
} from '@/services/job-coordinator';
import { isExtensionPageSender, jobCommandSchema } from '@/services/job-protocol';
import { installFakeBookmarks } from '../fake-bookmarks';
import { installFakePermissions } from '../fake-permissions';

/** A fetch that holds every request until the test releases it, and counts them per URL. */
function heldFetch() {
  const requests: string[] = [];
  const waiting: { url: string; resolve: () => void; reject: (error: unknown) => void }[] = [];
  const fetch = vi.fn((input: string, init?: RequestInit) => {
    requests.push(String(input));
    return new Promise<Response>((resolve, reject) => {
      const entry = {
        url: String(input),
        resolve: () => {
          waiting.splice(waiting.indexOf(entry), 1);
          resolve(new Response('', { status: 200 }));
        },
        reject,
      };
      waiting.push(entry);
      init?.signal?.addEventListener('abort', () => {
        waiting.splice(waiting.indexOf(entry), 1);
        reject(new DOMException('Aborted', 'AbortError'));
      });
    });
  });
  const releaseAll = () => {
    for (const entry of [...waiting]) entry.resolve();
  };
  return { fetch, requests, waiting, releaseAll };
}

const until = async (check: () => boolean | Promise<boolean>) => {
  for (let tries = 0; tries < 400; tries += 1) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('timed out waiting');
};

const FINISHED = ['succeeded', 'partial'];

/** Lets every held request answer until the job finishes. */
const drain = (held: ReturnType<typeof heldFetch>, jobId: string) =>
  until(async () => {
    held.releaseAll();
    return FINISHED.includes((await getJob(jobId))?.state ?? '');
  });

const links = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `b${index + 1}`,
    parentId: 'f',
    title: `Link ${index + 1}`,
    url: `https://e2e.invalid/${index + 1}`,
  }));

const start = (commandId = crypto.randomUUID(), folderId = 'f') =>
  runJobCommand({
    type: 'start',
    commandId,
    kind: 'deadLinks',
    source: 'manager',
    scope: { mode: 'folder', folderId },
  });

beforeEach(async () => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  await closeJobDb();
  globalThis.indexedDB = new IDBFactory();
  resetJobCoordinatorForTests();
  installFakePermissions();
  installFakeBookmarks([{ id: 'f', title: 'Folder' }, ...links(6), { id: 'g', title: 'Other' }]);
});

afterEach(async () => {
  await whenJobsIdle().catch(() => undefined);
  vi.unstubAllGlobals();
});

describe('accepting a job (J03, J04, J06)', () => {
  it('returns the same job for a repeated Start, and a new one for a new command (J03, J04)', async () => {
    const held = heldFetch();
    vi.stubGlobal('fetch', held.fetch);
    const commandId = crypto.randomUUID();
    const first = await start(commandId);
    const again = await start(commandId);
    if (!first.ok || !again.ok || !first.job || !again.job) throw new Error('not accepted');
    expect(again.job.id).toBe(first.job.id);
    expect(first.job.total).toBe(6);
    const fresh = await start();
    expect(fresh.ok && fresh.job?.id).not.toBe(first.job.id);
    await drain(held, first.job.id);
    if (fresh.ok && fresh.job) await drain(held, fresh.job.id);
  });

  it('freezes the folder and its bookmarks when accepted (J06)', async () => {
    const held = heldFetch();
    vi.stubGlobal('fetch', held.fetch);
    const response = await start();
    if (!response.ok || !response.job) throw new Error('not accepted');
    // A bookmark added after the start is not part of the job.
    await fakeBrowser.bookmarks.create({
      parentId: 'f',
      title: 'Later',
      url: 'https://e2e.invalid/later',
    });
    await drain(held, response.job.id);
    expect(held.requests.some((url) => url.endsWith('/later'))).toBe(false);
    expect(response.job.scope).toMatchObject({ mode: 'folder', rootIds: ['f'], label: 'Folder' });
  });
});

describe('pause, resume, and cancel (J09, J10, J12, J13)', () => {
  it('pauses only once work in flight settles, then resumes the rest (J09, J10, J12)', async () => {
    const held = heldFetch();
    vi.stubGlobal('fetch', held.fetch);
    const response = await start();
    if (!response.ok || !response.job) throw new Error('not accepted');
    const jobId = response.job.id;
    await until(() => held.waiting.length > 0);
    // Finish one, then pause with the others in flight.
    held.waiting[0]?.resolve();
    await until(async () => (await getJob(jobId))?.done.succeeded === 1);
    const paused = await runJobCommand({ type: 'pause', jobId });
    const again = await runJobCommand({ type: 'pause', jobId });
    expect(paused.ok && again.ok).toBe(true);
    await until(async () => (await getJob(jobId))?.state === 'paused');
    expect(held.waiting).toHaveLength(0);
    const requestedBefore = held.requests.length;
    await new Promise((resolve) => setTimeout(resolve, 30));
    // Nothing new starts while paused.
    expect(held.requests.length).toBe(requestedBefore);
    expect((await getJob(jobId))?.done.succeeded).toBe(1);

    await runJobCommand({ type: 'resume', jobId });
    await runJobCommand({ type: 'resume', jobId });
    await drain(held, jobId);
    const job = await getJob(jobId);
    expect(job?.done.succeeded).toBe(6);
    // The link checked before the pause was not asked for again.
    expect(held.requests.filter((url) => url.endsWith('/1'))).toHaveLength(1);
  });

  it('cancels keeping every result so far, and nothing runs after (J13)', async () => {
    const held = heldFetch();
    vi.stubGlobal('fetch', held.fetch);
    const response = await start();
    if (!response.ok || !response.job) throw new Error('not accepted');
    const jobId = response.job.id;
    await until(() => held.waiting.length > 0);
    held.waiting[0]?.resolve();
    await until(async () => (await getJob(jobId))?.done.succeeded === 1);
    await runJobCommand({ type: 'cancel', jobId });
    await until(async () => (await getJob(jobId))?.state === 'cancelled');
    const items = await getJobItems(jobId);
    expect(items.filter((item) => item.state === 'done')).toHaveLength(1);
    expect((await getJob(jobId))?.finishedAt).toBeDefined();
  });
});

describe('a stopped worker (J17, J25)', () => {
  it('starts again from the saved items, and a later item done first skips none', async () => {
    const held = heldFetch();
    vi.stubGlobal('fetch', held.fetch);
    const inputs = links(6).map((link) => ({
      id: link.id,
      title: link.title,
      url: link.url,
      folderPath: 'Folder',
    }));
    const { job } = await acceptJob({
      commandId: crypto.randomUUID(),
      kind: 'deadLinks',
      source: 'manager',
      scope: { mode: 'folder', rootIds: ['f'], label: 'Folder' },
      options: {
        requestTimeoutMs: 5000,
        concurrency: 2,
        retryCount: 0,
        followRedirects: true,
        successStatuses: [200],
        allSitesAccess: true,
      },
      inputs,
      now: 1,
    });
    // A worker that has since stopped claimed it and finished the third link before the first two.
    const claimed = await claimJob(job.id, 'stopped-worker');
    await commitItem(job.id, claimed?.generation ?? 0, 2, 'succeeded', { status: 'ok' });

    // Any command wakes a new worker, which reconciles first.
    await runJobCommand({ type: 'resume', jobId: job.id });
    await drain(held, job.id);
    const finished = await getJob(job.id);
    expect(finished?.done.succeeded).toBe(6);
    // The third link was not asked for again; every other one once.
    expect(held.requests.filter((url) => url.endsWith('/3'))).toHaveLength(0);
    expect(held.requests).toHaveLength(5);
    expect(finished?.generation).toBe((claimed?.generation ?? 0) + 1);
  });

  it('keeps a job paused across a restart, and finishes cancelling one that was cancelling (J11)', async () => {
    const make = () =>
      acceptJob({
        commandId: crypto.randomUUID(),
        kind: 'deadLinks',
        source: 'manager',
        scope: { mode: 'all', rootIds: [], label: '' },
        options: {},
        inputs: ['x'],
        now: 1,
      });
    const pausing = (await make()).job;
    const cancelling = (await make()).job;
    await claimJob(pausing.id, 'stopped-worker');
    await claimJob(cancelling.id, 'stopped-worker');
    await transitionJob(pausing.id, ['running'], 'pause_requested');
    await transitionJob(cancelling.id, ['running'], 'cancel_requested');
    await runJobCommand({ type: 'pause', jobId: pausing.id });
    expect((await getJob(pausing.id))?.state).toBe('paused');
    expect((await getJob(cancelling.id))?.state).toBe('cancelled');
  });
});

describe('the store refuses late and duplicate results (J27, J28, J29)', () => {
  it('counts an item once and refuses a result from an older claim', async () => {
    const { job } = await acceptJob({
      commandId: crypto.randomUUID(),
      kind: 'deadLinks',
      source: 'manager',
      scope: { mode: 'all', rootIds: [], label: '' },
      options: {},
      inputs: ['a', 'b'],
      now: 1,
    });
    const first = await claimJob(job.id, 'one');
    const second = await claimJob(job.id, 'two');
    expect(second?.generation).toBe((first?.generation ?? 0) + 1);
    // The older claim's result is refused inside the transaction.
    expect(await commitItem(job.id, first?.generation ?? 0, 0, 'succeeded', {})).toBeUndefined();
    expect(await commitItem(job.id, second?.generation ?? 0, 0, 'succeeded', {})).toBeDefined();
    // The same result again is not counted twice.
    expect(await commitItem(job.id, second?.generation ?? 0, 0, 'succeeded', {})).toBeUndefined();
    expect((await getJob(job.id))?.done.succeeded).toBe(1);
  });
});

describe('stopping a check (J36)', () => {
  it('reports a stopped check as stopped, never as a dead link, and does not retry', async () => {
    const controller = new AbortController();
    const fetch = vi.fn((_input: string, init?: RequestInit) => {
      controller.abort();
      return Promise.reject(
        init?.signal?.aborted ? new DOMException('', 'AbortError') : new Error(),
      );
    });
    vi.stubGlobal('fetch', fetch);
    const target = { id: 'b', title: 'B', url: 'https://e2e.invalid/b', folderPath: '' };
    await expect(
      checkDeadLink(
        target,
        {
          requestTimeoutMs: 1000,
          concurrency: 1,
          retryCount: 2,
          followRedirects: true,
          successStatuses: [200],
        },
        controller.signal,
      ),
    ).rejects.toBeInstanceOf(RequestAbortedError);
    // No retry and no redirect probe after the stop.
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('who may send commands (J49, J50)', () => {
  it('accepts the extension pages only, not a content script with the same id', () => {
    const page = { id: browser.runtime.id, url: browser.runtime.getURL('/bookmarks.html') };
    const content = {
      id: browser.runtime.id,
      url: 'https://e2e.invalid/page',
      tab: { url: 'https://e2e.invalid/page' } as Browser.tabs.Tab,
    };
    expect(isExtensionPageSender(page)).toBe(true);
    expect(isExtensionPageSender(content)).toBe(false);
    expect(isExtensionPageSender({ ...page, id: 'another-extension' })).toBe(false);
  });

  it('rejects unknown kinds, forged ids, and extra fields', () => {
    const ok = { type: 'pause', jobId: crypto.randomUUID() };
    expect(jobCommandSchema.safeParse(ok).success).toBe(true);
    expect(jobCommandSchema.safeParse({ ...ok, jobId: '../../x' }).success).toBe(false);
    expect(jobCommandSchema.safeParse({ ...ok, extra: 1 }).success).toBe(false);
    expect(
      jobCommandSchema.safeParse({
        type: 'start',
        commandId: crypto.randomUUID(),
        kind: 'fetchAnything',
        source: 'manager',
        scope: { mode: 'all' },
      }).success,
    ).toBe(false);
  });
});
