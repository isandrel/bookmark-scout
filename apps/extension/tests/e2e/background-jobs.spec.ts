/**
 * Background jobs in a real browser: Check Dead Links runs in the background against a local
 * server that holds each request until the test lets it through, so the test sees exactly which
 * links were requested and when. The job keeps going with no page open, pauses and resumes
 * without asking again for links it already checked, picks up after the background worker is
 * stopped, and stays paused across a browser restart. IDs (J01...) are the acceptance tests in
 * the background jobs plan.
 */
import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  type BrowserContext,
  chromium,
  type Locator,
  type Page,
  type Worker,
} from '@playwright/test';
import { expect, test } from './fixtures';
import { managerUrl } from './manager-helpers';
import { removeTempDir } from './temp-dirs';
import { openTools, seedFolder, setSettings, toolCard } from './tool-helpers';

test.use({ grantWebHostAccess: true, viewport: { width: 1400, height: 900 } });

/** Links in the scanned folder; enough that a run takes several turns of the worker. */
const LINK_COUNT = 6;

type HeldSite = {
  origin: string;
  /** Every request, in arrival order, as "METHOD /path". */
  requests: string[];
  /** Answers the next `count` held requests (oldest first) with 200. */
  release: (count: number) => void;
  /** Answers every held request and every later one at once. */
  open: () => void;
  /** Holds later requests again. */
  hold: () => void;
  held: () => number;
  close: () => Promise<void>;
};

