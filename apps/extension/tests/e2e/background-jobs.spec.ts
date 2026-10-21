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
  type Route,
  type Worker,
} from '@playwright/test';
import {
  MOCK_PROVIDER_BASE_URL,
  MOCK_PROVIDER_CORS_HEADERS,
  mockChatCompletionBody,
  seedMockCustomProvider,
} from './ai-provider-mock';
import { expect, test, toastRegion } from './fixtures';
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

// A real 1x1 PNG, so it passes the image check.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * A real HTTP server whose links answer only when the test releases them: `/link/N` is a page
 * titled "Title N", `/icon-page` declares `/icon.png`, and `/icon.png` is a PNG.
 */
async function startHeldSite(): Promise<HeldSite> {
  const requests: string[] = [];
  const waiting: { res: ServerResponse; path: string }[] = [];
  let gateOpen = false;
  const answer = ({ res, path }: { res: ServerResponse; path: string }) => {
    if (res.writableEnded || res.destroyed) return;
    if (path === '/icon.png') {
      res.writeHead(200, { 'content-type': 'image/png' });
      res.end(PNG);
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    const link = /^\/link\/(\d+)$/.exec(path);
    res.end(
      path === '/icon-page'
        ? '<head><link rel="icon" href="/icon.png"></head>'
        : `<head><title>${link ? `Title ${Number(link[1])}` : 'Held'}</title></head>`,
    );
  };
  const server: Server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    requests.push(`${req.method} ${path}`);
    if (gateOpen) answer({ res, path });
    else waiting.push({ res, path });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  // A request the extension stopped (pause, or a stopped worker) closes its connection.
  const live = () => waiting.filter(({ res }) => !res.destroyed && !res.writableEnded);
  return {
    origin: `http://127.0.0.1:${port}`,
    requests,
    release: (count) => {
      for (const held of live().slice(0, count)) answer(held);
    },
    open: () => {
      gateOpen = true;
      for (const held of live()) answer(held);
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
  kind: string;
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
  // The page that started the job is still waiting for it, so its results open when it finishes.
  const review = page.getByRole('dialog', { name: 'Check Dead Links' });
  await expect(review.locator('[data-slot="tool-result-row"]')).toHaveCount(LINK_COUNT);
  await review.getByRole('button', { name: 'Close' }).first().click();
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

/** The newest job of `kind` as stored. */
async function latestJob(target: Page | Worker, kind: string) {
  return (await storedJobs(target)).find((job) => job.kind === kind);
}

test('Metadata Fetcher keeps going with its page closed, and a later page applies its titles (J01, J05)', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  const { folderId } = await seedFolder(
    extensionWorker,
    'Metadata Folder',
    links(site)
      .slice(0, 3)
      .map((link, index) => ({ ...link, title: `Old ${index + 1}` })),
  );
  await setSettings(extensionWorker, {
    metadataFetcherConcurrency: 1,
    metadataFetcherRequestTimeoutMs: 60_000,
    metadataFetcherOverwriteTitles: true,
    metadataFetcherDefaultScope: 'folder',
  });
  await openTools(page, extensionId, folderId);
  await toolCard(page, 'Metadata Fetcher').getByRole('button', { name: 'Scan' }).click();
  await expect.poll(() => site.held()).toBe(1);
  await page.close();

  site.open();
  await expect
    .poll(async () => (await latestJob(extensionWorker, 'metadataFetcher'))?.state)
    .toBe('succeeded');
  expect(requestCounts(site)).toEqual({ 'GET /link/1': 1, 'GET /link/2': 1, 'GET /link/3': 1 });

  const manager = await context.newPage();
  await openTools(manager, extensionId, folderId);
  const status = toolCard(manager, 'Metadata Fetcher').getByTestId('job-status');
  await expect(status).toHaveAttribute('data-job-state', 'succeeded');
  await status.getByRole('button', { name: 'Review results' }).click();
  const review = manager.getByRole('dialog', { name: 'Metadata Fetcher' });
  await review.getByRole('button', { name: 'Apply 3 titles' }).click();
  await expect
    .poll(() =>
      extensionWorker.evaluate(
        async (id) => (await chrome.bookmarks.getChildren(id)).map((item) => item.title),
        folderId,
      ),
    )
    .toEqual(['Title 1', 'Title 2', 'Title 3']);
  // Applying read nothing from the network again.
  expect(site.requests).toHaveLength(3);
});

test('Refresh Site Icons keeps going with its page closed, and a later page saves the icon (J01, J05)', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  const { folderId } = await seedFolder(extensionWorker, 'Icons Folder', [
    { title: 'Icon Page', url: `${site.origin}/icon-page` },
    { title: 'Same Site', url: `${site.origin}/link/1` },
    { title: 'Bookmarklet', url: 'javascript:void(0)' },
  ]);
  await setSettings(extensionWorker, {
    siteIconsRequestTimeoutMs: 60_000,
    siteIconsDefaultScope: 'folder',
  });
  await openTools(page, extensionId, folderId);
  const card = toolCard(page, 'Refresh Site Icons');
  await expect(card).toContainText('0 icons saved (0 KB)');
  await card.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect.poll(() => site.held()).toBe(1);
  await page.close();

  site.open();
  await expect
    .poll(async () => (await latestJob(extensionWorker, 'siteIcons'))?.state)
    .toBe('succeeded');
  // One site, read once: its page, then its icon.
  expect(requestCounts(site)).toEqual({ 'GET /icon-page': 1, 'GET /icon.png': 1 });

  const manager = await context.newPage();
  await openTools(manager, extensionId, folderId);
  const later = toolCard(manager, 'Refresh Site Icons');
  await later.getByTestId('job-status').getByRole('button', { name: 'Review results' }).click();
  const review = manager.getByRole('dialog', { name: 'Refresh Site Icons' });
  await expect(
    review.getByText('1 bookmark is not a web link and was skipped.', { exact: true }),
  ).toBeVisible();
  await review.getByRole('button', { name: 'Save 1 icon' }).click();
  await expect(later).toContainText('1 icon saved');
});

/** Moves every bookmark of a reorganization request into "<folder>/Sorted". */
function sortedAnswer(route: Route, folder: string) {
  const { messages } = route.request().postDataJSON() as { messages: { content: string }[] };
  const request = JSON.parse(messages.at(-1)?.content ?? '{}') as {
    bookmarks: { id: string; title: string }[];
  };
  return mockChatCompletionBody({
    operations: request.bookmarks.map((bookmark) => ({
      bookmarkId: bookmark.id,
      bookmarkTitle: bookmark.title,
      toFolderPath: `${folder}/Sorted`,
      confidence: 0.9,
      reason: 'Sorted',
    })),
    summary: 'Sorted',
  });
}

async function seedReorganization(worker: Worker, folder: string) {
  const seeded = await seedFolder(worker, folder, [
    { title: 'First', url: 'https://e2e.invalid/first' },
    { title: 'Second', url: 'https://e2e.invalid/second' },
    { title: 'Third', url: 'https://e2e.invalid/third' },
  ]);
  await seedMockCustomProvider(worker);
  await setSettings(worker, {
    reorganizationEnabled: true,
    reorganizationMinConfidence: 0.5,
    // Two bookmarks a request: three make two requests.
    reorganizationBatchSize: 2,
    reorganizationDefaultScope: 'folder',
  });
  return seeded;
}

const childTitles = (worker: Worker, id: string) =>
  worker.evaluate(
    async (parentId) => (await chrome.bookmarks.getChildren(parentId)).map((item) => item.title),
    id,
  );

test('AI Folder Reorganization finishes with its page closed and moves nothing until a later page applies the plan (J01, J41)', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  const { folderId } = await seedReorganization(extensionWorker, 'Reorg Folder');
  const held: Route[] = [];
  let answering = false;
  await context.route(`${MOCK_PROVIDER_BASE_URL}/**`, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: MOCK_PROVIDER_CORS_HEADERS });
      return;
    }
    if (!answering) {
      held.push(route);
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: MOCK_PROVIDER_CORS_HEADERS,
      body: sortedAnswer(route, 'Reorg Folder'),
    });
  });

  await openTools(page, extensionId, folderId);
  await toolCard(page, 'AI Folder Reorganization').getByRole('button', { name: 'Analyze' }).click();
  await expect.poll(() => held.length).toBe(1);
  await page.close();
  answering = true;
  for (const route of held) {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: MOCK_PROVIDER_CORS_HEADERS,
      body: sortedAnswer(route, 'Reorg Folder'),
    });
  }
  await expect
    .poll(async () => (await latestJob(extensionWorker, 'reorganization'))?.state)
    .toBe('succeeded');
  // The plan waits for review: nothing moved.
  expect(await childTitles(extensionWorker, folderId)).toEqual(['First', 'Second', 'Third']);

  const manager = await context.newPage();
  await openTools(manager, extensionId, folderId);
  await toolCard(manager, 'AI Folder Reorganization')
    .getByTestId('job-status')
    .getByRole('button', { name: 'Review results' })
    .click();
  const review = manager.getByRole('dialog', { name: 'AI Folder Reorganization' });
  await expect(review.getByText('New folders: 1', { exact: true })).toBeVisible();
  await review.getByRole('button', { name: 'Apply Changes' }).click();
  await expect.poll(() => childTitles(extensionWorker, folderId)).toEqual(['Sorted']);
});

