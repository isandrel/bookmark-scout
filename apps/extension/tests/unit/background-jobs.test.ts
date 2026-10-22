import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import * as jobStore from '@/lib/job-store';
import {
  acceptJob,
  claimJob,
  closeJobDb,
  commitItem,
  getJob,
  getJobItems,
  JOB_DB_NAME,
  JOB_LIMITS,
  JobStoreError,
  listJobs,
  pruneJobs,
  transitionJob,
} from '@/lib/job-store';
import { checkDeadLink, RequestAbortedError } from '@/services/bookmark-network-tools';
import { JOB_ADAPTERS } from '@/services/job-adapters';
import {
  registerJobs,
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

/** A Check Dead Links job over `count` links, stored as a Start leaves it, before any run. */
const acceptDeadLinks = (count: number) =>
  acceptJob({
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
    inputs: links(count).map((link) => ({
      id: link.id,
      title: link.title,
      url: link.url,
      folderPath: 'Folder',
    })),
    now: 1,
  });

/** Wakes this background with a command that finds no job, as any message or alarm would. */
const wake = () => runJobCommand({ type: 'pause', jobId: crypto.randomUUID() });

const start = (commandId = crypto.randomUUID(), folderId = 'f') =>
  runJobCommand({
    type: 'start',
    commandId,
    kind: 'deadLinks',
    source: 'manager',
    scope: { mode: 'folder', folderId },
  });

let permissions: ReturnType<typeof installFakePermissions>;

beforeEach(async () => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  await closeJobDb();
  globalThis.indexedDB = new IDBFactory();
  resetJobCoordinatorForTests();
  // Started from a page, which asked for the bookmarks' sites first.
  permissions = installFakePermissions({ origins: [...WEB_ORIGINS] });
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
    // Finish one, then pause with the others in flight. Results are saved in batches, so wait
    // until the finished link's worker moved on to the next one.
    const first = held.requests.length;
    held.waiting[0]?.resolve();
    await until(() => held.requests.length === first + 1);
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
    const first = held.requests.length;
    held.waiting[0]?.resolve();
    await until(() => held.requests.length === first + 1);
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
    const { job } = await acceptDeadLinks(6);
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

describe('a reply that comes too late (J15)', () => {
  it('cannot add a result, count, or start more work once the job is cancelled', async () => {
    const held = heldFetch();
    vi.stubGlobal('fetch', held.fetch);
    const response = await start();
    if (!response.ok || !response.job) throw new Error('not accepted');
    const jobId = response.job.id;
    await until(() => held.waiting.length > 0);
    await runJobCommand({ type: 'cancel', jobId });
    await until(async () => (await getJob(jobId))?.state === 'cancelled');
    const cancelled = await getJob(jobId);
    const requested = held.requests.length;
    // The answer of a request that was in flight arrives after the cancel, for the same claim.
    const [pending] = (await getJobItems(jobId)).filter((item) => item.state === 'pending');
    if (!cancelled || !pending) throw new Error('nothing left to do');
    expect(
      await commitItem(jobId, cancelled.generation, pending.index, 'succeeded', {}),
    ).toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(await getJob(jobId)).toMatchObject({
      done: cancelled.done,
      revision: cancelled.revision,
    });
    expect(held.requests).toHaveLength(requested);
  });
});

describe('scheduling (J20, J21, J23)', () => {
  it('runs a job stored before a stopped worker scheduled it, and sets the alarm again (J20, J21)', async () => {
    const held = heldFetch();
    vi.stubGlobal('fetch', held.fetch);
    // The Start was stored, then the worker stopped before it set the alarm or started a run.
    const { job } = await acceptDeadLinks(2);
    expect(await browser.alarms.getAll()).toHaveLength(0);

    await wake();
    await until(async () => (await browser.alarms.getAll()).length === 1);
    await drain(held, job.id);
    expect(held.requests).toHaveLength(2);
  });

  it('removes the alarm once nothing can run, and keeps finished jobs readable (J23)', async () => {
    const held = heldFetch();
    vi.stubGlobal('fetch', held.fetch);
    const response = await start();
    if (!response.ok || !response.job) throw new Error('not accepted');
    expect(await browser.alarms.getAll()).toHaveLength(1);
    await drain(held, response.job.id);
    await whenJobsIdle();
    await until(async () => (await browser.alarms.getAll()).length === 0);
    expect((await getJob(response.job.id))?.state).toBe('succeeded');
    expect(await getJobItems(response.job.id)).toHaveLength(6);
  });
});

describe('storage limits and records it cannot read (J66, J67)', () => {
  it('stores nothing of a job too large to keep, and answers that it could not', async () => {
    const accepting = acceptJob({
      commandId: crypto.randomUUID(),
      kind: 'deadLinks',
      source: 'manager',
      scope: { mode: 'all', rootIds: [], label: '' },
      options: {},
      inputs: Array.from({ length: JOB_LIMITS.maxItems + 1 }, () => 'x'),
      now: 1,
    });
    await expect(accepting).rejects.toBeInstanceOf(JobStoreError);
    expect(await listJobs()).toHaveLength(0);
  });

  it('never runs, lists, or removes a job stored in another format (J66)', async () => {
    const held = heldFetch();
    vi.stubGlobal('fetch', held.fetch);
    const { job } = await acceptDeadLinks(2);
    // A newer release stored this job in a format this one does not know.
    const raw = await openDB(JOB_DB_NAME);
    await raw.put('jobs', { ...job, schemaVersion: job.schemaVersion + 1 });

    expect(await runJobCommand({ type: 'resume', jobId: job.id })).toEqual({
      ok: false,
      error: 'not-found',
    });
    await whenJobsIdle();
    expect(await listJobs()).toHaveLength(0);
    expect(await pruneJobs(Number.MAX_SAFE_INTEGER)).toBe(0);
    expect(await raw.get('jobs', job.id)).toBeDefined();
    expect(held.requests).toHaveLength(0);
    raw.close();
  });
});

describe('the clock (J69)', () => {
  it('never counts negative time when the clock went back while a worker ran the job', async () => {
    const held = heldFetch();
    vi.stubGlobal('fetch', held.fetch);
    const { job } = await acceptDeadLinks(2);
    // A worker that has since stopped claimed it an hour ahead of the clock now.
    await claimJob(job.id, 'stopped-worker', Date.now() + 60 * 60 * 1000);

    await wake();
    await drain(held, job.id);
    const finished = await getJob(job.id);
    expect(finished?.activeMs).toBeGreaterThanOrEqual(0);
    expect(finished?.activeMs).toBeLessThan(60 * 60 * 1000);
  });
});

describe('a worker that just started (J18, J21, J22)', () => {
  it('answers commands sent before it finished starting, and a repeated Start once (J18, J21)', async () => {
    const held = heldFetch();
    vi.stubGlobal('fetch', held.fetch);
    const commandId = crypto.randomUUID();
    // Both arrive before the first wake has reconciled the store.
    const [first, again] = await Promise.all([start(commandId), start(commandId)]);
    if (!first.ok || !again.ok || !first.job || !again.job) throw new Error('not accepted');
    expect(again.job.id).toBe(first.job.id);
    expect(await listJobs()).toHaveLength(1);
    await drain(held, first.job.id);
    expect(held.requests).toHaveLength(6);
  });

  it('runs each item once when the alarm fires late and twice at once (J22)', async () => {
    const held = heldFetch();
    vi.stubGlobal('fetch', held.fetch);
    registerJobs();
    const { job } = await acceptDeadLinks(4);
    const alarm = { name: 'bookmark-scout:jobs', scheduledTime: 0 };
    await Promise.all([
      fakeBrowser.alarms.onAlarm.trigger(alarm),
      fakeBrowser.alarms.onAlarm.trigger(alarm),
    ]);
    await drain(held, job.id);
    expect(held.requests).toHaveLength(4);
    expect(new Set(held.requests).size).toBe(4);
  });
});

describe('a short job started during a long one (J32)', () => {
  it("runs between the long one's slices instead of waiting for it to end", async () => {
    const big = JOB_LIMITS.sliceMaxItems * 2 + 1;
    installFakeBookmarks([
      { id: 'big', title: 'Big' },
      { id: 'small', title: 'Small' },
      ...Array.from({ length: big }, (_, index) => ({
        id: `big${index}`,
        parentId: 'big',
        title: `Big ${index}`,
        url: `https://e2e.invalid/big/${index}`,
      })),
      { id: 's1', parentId: 'small', title: 'S1', url: 'https://e2e.invalid/small/1' },
    ]);
    const order: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        order.push(new URL(input).pathname);
        return new Response('', { status: 200 });
      }),
    );
    const long = await start(crypto.randomUUID(), 'big');
    const short = await start(crypto.randomUUID(), 'small');
    if (!long.ok || !short.ok || !long.job || !short.job) throw new Error('not accepted');
    await whenJobsIdle();
    // The short job's one link was asked for before the long job's last slice.
    expect(order.indexOf('/small/1')).toBeLessThan(order.length - 1 - JOB_LIMITS.sliceMaxItems);
    expect((await getJob(short.job.id))?.state).toBe('succeeded');
    expect((await getJob(long.job.id))?.done.succeeded).toBe(big);
  });
});

