import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Page, Route, Worker } from '@playwright/test';
import { expect, test, toastRegion } from './fixtures';
import { bookmarkRow, openPopup } from './popup-helpers';
import { openTools, seedFolder, setSettings, toolCard } from './tool-helpers';

const SITE_ICONS_KEY = 'bookmark-scout-site-icons';
// A real 1x1 PNG, so the browser decodes it instead of falling back to the generic icon.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const PNG_DATA_URL = `data:image/png;base64,${PNG.toString('base64')}`;
/** 2 KB that starts like a PNG: over a 1 KB cap, so it must be rejected before it is used. */
const OVERSIZED_PNG = Buffer.concat([PNG, Buffer.alloc(2048 - PNG.length)]);

async function readSiteIcons(worker: Worker) {
  return worker.evaluate(async (key) => {
    const stored = await chrome.storage.local.get(key);
    return (stored[key] ?? null) as Record<string, { icon: string; fetchedAt: number }> | null;
  }, SITE_ICONS_KEY);
}

function managerRow(page: Page, title: string) {
  return page.locator('tbody tr').filter({ hasText: title });
}

/** The icon in a manager row's Title cell. */
function rowIcon(page: Page, title: string) {
  return managerRow(page, title).locator('[data-icon-source]').first();
}

function summaryCount(page: Page, status: string) {
  return page
    .getByRole('dialog', { name: 'Refresh Site Icons' })
    .getByTestId('site-icons-summary')
    .locator(`[data-status="${status}"] dd`);
}

type MockedResponse = { status?: number; contentType?: string; body?: string | Buffer } | 'abort';

/** Route-mocks every *.e2e.invalid request and records the URLs that were requested. */
async function mockSites(page: Page, responses: Record<string, MockedResponse>) {
  const requests: string[] = [];
  await page.route('https://*.e2e.invalid/**', async (route: Route) => {
    const url = route.request().url();
    requests.push(url);
    const response = responses[url];
    if (response === 'abort') return route.abort('failed');
    return route.fulfill({
      status: response?.status ?? (response ? 200 : 404),
      contentType: response?.contentType ?? 'text/html',
      body: response?.body ?? '',
    });
  });
  return requests;
}