test('AI Folder Reorganization pauses with the reason when the service fails, and goes on when resumed (J35, J37)', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  const { folderId } = await seedReorganization(extensionWorker, 'Failing Folder');
  let requests = 0;
  await context.route(`${MOCK_PROVIDER_BASE_URL}/**`, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: MOCK_PROVIDER_CORS_HEADERS });
      return;
    }
    requests += 1;
    // The second request (the second batch) is refused once.
    if (requests === 2) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        headers: MOCK_PROVIDER_CORS_HEADERS,
        body: JSON.stringify({ error: { message: 'Invalid key' } }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: MOCK_PROVIDER_CORS_HEADERS,
      body: sortedAnswer(route, 'Failing Folder'),
    });
  });

  await openTools(page, extensionId, folderId);
  const card = toolCard(page, 'AI Folder Reorganization');
  await card.getByRole('button', { name: 'Analyze' }).click();
  const status = card.getByTestId('job-status');
  await expect(status).toHaveAttribute('data-job-state', 'paused');
  await expect(status.getByTestId('job-error')).toContainText('the AI service did not answer');
  await expect(status.getByTestId('job-progress')).toContainText('1 of 2');
  expect(requests).toBe(2);

  await status.getByRole('button', { name: 'Resume' }).click();
  // Only the batch that failed is asked again; the page that started the job opens the plan.
  const review = page.getByRole('dialog', { name: 'AI Folder Reorganization' });
  await expect(review.getByText('New folders: 1', { exact: true })).toBeVisible();
  expect(requests).toBe(3);
});

