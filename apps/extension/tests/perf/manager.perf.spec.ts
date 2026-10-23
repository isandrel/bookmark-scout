import type { Worker } from '@playwright/test';
import { z } from 'zod';
import { expect, test } from '../e2e/fixtures';
import { STORAGE_ITEMS, writeStored } from '../e2e/storage';
import {
  closeMeasured,
  libraryNames,
  measureInteraction,
  measureScroll,
  measureSettled,
  openMeasured,
  PerfReport,
  perfConfig,
  readExtensionConfig,
  seedLibrary,
} from './harness';

test('bookmarks manager: open, open a folder, filter, update after an outside change', async ({
  context,
  extensionId,
  extensionWorker,
}, testInfo) => {
  await seedLibrary(extensionWorker);
  const report = new PerfReport();
  const area = Math.floor(perfConfig.library.areas / 2);

  for (let run = 0; run < perfConfig.run.repeats; run++) {
    const { page, firstSeen } = await openMeasured(
      context,
      `chrome-extension://${extensionId}/bookmarks.html`,
      ['[data-testid="folder-tree"]', 'tbody tr'],
    );
    report.add('manager.open', firstSeen['tbody tr']);

    const opened = await measureInteraction(
      page,
      () =>
        page
          .getByTestId('folder-tree')
          .getByRole('treeitem', { name: libraryNames.area(area), exact: true })
          .click(),
      // Any topic of the area: the table's first page depends on the sort order.
      { selector: 'tbody tr', text: `Topic ${area}-` },
    );
    if (!report.addInteraction('manager.openFolder', opened)) {
      await closeMeasured(page);
      continue;
    }

    const filter = page.getByPlaceholder('Search titles, addresses, folders, and tags');
    const filtered = await measureSettled(
      page,
      () => filter.pressSequentially(`${area}-7`, { delay: 60 }),
      'main',
    );
    if (!report.addInteraction('manager.filter.results', filtered, 'manager.filter.keystroke')) {
      await closeMeasured(page);
      continue;
    }
    await filter.fill('');

    // A bookmark added elsewhere (another window, sync) shows up without a reload.
    const title = `${libraryNames.topic(area, 0)} outside change ${run}`;
    const updated = await measureInteraction(
      page,
      async () => {
        await page.evaluate(() =>
          (window as unknown as { __bsPerf: { inputs: number[] } }).__bsPerf.inputs.push(
            performance.now(),
          ),
        );
        await extensionWorker.evaluate(
          async ({ areaTitle, bookmarkTitle }) => {
            const [folder] = (await chrome.bookmarks.search({ title: areaTitle })).filter(
              (node) => !node.url,
            );
            await chrome.bookmarks.create({
              parentId: folder.id,
              index: 0,
              title: bookmarkTitle,
              url: 'https://example.com/outside',
            });
          },
          { areaTitle: libraryNames.area(area), bookmarkTitle: title },
        );
      },
      { selector: 'tbody tr', text: title },
    );
    report.addInteraction('manager.outsideChange', updated);
    await closeMeasured(page);
  }

  await report.write(testInfo);
});

/** The most rows a manager page shows (`page_sizes` in config/ui/manager-table.toml). */
const MAX_PAGE_SIZE = Math.max(
  ...readExtensionConfig(
    'ui/manager-table',
    z.looseObject({ page_sizes: z.array(z.number().int().positive()).min(1) }),
  ).page_sizes,
);

/** A search every bookmark of the library matches: the site its addresses are on. */
const CARDS_QUERY = `domain:${new URL(perfConfig.library.url_base).hostname}`;

test('bookmarks manager: switch a full page of search results to cards, scroll, and back (V26)', async ({
  context,
  extensionId,
  extensionWorker,
}, testInfo) => {
  await seedLibrary(extensionWorker);
  // The largest page the manager offers, the most cards it ever draws at once.
  await writeStored(extensionWorker, STORAGE_ITEMS.tableLayout, { pageSize: MAX_PAGE_SIZE });
  const report = new PerfReport();
  // Every bookmark of the library is a result, so the page is full.
  const url = `chrome-extension://${extensionId}/bookmarks.html?q=${encodeURIComponent(CARDS_QUERY)}`;

  for (let run = 0; run < perfConfig.run.repeats; run++) {
    const { page } = await openMeasured(context, url, ['tbody tr']);
    // The search has run once a full page of results is on screen.
    await page.waitForFunction(
      (rows) => document.querySelectorAll('tbody tr').length >= rows,
      MAX_PAGE_SIZE,
      { timeout: 60_000 },
    );
    const toggle = page.getByRole('group', { name: 'Manager View' });

    const toCards = await measureInteraction(
      page,
      () => toggle.getByRole('button', { name: 'Cards' }).click(),
      { selector: '[data-slot="bookmark-card"]', minCount: MAX_PAGE_SIZE },
    );
    if (!report.addInteraction('manager.cards.toCards', toCards)) {
      await closeMeasured(page);
      break;
    }
    const cards = await page.locator('[data-slot="bookmark-card"]').count();
    report.add('manager.cards.rendered', cards, 'cards');
    expect(cards, 'the cards view draws one page, not the library').toBe(MAX_PAGE_SIZE);

    const scrolled = await measureScroll(page);
    expect(scrolled.distance, 'the cards scroll').toBeGreaterThan(0);
    report.add('manager.cards.scroll.longFrames', scrolled.longFrames, 'frames');
    report.add('manager.cards.scroll.worstFrame', scrolled.worstFrame);
    report.add('manager.cards.scroll.p95Frame', scrolled.p95Frame);

    const toList = await measureInteraction(
      page,
      () => toggle.getByRole('button', { name: 'List' }).click(),
      { selector: 'tbody tr', minCount: MAX_PAGE_SIZE },
    );
    report.addInteraction('manager.cards.toList', toList);
    await closeMeasured(page);
  }

  await report.write(testInfo);
});