describe('jobs side by side (J30, J56)', () => {
  it('runs two jobs over the same sites one after the other (J30)', async () => {
    const held = heldFetch();
    vi.stubGlobal('fetch', held.fetch);
    const first = await start();
    const second = await start();
    if (!first.ok || !second.ok || !first.job || !second.job) throw new Error('not accepted');
    await until(() => held.waiting.length > 0);
    expect((await getJob(second.job.id))?.state).toBe('queued');
    await drain(held, first.job.id);
    await drain(held, second.job.id);
    // Each job asked for each link once.
    expect(held.requests).toHaveLength(12);
  });

  it('removes a finished job but never one still running (J56)', async () => {
    const held = heldFetch();
    vi.stubGlobal('fetch', held.fetch);
    const running = await start();
    if (!running.ok || !running.job) throw new Error('not accepted');
    await until(() => held.waiting.length > 0);
    await runJobCommand({ type: 'delete', jobId: running.job.id });
    expect(await getJob(running.job.id)).toBeDefined();
    await drain(held, running.job.id);
    await runJobCommand({ type: 'delete', jobId: running.job.id });
    expect(await getJob(running.job.id)).toBeUndefined();
    expect(await getJobItems(running.job.id)).toHaveLength(0);
  });
});

describe('when saving fails, and how a job ends (J26, J65, J71)', () => {
  it('counts nothing a failed save did not keep, pauses with the reason, and goes on when resumed (J26)', async () => {
    const held = heldFetch();
    vi.stubGlobal('fetch', held.fetch);
    vi.spyOn(jobStore, 'commitItems').mockRejectedValueOnce(new JobStoreError('write-failed'));
    const response = await start();
    if (!response.ok || !response.job) throw new Error('not accepted');
    const jobId = response.job.id;
    await until(async () => {
      held.releaseAll();
      return (await getJob(jobId))?.state === 'paused';
    });
    const job = await getJob(jobId);
    const items = await getJobItems(jobId);
    // The counters and the items agree: what was not saved is still to do, and not counted.
    const done = items.filter((item) => item.state === 'done').length;
    expect(jobStore.processedCount(job ?? { done: { succeeded: 0, skipped: 0, failed: 0 } })).toBe(
      done,
    );
    expect(job?.lastError?.code).toBe('slice-setup');

    await runJobCommand({ type: 'resume', jobId });
    await drain(held, jobId);
    // Every link counted once in the end, those whose save failed included.
    expect((await getJob(jobId))?.done.succeeded).toBe(6);
  });

  it('lets another page upgrade the store, and answers commands with an error, not a hang (J65)', async () => {
    const { job } = await acceptDeadLinks(1);
    // A newer release opens the store at a higher version while this one has it open.
    const newer = await openDB(JOB_DB_NAME, 2);
    newer.close();
    expect(await runJobCommand({ type: 'pause', jobId: job.id })).toEqual({
      ok: false,
      error: 'store',
    });
  });

  it('ends as partial when some items could not be checked, with counts that match the items (J71)', async () => {
    const held = heldFetch();
    vi.stubGlobal('fetch', held.fetch);
    const check = JOB_ADAPTERS.deadLinks;
    if (!('run' in check)) throw new Error('not an item adapter');
    const run = check.run.bind(check);
    vi.spyOn(check, 'run').mockImplementation((input, ...rest) =>
      (input as { url: string }).url.endsWith('/3')
        ? Promise.reject(new TypeError('unreadable'))
        : run(input, ...rest),
    );
    const response = await start();
    if (!response.ok || !response.job) throw new Error('not accepted');
    await drain(held, response.job.id);
    const job = await getJob(response.job.id);
    const items = await getJobItems(response.job.id);
    expect(job?.state).toBe('partial');
    expect(job?.done).toEqual({ succeeded: 5, skipped: 0, failed: 1 });
    expect(items.map((item) => item.outcome)).toEqual([
      'succeeded',
      'succeeded',
      'failed',
      'succeeded',
      'succeeded',
      'succeeded',
    ]);
  });
});

