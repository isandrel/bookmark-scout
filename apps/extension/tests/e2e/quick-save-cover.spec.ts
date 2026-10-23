/**
 * Save a Cover With Quick Save (off by default, like Fetch Covers): with both on, a quick save keeps a cover for the new
 * bookmark (the page's own image first by default, else a picture of the tab), the notification
 * offers Remove cover, and Undo removes the cover with the bookmark. Off, with Fetch Covers off, or
 * with a cover source the page cannot meet, it keeps none.
 *
 * The shortcut grants activeTab, which a dispatched command does not; access to all pages stands
 * in for it, so the notification can be drawn and the tab pictured.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import { solidPng } from '../solid-png';
import { expect, test } from './fixtures';
import { readCoverInfos } from './manager-helpers';
import {
  bookmarksWithUrl,
  clickToastButton,
  finishedRecord,
  pressShortcut,
  toastButtons,
} from './quick-save-helpers';
import { setSettings } from './storage';

type CoverSite = { origin: string; imageRequests: number; close: () => Promise<void> };

/** `/image/<slug>` names `/cover.png` as its preview image; `/plain/<slug>` names none. */
async function startCoverSite(): Promise<CoverSite> {
  const site = { imageRequests: 0 };
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/cover.png') {
      site.imageRequests += 1;
      res.writeHead(200, { 'content-type': 'image/png' }).end(solidPng(1200, 630));
      return;
    }
    const title = (url.pathname.split('/').pop() ?? 'page').replace(/-/g, ' ');
    const meta = url.pathname.startsWith('/image/')
      ? '<meta property="og:image" content="/cover.png">'
      : '';
    res
      .writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      .end(
        `<!doctype html><html><head><title>${title}</title>${meta}</head>` +
          `<body style="margin:0;background:#2a6f97"><h1>${title}</h1></body></html>`,
      );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return Object.assign(site, {
    origin: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  });
}

/**
 * The color of the stored cover of `bookmarkId` at a point given as fractions of its width and
 * height, `[r, g, b]`.
 */