/**
 * Stores a cover, as Fetch Covers would, for each of these bookmarks: one 960 by 503 WebP drawn in
 * the service worker, the size Fetch Covers keeps by default.
 */
async function seedCovers(worker: Worker, ids: readonly string[]): Promise<void> {
  await worker.evaluate(async (bookmarkIds) => {
    const canvas = new OffscreenCanvas(960, 503);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No 2D context in the service worker');
    const gradient = context.createLinearGradient(0, 0, 960, 503);
    gradient.addColorStop(0, '#2b7a78');
    gradient.addColorStop(1, '#3a506b');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 960, 503);
    const data = await (await canvas.convertToBlob({ type: 'image/webp' })).arrayBuffer();
    const nodes = await chrome.bookmarks.get([...bookmarkIds]);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('bookmark-scout-covers', 1);
      open.onupgradeneeded = () => {
        open.result.createObjectStore('info', { keyPath: 'bookmarkId' });
        open.result.createObjectStore('images', { keyPath: 'bookmarkId' });
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(['info', 'images'], 'readwrite');
      for (const node of nodes) {
        transaction.objectStore('info').put({
          bookmarkId: node.id,
          url: node.url,
          width: 960,
          height: 503,
          bytes: data.byteLength,
          savedAt: Date.now(),
          version: 1,
          source: 'page',
        });
        transaction
          .objectStore('images')
          .put({ bookmarkId: node.id, type: 'image/webp', data: data.slice(0) });
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  }, ids);
}

test('bookmarks manager: scroll a full page of the list with the Cover column shown', async ({
  context,
  extensionId,
  extensionWorker,
}, testInfo) => {
  await seedLibrary(extensionWorker);
  await writeStored(extensionWorker, STORAGE_ITEMS.tableLayout, { pageSize: MAX_PAGE_SIZE });
  await writeStored(extensionWorker, STORAGE_ITEMS.tableView, {
    columnVisibility: { cover: true },
  });
  const url = `chrome-extension://${extensionId}/bookmarks.html?q=${encodeURIComponent(CARDS_QUERY)}`;
  const fullPage = (rows: number) => document.querySelectorAll('tbody tr').length >= rows;

  // Every row of the page gets a stored cover, so each draws a thumbnail.
  const setup = await context.newPage();
  await setup.goto(url);
  await setup.waitForFunction(fullPage, MAX_PAGE_SIZE, { timeout: 60_000 });
  const ids = await setup.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('tbody tr[data-row-id]')].map(
      (row) => row.dataset.rowId ?? '',
    ),
  );
  await setup.close();
  await seedCovers(extensionWorker, ids);
  const report = new PerfReport();

  for (let run = 0; run < perfConfig.run.repeats; run++) {
    const { page } = await openMeasured(context, url, ['tbody tr']);
    await page.waitForFunction(fullPage, MAX_PAGE_SIZE, { timeout: 60_000 });
    // The covers are read once their rows are drawn; the first screen of them shows first.
    await expect(page.getByTestId('bookmark-cover-thumbnail').first()).toBeVisible({
      timeout: 60_000,
    });
    const thumbnails = await page.getByTestId('bookmark-cover-thumbnail').count();
    report.add('manager.list.covers.rendered', thumbnails, 'thumbnails');
    expect(thumbnails, 'one thumbnail a row, for the page only').toBeLessThanOrEqual(MAX_PAGE_SIZE);

    const scrolled = await measureScroll(page);
    expect(scrolled.distance, 'the list scrolls').toBeGreaterThan(0);
    report.add('manager.list.covers.scroll.longFrames', scrolled.longFrames, 'frames');
    report.add('manager.list.covers.scroll.worstFrame', scrolled.worstFrame);
    report.add('manager.list.covers.scroll.p95Frame', scrolled.p95Frame);
    await closeMeasured(page);
  }

  await report.write(testInfo);
});