test.describe('with website access granted', () => {
  test.use({ grantWebHostAccess: true });

  test('site icon refresh dedupes origins, rejects oversized and non-image icons, and renders saved icons', async ({
    extensionId,
    extensionWorker,
    page,
  }) => {
    const folder = await seedFolder(extensionWorker, 'E2E Site Icons', [
      { title: 'Icons A One', url: 'https://icons-a.e2e.invalid/one' },
      { title: 'Icons A Two', url: 'https://icons-a.e2e.invalid/two' },
      { title: 'Icons Big', url: 'https://icons-big.e2e.invalid/' },
      { title: 'Icons Html', url: 'https://icons-html.e2e.invalid/' },
      { title: 'Icons Down', url: 'https://icons-down.e2e.invalid/' },
      { title: 'Icons Bookmarklet', url: 'javascript:void(0)' },
    ]);
    await seedFolder(extensionWorker, 'E2E Site Icons Outside', [
      { title: 'Icons Outside', url: 'https://icons-outside.e2e.invalid/' },
    ]);
    await setSettings(extensionWorker, { siteIconsDefaultScope: 'folder', siteIconsMaxIconKb: 1 });
    const requests = await mockSites(page, {
      'https://icons-a.e2e.invalid/one': {
        body:
          '<head><base href="/assets/"><link rel="icon" sizes="16x16" href="small.png">' +
          '<link rel="icon" sizes="32x32" href="icon-32.png"></head>',
      },
      'https://icons-a.e2e.invalid/assets/icon-32.png': { contentType: 'image/png', body: PNG },
      'https://icons-a.e2e.invalid/assets/small.png': { contentType: 'image/png', body: PNG },
      'https://icons-big.e2e.invalid/': { body: '<link rel="icon" href="/big.png">' },
      'https://icons-big.e2e.invalid/big.png': { contentType: 'image/png', body: OVERSIZED_PNG },
      'https://icons-html.e2e.invalid/': { body: '<link rel="icon" href="/icon.png">' },
      // A soft 404: an HTML page where the icon should be.
      'https://icons-html.e2e.invalid/icon.png': { body: '<html>Not Found</html>' },
      'https://icons-down.e2e.invalid/': 'abort',
    });

    await openTools(page, extensionId, folder.folderId);
    const card = toolCard(page, 'Refresh Site Icons');
    await expect(card.getByRole('combobox')).toContainText('E2E Site Icons');
    await expect(card).toContainText('0 icons saved (0 KB)');
    await card.getByRole('button', { name: 'Refresh', exact: true }).click();

    const results = page.getByRole('dialog', { name: 'Refresh Site Icons' });
    await expect(summaryCount(page, 'updated')).toHaveText('1');
    await expect(summaryCount(page, 'unchanged')).toHaveText('0');
    await expect(summaryCount(page, 'noIcon')).toHaveText('2');
    await expect(summaryCount(page, 'failed')).toHaveText('1');
    await expect(summaryCount(page, 'skipped')).toHaveText('1');
    await expect(
      results.getByText('1 bookmark is not a web link and was skipped.', { exact: true }),
    ).toBeVisible();
    const originRow = (origin: string) => results.locator(`[data-origin="${origin}"]`);
    await expect(originRow('https://icons-a.e2e.invalid')).toContainText(
      'Icon from https://icons-a.e2e.invalid/assets/icon-32.png',
    );
    await expect(originRow('https://icons-a.e2e.invalid')).toContainText('2 bookmarks');
    await expect(originRow('https://icons-a.e2e.invalid').locator('img')).toHaveAttribute(
      'src',
      PNG_DATA_URL,
    );
    await expect(originRow('https://icons-big.e2e.invalid')).toContainText(
      'The icon file is larger than the size limit',
    );
    await expect(originRow('https://icons-html.e2e.invalid')).toContainText(
      'The icon file is not an image',
    );
    await expect(originRow('https://icons-down.e2e.invalid')).toContainText(
      'Could not connect to the site',
    );

    // One page per origin, nothing outside the selected folder, and no third-party services.
    expect(requests.filter((url) => url.startsWith('https://icons-a.e2e.invalid/'))).toEqual([
      'https://icons-a.e2e.invalid/one',
      'https://icons-a.e2e.invalid/assets/icon-32.png',
    ]);
    expect(requests.filter((url) => url.includes('icons-outside'))).toEqual([]);
    expect(requests.every((url) => new URL(url).hostname.endsWith('.e2e.invalid'))).toBe(true);
    // Nothing is stored until the results are saved.
    expect(await readSiteIcons(extensionWorker)).toBeNull();

    await results.getByRole('button', { name: 'Save 1 icon' }).click();
    await expect(toastRegion(page).getByText('✓ Site icons saved', { exact: true })).toBeVisible();
    await expect(
      toastRegion(page).getByText('1 icon saved on this device', { exact: true }),
    ).toBeVisible();
    const stored = await readSiteIcons(extensionWorker);
    expect(Object.keys(stored ?? {})).toEqual(['https://icons-a.e2e.invalid']);
    expect(stored?.['https://icons-a.e2e.invalid'].icon).toBe(PNG_DATA_URL);

    // Both bookmarks on the origin show the saved icon; others keep the browser's icon.
    for (const title of ['Icons A One', 'Icons A Two']) {
      await expect(rowIcon(page, title)).toHaveAttribute('data-icon-source', 'saved');
      await expect(rowIcon(page, title)).toHaveAttribute('src', PNG_DATA_URL);
    }
    await expect(rowIcon(page, 'Icons Big')).toHaveAttribute('data-icon-source', 'browser');
    await expect(card).toContainText('1 icon saved (');
  });

  test('site icon refresh reads a real non-CORS server and reports unchanged icons next time', async ({
    extensionId,
    extensionWorker,
    page,
  }) => {
    const requests: string[] = [];
    const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
      const host = req.headers.host?.split(':')[0];
      requests.push(`${req.method} ${host}${pathname}`);
      // localhost declares no icon, so only its /favicon.ico can supply one.
      if (host === 'localhost' && pathname === '/page') {
        res.writeHead(200, { 'content-type': 'text/html' });
        return res.end('<title>No icon links</title>');
      }
      if (host === 'localhost' && pathname === '/favicon.ico') {
        res.writeHead(200, { 'content-type': 'image/x-icon' });
        return res.end(PNG);
      }
      if (pathname === '/page') {
        res.writeHead(200, { 'content-type': 'text/html' });
        return res.end('<link rel="icon" type="image/png" href="/icon.png">');
      }
      if (pathname === '/icon.png') {
        res.writeHead(200, { 'content-type': 'image/png' });
        return res.end(PNG);
      }
      res.writeHead(404, { 'content-type': 'text/html' });
      res.end('Not Found');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const origin = `http://127.0.0.1:${port}`;
    const fallbackOrigin = `http://localhost:${port}`;

    try {
      const folder = await seedFolder(extensionWorker, 'E2E Real Site Icons', [
        { title: 'Real Page', url: `${origin}/page` },
        { title: 'Real Page Again', url: `${origin}/page?again` },
        { title: 'Fallback Page', url: `${fallbackOrigin}/page` },
      ]);
      await setSettings(extensionWorker, { siteIconsDefaultScope: 'folder' });

      await openTools(page, extensionId, folder.folderId);
      const card = toolCard(page, 'Refresh Site Icons');
      const results = page.getByRole('dialog', { name: 'Refresh Site Icons' });
      await card.getByRole('button', { name: 'Refresh', exact: true }).click();
      await expect(summaryCount(page, 'updated')).toHaveText('2');
      await expect(results.locator(`[data-origin="${fallbackOrigin}"]`)).toContainText(
        `Icon from ${fallbackOrigin}/favicon.ico`,
      );
      await results.getByRole('button', { name: 'Save 2 icons' }).click();
      await expect(results).toHaveCount(0);
      const stored = await readSiteIcons(extensionWorker);
      expect(Object.keys(stored ?? {}).sort()).toEqual([origin, fallbackOrigin]);
      expect(stored?.[origin]?.icon).toBe(PNG_DATA_URL);
      // The file was served as image/x-icon but is a PNG; the stored type follows its bytes.
      expect(stored?.[fallbackOrigin]?.icon).toBe(PNG_DATA_URL);
      await expect(rowIcon(page, 'Real Page Again')).toHaveAttribute('src', PNG_DATA_URL);
      await expect(rowIcon(page, 'Fallback Page')).toHaveAttribute('src', PNG_DATA_URL);

      await card.getByRole('button', { name: 'Refresh', exact: true }).click();
      await expect(summaryCount(page, 'unchanged')).toHaveText('2');
      await expect(summaryCount(page, 'updated')).toHaveText('0');
      await expect(results.locator(`[data-origin="${origin}"]`)).toContainText(
        'Same icon as the one already saved',
      );
      const firstRun = [
        'GET 127.0.0.1/page',
        'GET 127.0.0.1/icon.png',
        'GET localhost/page',
        'GET localhost/favicon.ico',
      ];
      // One page and one icon per origin on each run, whatever the request order.
      expect([...requests].sort()).toEqual([...firstRun, ...firstRun].sort());
    } finally {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
    }
  });
});