describe('a busy or refusing site (J34)', () => {
  const target = (path: string) => ({
    id: 'b',
    title: 'B',
    url: `https://e2e.invalid${path}`,
    folderPath: '',
  });
  const options = {
    requestTimeoutMs: 1000,
    concurrency: 1,
    retryCount: 1,
    followRedirects: true,
    successStatuses: [200],
  };

  it('asks a busy site again after a short Retry-After, and reports a long, missing, or unreadable one at once', async () => {
    const answers: Record<string, () => Response> = {
      '/soon': () => new Response('', { status: 429, headers: { 'Retry-After': '0' } }),
      '/tomorrow': () => new Response('', { status: 429, headers: { 'Retry-After': '86400' } }),
      '/unreadable': () => new Response('', { status: 503, headers: { 'Retry-After': 'soon' } }),
      '/silent': () => new Response('', { status: 503 }),
    };
    const fetch = vi.fn(async (input: string, _init?: RequestInit) => {
      const answer = answers[new URL(input).pathname];
      return answer?.() ?? new Response('', { status: 200 });
    });
    vi.stubGlobal('fetch', fetch);
    const asked = (path: string) =>
      fetch.mock.calls
        .filter(([url]) => new URL(url).pathname === path)
        .map(([, init]) => init?.method);

    // Still busy when asked again: one more round (HEAD, then the GET it falls back to), then
    // reported. The Retry Count setting bounds it.
    expect(await checkDeadLink(target('/soon'), options)).toMatchObject({
      statusCode: 429,
      category: 'rateLimited',
    });
    expect(asked('/soon')).toEqual(['HEAD', 'GET', 'HEAD', 'GET']);
    for (const path of ['/tomorrow', '/unreadable', '/silent']) {
      await checkDeadLink(target(path), options);
      expect(asked(path)).toEqual(['HEAD', 'GET']);
    }
    // With no retries allowed, a short Retry-After is reported at once too.
    await checkDeadLink(target('/soon'), { ...options, retryCount: 0 });
    expect(asked('/soon')).toHaveLength(6);
  });

  it('counts a site that answers once its Retry-After has passed as reachable', async () => {
    let busy = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        if (!busy) return new Response('', { status: 200 });
        return new Response('', { status: 429, headers: { 'Retry-After': '0' } });
      }),
    );
    const checking = checkDeadLink(target('/later'), options);
    busy = false;
    expect(await checking).toMatchObject({ status: 'ok', statusCode: 200 });
  });

  it('stops while waiting out a Retry-After, as a stopped check', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 429, headers: { 'Retry-After': '5' } })),
    );
    const controller = new AbortController();
    const checking = checkDeadLink(target('/wait'), options, controller.signal);
    await new Promise((resolve) => setTimeout(resolve, 20));
    controller.abort();
    await expect(checking).rejects.toBeInstanceOf(RequestAbortedError);
  });
});
describe('website access taken back while a job runs (J51)', () => {
  it('pauses with the reason and sends nothing more, then finishes once access is back', async () => {
    const held = heldFetch();
    vi.stubGlobal('fetch', held.fetch);
    const response = await start();
    if (!response.ok || !response.job) throw new Error('not accepted');
    const jobId = response.job.id;
    await until(() => held.waiting.length > 0);
    const inFlight = held.waiting.length;
    permissions.revoke({ origins: [...WEB_ORIGINS] });
    // The checks already in flight end; nothing new starts without access.
    held.releaseAll();
    await until(async () => (await getJob(jobId))?.state === 'paused');
    expect((await getJob(jobId))?.lastError?.code).toBe('site-access');
    expect(held.requests).toHaveLength(inFlight);
    expect((await getJob(jobId))?.done.failed).toBe(0);

    permissions.grant({ origins: [...WEB_ORIGINS] });
    await runJobCommand({ type: 'resume', jobId });
    await drain(held, jobId);
    expect((await getJob(jobId))?.done.succeeded).toBe(6);
    expect(new Set(held.requests).size).toBe(6);
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

  it('takes the sites the user chose with a start, as site names only (S03)', () => {
    const start = {
      type: 'start',
      commandId: crypto.randomUUID(),
      kind: 'pageText',
      source: 'manager',
      scope: { mode: 'all' },
    };
    expect(jobCommandSchema.safeParse(start).success).toBe(true);
    expect(
      jobCommandSchema.safeParse({ ...start, sites: ['example.com', 'localhost'] }).success,
    ).toBe(true);
    expect(jobCommandSchema.safeParse({ ...start, sites: [] }).success).toBe(true);
    for (const site of ['https://example.com/', '*.example.com', 'www.example.com']) {
      expect(jobCommandSchema.safeParse({ ...start, sites: [site] }).success).toBe(false);
    }
  });
});