async function coverPixel(worker: Worker, bookmarkId: string, x: number, y: number) {
  return worker.evaluate(
    async ({ id, fx, fy }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open('bookmark-scout-covers');
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      const stored = await new Promise<{ type: string; data: ArrayBuffer }>((resolve, reject) => {
        const request = db.transaction('images').objectStore('images').get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      db.close();
      const image = await createImageBitmap(new Blob([stored.data], { type: stored.type }));
      const canvas = new OffscreenCanvas(image.width, image.height);
      const context = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
      context.drawImage(image, 0, 0);
      const pixel = context.getImageData(
        Math.floor(image.width * fx),
        Math.floor(image.height * fy),
        1,
        1,
      ).data;
      return [pixel[0], pixel[1], pixel[2]];
    },
    { id: bookmarkId, fx: x, fy: y },
  );
}

let site: CoverSite;
test.beforeEach(async () => {
  site = await startCoverSite();
});
test.afterEach(async () => {
  await site.close();
});

test.use({ grantPermissions: ['<all_urls>'] });

async function openPage(context: BrowserContext, path: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`${site.origin}${path}`);
  await expect(page).toHaveTitle(path.split('/').pop()?.replace(/-/g, ' ') ?? '');
  return page;
}

test("quick save keeps the page's own image as the new bookmark's cover, and Remove cover in the notification deletes it", async ({
  context,
  extensionWorker,
}) => {
  await setSettings(extensionWorker, {
    language: 'en',
    theme: 'light',
    coversEnabled: true,
    quickSaveCover: true,
    coversWidthPx: 320,
    // The test site is on this computer, which Skip Local Network Pages would leave out.
    readPageSkipPrivateHosts: false,
  });
  const page = await openPage(context, '/image/Story-with-an-image');

  await pressShortcut(extensionWorker, page, 'quick-save');
  const record = await finishedRecord(extensionWorker);
  expect(record.status).toBe('saved');
  await expect
    .poll(() => readCoverInfos(extensionWorker))
    .toEqual([
      expect.objectContaining({
        bookmarkId: record.bookmarkId,
        url: page.url(),
        width: 320,
        source: 'page',
      }),
    ]);
  expect(site.imageRequests).toBe(1);

  // The notification offers to remove it, beside Undo; removing it keeps the bookmark.
  await expect
    .poll(() => toastButtons(page))
    .toEqual(expect.arrayContaining(['Undo', 'Remove cover']));
  await clickToastButton(page, 'Remove cover');
  await expect.poll(() => readCoverInfos(extensionWorker)).toEqual([]);
  await expect.poll(() => toastButtons(page)).not.toContain('Remove cover');
  expect(await toastButtons(page)).toContain('Undo');
  expect(await bookmarksWithUrl(extensionWorker, page.url())).toHaveLength(1);
});

test('quick save keeps a picture of the tab when the page names no image, and Undo removes it with the bookmark', async ({
  context,
  extensionWorker,
}) => {
  await setSettings(extensionWorker, {
    language: 'en',
    theme: 'light',
    coversEnabled: true,
    quickSaveCover: true,
    coversWidthPx: 320,
  });
  const page = await openPage(context, '/plain/Story-without-an-image');

  await pressShortcut(extensionWorker, page, 'quick-save');
  const record = await finishedRecord(extensionWorker);
  await expect
    .poll(() => readCoverInfos(extensionWorker))
    .toEqual([
      expect.objectContaining({ bookmarkId: record.bookmarkId, width: 320, source: 'quickSave' }),
    ]);
  expect(site.imageRequests).toBe(0);
  // The picture was taken before the notification was drawn: where the notification shows (top
  // right), the cover has the page's own color, not the notification's white.
  const [red, green, blue] = await coverPixel(extensionWorker, record.bookmarkId ?? '', 0.95, 0.04);
  expect(
    Math.abs((red ?? 0) - 0x2a) + Math.abs((green ?? 0) - 0x6f) + Math.abs((blue ?? 0) - 0x97),
  ).toBeLessThan(30);

  await expect.poll(() => toastButtons(page)).toContain('Remove cover');
  await clickToastButton(page, 'Undo');
  await expect.poll(() => bookmarksWithUrl(extensionWorker, page.url())).toEqual([]);
  await expect.poll(() => readCoverInfos(extensionWorker)).toEqual([]);
});

test('quick save keeps no cover with Save a Cover With Quick Save off, Fetch Covers off, or a cover source it cannot meet', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en', theme: 'light' });
  // A fresh profile has both off.
  await page.goto(`chrome-extension://${extensionId}/options.html?category=search`);
  await expect(page.getByRole('switch', { name: 'Save a Cover With Quick Save' })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  const cases = [
    // Nothing changed: quick save stores no cover by default.
    { path: '/image/Default-install', settings: {} },
    { path: '/image/Covers-off', settings: { quickSaveCover: true } },
    { path: '/image/Setting-off', settings: { coversEnabled: true, quickSaveCover: false } },
    // Quick Save Cover Source of its own: Page image only takes no picture of a page without one.
    {
      path: '/plain/Page-image-only',
      settings: { coversEnabled: true, quickSaveCover: true, quickSaveCoverSource: 'page_only' },
    },
  ];
  for (const { path, settings } of cases) {
    await setSettings(extensionWorker, settings);
    const page = await openPage(context, path);
    await pressShortcut(extensionWorker, page, 'quick-save');
    expect((await finishedRecord(extensionWorker)).status, path).toBe('saved');
    await expect.poll(() => toastButtons(page), { message: path }).toContain('Undo');
    // Give a cover the time it would take to arrive.
    await page.waitForTimeout(1_500);
    expect(await readCoverInfos(extensionWorker), path).toEqual([]);
    expect(await toastButtons(page), path).not.toContain('Remove cover');
    await page.close();
  }
  expect(site.imageRequests).toBe(0);
});