/** A real HTTP server whose links answer only when the test releases them. */
async function startHeldSite(): Promise<HeldSite> {
  const requests: string[] = [];
  const waiting: ServerResponse[] = [];
  let gateOpen = false;
  const answer = (res: ServerResponse) => {
    if (res.writableEnded || res.destroyed) return;
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<title>Held</title>');
  };
  const server: Server = createServer((req, res) => {
    requests.push(`${req.method} ${new URL(req.url ?? '/', 'http://localhost').pathname}`);
    if (gateOpen) answer(res);
    else waiting.push(res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  // A request the extension stopped (pause, or a stopped worker) closes its connection.
  const live = () => waiting.filter((res) => !res.destroyed && !res.writableEnded);
  return {
    origin: `http://127.0.0.1:${port}`,
    requests,
    release: (count) => {
      for (const res of live().slice(0, count)) answer(res);
    },
    open: () => {
      gateOpen = true;
      for (const res of live()) answer(res);
    },
    hold: () => {
      gateOpen = false;
    },
    held: () => live().length,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}

/** How many times each link was requested. */
function requestCounts(site: HeldSite): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const request of site.requests) counts[request] = (counts[request] ?? 0) + 1;
  return counts;
}

function links(site: HeldSite) {
  return Array.from({ length: LINK_COUNT }, (_, index) => ({
    title: `Link ${index + 1}`,
    url: `${site.origin}/link/${index + 1}`,
  }));
}

/** Sets the check to one HEAD request per link, with no retry and a timeout longer than a test. */
async function setDeadLinkSettings(worker: Worker, concurrency: number) {
  await setSettings(worker, {
    deadLinksConcurrency: concurrency,
    deadLinksRetryCount: 0,
    deadLinksRequestTimeoutMs: 60_000,
    deadLinksFollowRedirects: false,
    deadLinksDefaultScope: 'folder',
  });
}

type StoredJob = {
  id: string;
  state: string;
  total: number;
  done: { succeeded: number; skipped: number; failed: number };
  scope: { mode: string; rootIds: string[] };
};

/** The jobs as stored, read from an extension page or the worker. */
async function storedJobs(target: Page | Worker): Promise<StoredJob[]> {
  return target.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('bookmark-scout-jobs');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<StoredJob[]>((resolve, reject) => {
        const request = db.transaction('jobs').objectStore('jobs').getAll();
        request.onsuccess = () => resolve(request.result as StoredJob[]);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  });
}

/** Sends a job command the way the extension's pages do. */
async function sendCommand(page: Page, command: Record<string, unknown>) {
  return page.evaluate(
    (sent) => chrome.runtime.sendMessage({ type: 'bookmark-scout:job-command', command: sent }),
    command,
  );
}

function deadLinksStatus(page: Page): Locator {
  return toolCard(page, 'Check Dead Links').getByTestId('job-status');
}

async function startFromManager(page: Page, extensionId: string, folderId: string) {
  await openTools(page, extensionId, folderId);
  await toolCard(page, 'Check Dead Links').getByRole('button', { name: 'Scan' }).click();
  await expect(deadLinksStatus(page)).toBeVisible();
}

let site: HeldSite;
test.beforeEach(async () => {
  site = await startHeldSite();
});
test.afterEach(async () => {
  site.open();
  await site.close();
});

test('a job started in the manager keeps going with every page closed, and any page shows the same job (J01, J02, J05, J06)', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  const { folderId } = await seedFolder(extensionWorker, 'Jobs Folder', links(site));
  const other = await seedFolder(extensionWorker, 'Other Folder', [
    { title: 'Elsewhere', url: `${site.origin}/elsewhere` },
  ]);
  await setDeadLinkSettings(extensionWorker, 2);

  await startFromManager(page, extensionId, folderId);
  await expect.poll(() => site.held()).toBe(2);
  // J06: moving to another folder leaves the job on the folder it started on.
  await page.goto(managerUrl(extensionId, other.folderId));
  const [job] = await storedJobs(extensionWorker);
  expect(job).toMatchObject({ total: LINK_COUNT, scope: { mode: 'folder', rootIds: [folderId] } });

  // J01: with the page that started it closed, the job goes on.
  await page.close();
  site.release(2);
  await expect.poll(() => site.requests.length).toBe(4);

  // J02: the side panel shows the same running job and starts nothing.
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(panel.getByTestId('active-jobs-line')).toContainText('Check Dead Links: 2 of 6');
  expect(await storedJobs(panel)).toHaveLength(1);
  await panel.close();

  site.open();
  await expect.poll(async () => (await storedJobs(extensionWorker))[0]?.state).toBe('succeeded');
  // One request per link of the folder it started on, and none elsewhere.
  expect(requestCounts(site)).toEqual(
    Object.fromEntries(links(site).map((_, index) => [`HEAD /link/${index + 1}`, 1])),
  );

  // J05: results wait for any page that opens them later.
  const manager = await context.newPage();
  await openTools(manager, extensionId, folderId);
  const status = deadLinksStatus(manager);
  await expect(status).toHaveAttribute('data-job-state', 'succeeded');
  await expect(status.getByTestId('job-progress')).toContainText('6 of 6');
  await status.getByRole('button', { name: 'Review results' }).click();
  const results = manager.getByRole('dialog', { name: 'Check Dead Links' });
  await expect(results.locator('[data-slot="tool-result-row"]')).toHaveCount(LINK_COUNT);
  await results.getByRole('button', { name: 'Close' }).first().click();
  // Closing the review changes only what is shown.
  expect((await storedJobs(extensionWorker))[0]?.state).toBe('succeeded');
  expect(await storedJobs(extensionWorker)).toHaveLength(1);
});

test('pause stops new requests, and resume asks only for links not yet checked (J09, J10, J12)', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  const { folderId } = await seedFolder(extensionWorker, 'Pause Folder', links(site));
  await setDeadLinkSettings(extensionWorker, 2);

  await startFromManager(page, extensionId, folderId);
  await expect.poll(() => site.held()).toBe(2);
  site.release(2);
  // Links 1 and 2 are checked; 3 and 4 are in flight when Pause is pressed.
  await expect.poll(() => site.held()).toBe(2);
  const status = deadLinksStatus(page);
  await status.getByRole('button', { name: 'Pause' }).click();
  await expect(status).toHaveAttribute('data-job-state', 'paused');
  await expect(status.getByTestId('job-progress')).toContainText('2 of 6');
  const [paused] = await storedJobs(extensionWorker);
  // J12: a second Pause changes nothing.
  expect(await sendCommand(page, { type: 'pause', jobId: paused.id })).toMatchObject({
    ok: true,
    job: { state: 'paused' },
  });
  // Nothing new is asked for while paused.
  const requestsWhenPaused = site.requests.length;
  site.open();
  await page.waitForTimeout(500);
  expect(site.requests).toHaveLength(requestsWhenPaused);

  // J10, J12: Resume from two pages at once runs the same job once.
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await Promise.all([
    sendCommand(page, { type: 'resume', jobId: paused.id }),
    sendCommand(popup, { type: 'resume', jobId: paused.id }),
  ]);
  await expect(status).toHaveAttribute('data-job-state', 'succeeded');
  const jobs = await storedJobs(extensionWorker);
  expect(jobs.map((job) => job.id)).toEqual([paused.id]);
  // The two links stopped by the pause are asked for again; the checked ones are not.
  expect(requestCounts(site)).toEqual({
    'HEAD /link/1': 1,
    'HEAD /link/2': 1,
    'HEAD /link/3': 2,
    'HEAD /link/4': 2,
    'HEAD /link/5': 1,
    'HEAD /link/6': 1,
  });
});