test('reviewed changes above the Apply in the Background Above setting are applied as a background task, one History record a part (J46)', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  const { folderId } = await seedReorganization(extensionWorker, 'Apply Folder');
  await setSettings(extensionWorker, { jobsApplyInBackgroundAbove: 1 });
  await context.route(`${MOCK_PROVIDER_BASE_URL}/**`, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: MOCK_PROVIDER_CORS_HEADERS });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: MOCK_PROVIDER_CORS_HEADERS,
      body: sortedAnswer(route, 'Apply Folder'),
    });
  });

  await openTools(page, extensionId, folderId);
  await toolCard(page, 'AI Folder Reorganization').getByRole('button', { name: 'Analyze' }).click();
  const review = page.getByRole('dialog', { name: 'AI Folder Reorganization' });
  await review.getByRole('button', { name: 'Apply Changes' }).click();
  await expect(
    toastRegion(page).getByText('✓ Applying in the background', { exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => (await latestJob(extensionWorker, 'applyChanges'))?.state)
    .toBe('succeeded');
  await expect.poll(() => childTitles(extensionWorker, folderId)).toEqual(['Sorted']);

  // The part is one change in the History, by the tool, marked as a part.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Bookmark history' }).click();
  const history = page.getByTestId('history-dialog');
  await expect(history.getByTestId('history-record-label').first()).toContainText('(part 1 of 1)');
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

test('applying in the background leaves the browser folders alone and moves within a folder (J63)', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'Apply Folder', [
    { title: 'Target', children: [] },
    { title: 'First', url: `${site.origin}/first` },
    { title: 'Second', url: `${site.origin}/second` },
  ]);
  const [bar] = await extensionWorker.evaluate(() => chrome.bookmarks.getChildren('0'));
  if (!bar) throw new Error('no browser folders');
  await page.goto(managerUrl(extensionId, seeded.folderId));
  const response = (await sendCommand(page, {
    type: 'apply',
    commandId: crypto.randomUUID(),
    source: 'manager',
    tool: 'tools_aiReorganize',
    changes: [
      // A browser folder cannot move; the browser refuses it, and the rest goes on.
      { kind: 'move', id: bar.id, title: bar.title, to: { parentId: seeded.ids.Target } },
      { kind: 'move', id: seeded.ids.First, title: 'First', to: { parentId: seeded.ids.Target } },
      // Within the folder it is already in.
      { kind: 'move', id: seeded.ids.Second, title: 'Second', to: { parentId: seeded.folderId } },
    ],
  })) as { ok: boolean; job: { id: string } };
  expect(response.ok).toBe(true);
  await expect
    .poll(
      async () =>
        (await storedJobs(extensionWorker)).find((job) => job.id === response.job.id)?.state,
    )
    .toBe('partial');
  const [job] = (await storedJobs(extensionWorker)).filter(
    (stored) => stored.id === response.job.id,
  );
  expect(job?.done).toEqual({ succeeded: 2, skipped: 0, failed: 1 });
  const [stillThere] = await extensionWorker.evaluate((id) => chrome.bookmarks.get(id), bar.id);
  expect(stillThere?.parentId).toBe('0');
  expect(await childTitles(extensionWorker, seeded.ids.Target)).toEqual(['First']);
  expect(await childTitles(extensionWorker, seeded.folderId)).toEqual(['Target', 'Second']);
test('Background tasks works by keyboard, narrow, dark, and in German, and announces states only (J70)', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const { folderId } = await seedFolder(extensionWorker, 'Jobs Folder', links(site));
  await setDeadLinkSettings(extensionWorker, 2);
  await startFromManager(page, extensionId, folderId);
  await expect.poll(() => site.held()).toBe(2);
  await setSettings(extensionWorker, { language: 'de', theme: 'dark' });
  await page.setViewportSize({ width: 420, height: 800 });
  await page.goto(managerUrl(extensionId, folderId));
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);

  await page.getByTestId('tasks-button').focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Hintergrundaufgaben' });
  await expect(dialog).toBeVisible();
  // One announcement per job, for its state; progress changes are not read out one by one.
  await expect(dialog.locator('[aria-live]')).toHaveCount(1);
  await expect(dialog.getByTestId('job-progress')).not.toHaveAttribute('aria-live');

  // Pause is reachable with Tab, and focus stays in the dialog after it.
  const pause = dialog.getByRole('button', { name: 'Anhalten' });
  for (
    let presses = 0;
    presses < 10 && !(await pause.evaluate((b) => b === document.activeElement));
    presses += 1
  ) {
    await page.keyboard.press('Tab');
  }
  await expect(pause).toBeFocused();
  await page.keyboard.press('Enter');
  site.release(2);
  await expect(dialog.getByTestId('job-status')).toHaveAttribute('data-job-state', 'paused');
  await expect(dialog.locator('[aria-live]')).toHaveText('Angehalten');
  expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);

  // Nothing is cut off at 420px in the longer language.
  const clipped = await dialog.evaluate((node) =>
    [node, ...node.querySelectorAll('button, p, span')]
      // Text only screen readers get is 1px wide on purpose.
      .filter((element) => element.clientWidth > 1 && element.scrollWidth > element.clientWidth + 1)
      .map((element) => element.textContent),
  );
  expect(clipped).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('tasks-de-dark-420.png') });
});