test('site icon refresh asks for website access and requests nothing when it is declined', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'E2E Site Icons Declined', [
    { title: 'Declined Page', url: 'https://icons-declined.e2e.invalid/' },
  ]);
  const requests = await mockSites(page, {});
  // The real browser prompt cannot be answered headlessly; simulate the user declining it.
  await page.addInitScript(() => {
    Object.defineProperty(chrome.permissions, 'request', {
      configurable: true,
      value: () => Promise.resolve(false),
    });
  });

  await openTools(page, extensionId, folder.folderId);
  await toolCard(page, 'Refresh Site Icons').getByRole('button', { name: 'Refresh', exact: true }).click();
  const prompt = page.getByRole('dialog', { name: 'Allow access to websites?' });
  await expect(prompt).toContainText('site icon refreshes request each bookmarked page');
  await prompt.getByRole('button', { name: 'Allow access' }).click();
  await expect(
    toastRegion(page).getByText('Website access not granted', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Refresh Site Icons' })).toHaveCount(0);
  expect(requests).toEqual([]);
  expect(await readSiteIcons(extensionWorker)).toBeNull();
});

test('clearing saved site icons restores browser icons in the manager and popup', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'E2E Saved Site Icons', [
    { title: 'Saved Icon Link', url: 'https://icons-saved.e2e.invalid/page' },
  ]);
  await extensionWorker.evaluate(
    async ({ key, icon }) => {
      await chrome.storage.local.set({
        [key]: { 'https://icons-saved.e2e.invalid': { icon, fetchedAt: Date.now() } },
      });
    },
    { key: SITE_ICONS_KEY, icon: PNG_DATA_URL },
  );

  const popup = await context.newPage();
  await openPopup(popup, extensionId);
  await popup.getByPlaceholder('Search bookmarks...').fill('Saved Icon Link');
  const popupIcon = bookmarkRow(popup, 'Saved Icon Link').locator('[data-icon-source]');
  await expect(popupIcon).toHaveAttribute('data-icon-source', 'saved');
  await expect(popupIcon).toHaveAttribute('src', PNG_DATA_URL);

  await openTools(page, extensionId, folder.folderId);
  await expect(rowIcon(page, 'Saved Icon Link')).toHaveAttribute('src', PNG_DATA_URL);
  const card = toolCard(page, 'Refresh Site Icons');
  await expect(card).toContainText('1 icon saved (0.1 KB)');
  await card.getByRole('button', { name: 'Clear saved icons' }).click();
  await expect(toastRegion(page).getByText('✓ Saved icons cleared', { exact: true })).toBeVisible();

  expect(await readSiteIcons(extensionWorker)).toBeNull();
  await expect(card).toContainText('0 icons saved (0 KB)');
  await expect(card.getByRole('button', { name: 'Clear saved icons' })).toBeDisabled();
  await expect(rowIcon(page, 'Saved Icon Link')).toHaveAttribute('data-icon-source', 'browser');
  // Other open pages follow the change without a reload.
  await expect(popupIcon).toHaveAttribute('data-icon-source', 'browser');
});
