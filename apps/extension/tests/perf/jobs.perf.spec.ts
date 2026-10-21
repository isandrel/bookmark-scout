/**
 * Background jobs on the full library (J68): Check Dead Links over every bookmark against a local
 * server that answers at once, so what is measured is the extension's own cost per link (the job
 * store, the coordinator, the progress shown). Settings and sizes are `[jobs]` in perf.toml.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Page, Worker } from '@playwright/test';
import { test } from '../e2e/fixtures';
import { setSettings } from '../e2e/storage';
import {
  closeMeasured,
  measureInteraction,
  openMeasured,
  PerfReport,
  perfConfig,
  seedLibrary,
} from './harness';

test.use({ grantWebHostAccess: true });

/** A local site where every page exists and answers at once. */
async function startInstantSite() {
  let requests = 0;
  const server: Server = createServer((_request, response) => {
    requests += 1;
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    requests: () => requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}

type StoredJob = {
  id: string;
  createdAt: number;
  state: string;
  total: number;
  done: Record<string, number>;
};

/** The newest stored job, read the way the pages read it. */
async function newestJob(worker: Worker): Promise<StoredJob | undefined> {
  return worker.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('bookmark-scout-jobs');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const jobs = await new Promise<StoredJob[]>((resolve, reject) => {
      const request = db.transaction('jobs').objectStore('jobs').getAll();
      request.onsuccess = () => resolve(request.result as StoredJob[]);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return jobs.sort((a, b) => b.createdAt - a.createdAt)[0];
  });
}

const processed = (job: StoredJob | undefined) =>
  job ? job.done.succeeded + job.done.skipped + job.done.failed : 0;

function deadLinksCard(page: Page) {
  return page
    .getByTestId('tools-sidebar')
    .getByRole('heading', { name: 'Check Dead Links', exact: true })
    .locator('..')
    .locator('..')
    .locator('..')
    .locator('..');
}

test('background jobs: start, progress, pause, and results on 19,500 bookmarks', async ({
  context,
  extensionId,
  extensionWorker,
}, testInfo) => {
  const site = await startInstantSite();
  try {
    await seedLibrary(extensionWorker, site.origin);
    const { areas, topics_per_area, pages_per_topic } = perfConfig.library;
    const links = areas * topics_per_area * pages_per_topic;
    await setSettings(extensionWorker, {
      deadLinksRetryCount: 0,
      deadLinksFollowRedirects: false,
      deadLinksConcurrency: perfConfig.jobs.concurrency,
      deadLinksDefaultScope: 'all',
    });
    const report = new PerfReport();

    for (let run = 0; run < perfConfig.jobs.repeats; run++) {
      const { page } = await openMeasured(
        context,
        `chrome-extension://${extensionId}/bookmarks.html`,
        ['tbody tr'],
      );
      await page.getByTitle('Show tools').click();
      const card = deadLinksCard(page);

      // From the click to the job's status on the card: accepting stores every link first.
      const accepted = await measureInteraction(
        page,
        () => card.getByRole('button', { name: 'Scan' }).click(),
        { selector: '[data-testid="job-status"]' },
      );
      if (!report.addInteraction('jobs.accept', accepted)) break;
      const startedAt = Date.now();

      // From Pause to the card saying Paused, while links are being checked.
      while (processed(await newestJob(extensionWorker)) < perfConfig.jobs.pause_after_items) {
        await page.waitForTimeout(100);
      }
      const paused = await measureInteraction(
        page,
        () => card.getByRole('button', { name: 'Pause' }).click(),
        { selector: '[data-job-state="paused"]' },
      );
      report.addInteraction('jobs.pause', paused);
      const pausedAt = processed(await newestJob(extensionWorker));
      const activeBeforePause = Date.now() - startedAt;

      // Opening the manager while the job runs, so its cost on the pages shows.
      await card.getByRole('button', { name: 'Resume' }).click();
      const resumedAt = Date.now();
      const busy = await openMeasured(context, `chrome-extension://${extensionId}/bookmarks.html`, [
        'tbody tr',
      ]);
      report.add('jobs.managerOpenWhileRunning', busy.firstSeen['tbody tr']);
      await closeMeasured(busy.page);

      let job = await newestJob(extensionWorker);
      while (job && job.state !== 'succeeded' && job.state !== 'partial') {
        await page.waitForTimeout(250);
        job = await newestJob(extensionWorker);
      }
      const running = activeBeforePause + (Date.now() - resumedAt);
      report.add('jobs.linksPerSecond', (1000 * links) / running, 'links/s');
      report.add('jobs.total', running);
      report.add('jobs.checkedBeforePause', pausedAt, 'links');
      report.add('jobs.requests', site.requests(), 'requests');

      // From Review results to the first result row.
      const reviewed = await measureInteraction(
        page,
        () => card.getByRole('button', { name: 'Review results' }).click(),
        { selector: '[data-slot="tool-result-row"]' },
      );
      report.addInteraction('jobs.reviewOpen', reviewed);

      const usage = await page.evaluate(
        async () => (await navigator.storage.estimate()).usage ?? 0,
      );
      report.add('jobs.storageKiB', usage / 1024, 'KiB');
      await closeMeasured(page);
    }

    await report.write(testInfo);
  } finally {
    await site.close();
  }
});