async function launch(userDataDir: string, extensionPath: string, channel: string) {
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel,
    headless: true,
    reducedMotion: 'reduce',
    viewport: { width: 1400, height: 900 },
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent('serviceworker');
  return { context, worker, extensionId: new URL(worker.url()).host };
}

/** Stops the extension's background worker, as the browser does when it is idle. */
async function stopWorker(page: Page, extensionId: string) {
  const session = await page.context().newCDPSession(page);
  const { targetInfos } = await session.send('Target.getTargets');
  const worker = targetInfos.find(
    (target) => target.type === 'service_worker' && target.url.includes(extensionId),
  );
  if (!worker) throw new Error('No extension service worker to stop');
  await session.send('Target.closeTarget', { targetId: worker.targetId });
  await session.detach();
}

test('a stopped worker picks up from saved results, and a paused job stays paused after a restart (J11, J17, J19)', async ({
  extensionBrowser,
  grantedBuild,
}, testInfo) => {
  const userDataDir = testInfo.outputPath('jobs-profile');
  const extensionPath = grantedBuild({ hosts: true, permissions: [] });
  let context: BrowserContext | undefined;
  try {
    let worker: Worker;
    let extensionId: string;
    ({ context, worker, extensionId } = await launch(userDataDir, extensionPath, extensionBrowser));
    const { folderId } = await seedFolder(worker, 'Restart Folder', links(site));
    await setDeadLinkSettings(worker, 1);
    const page = await context.newPage();
    await startFromManager(page, extensionId, folderId);
    await expect.poll(() => site.held()).toBe(1);
    site.release(1);
    await expect.poll(() => site.requests.length).toBe(2);
    site.release(1);
    // Links 1 and 2 are saved; link 3 is in flight when the worker stops.
    await expect.poll(() => site.requests.length).toBe(3);
    await expect.poll(async () => (await storedJobs(page))[0]?.done.succeeded).toBe(2);
    await stopWorker(page, extensionId);
    await expect.poll(() => site.held()).toBe(0);

    // J17: any command wakes the background, which runs the job on from its saved results.
    const [job] = await storedJobs(page);
    site.open();
    expect(await sendCommand(page, { type: 'resume', jobId: job.id })).toMatchObject({ ok: true });
    // The page that started it is still open, so its review opens when it finishes.
    const review = page.getByRole('dialog', { name: 'Check Dead Links' });
    await expect(review.locator('[data-slot="tool-result-row"]')).toHaveCount(LINK_COUNT);
    await review.getByRole('button', { name: 'Close' }).first().click();
    await expect(deadLinksStatus(page)).toHaveAttribute('data-job-state', 'succeeded');
    expect(requestCounts(site)).toEqual({
      'HEAD /link/1': 1,
      'HEAD /link/2': 1,
      'HEAD /link/3': 2,
      'HEAD /link/4': 1,
      'HEAD /link/5': 1,
      'HEAD /link/6': 1,
    });

    // J11, J19: a paused job stays paused when the browser restarts with the same profile.
    site.requests.length = 0;
    site.hold();
    await page.reload();
    await page.getByTitle('Show tools').click();
    await toolCard(page, 'Check Dead Links').getByRole('button', { name: 'Scan' }).click();
    await expect.poll(() => site.held()).toBe(1);
    site.release(1);
    await expect.poll(() => site.held()).toBe(1);
    const status = deadLinksStatus(page);
    await status.getByRole('button', { name: 'Pause' }).click();
    await expect(status).toHaveAttribute('data-job-state', 'paused');
    const paused = (await storedJobs(page)).find((stored) => stored.state === 'paused');
    expect(paused).toBeDefined();
    const pausedDone = paused?.done.succeeded ?? 0;
    await context.close();

    site.requests.length = 0;
    ({ context, worker, extensionId } = await launch(userDataDir, extensionPath, extensionBrowser));
    const after = await context.newPage();
    await openTools(after, extensionId, folderId);
    await expect(deadLinksStatus(after)).toHaveAttribute('data-job-state', 'paused');
    await after.waitForTimeout(1000);
    expect(site.requests).toEqual([]);
    const reopened = (await storedJobs(after)).find((stored) => stored.id === paused?.id);
    expect(reopened).toMatchObject({ state: 'paused', done: { succeeded: pausedDone } });

    // Resumed by hand, it finishes the links it had left.
    site.open();
    await deadLinksStatus(after).getByRole('button', { name: 'Resume' }).click();
    await expect(deadLinksStatus(after)).toHaveAttribute('data-job-state', 'succeeded');
    expect(site.requests).toHaveLength(LINK_COUNT - pausedDone);
  } finally {
    await context?.close();
    removeTempDir(userDataDir);
  }
});
