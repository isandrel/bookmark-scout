/**
 * Capture Covers While Browsing: off by default, and asking for access to all pages when turned
 * on; then a bookmarked page that loads in the active tab of the focused window gets a picture as
 * its cover once it has settled, and pages in a private window, on a site never captured, without
 * a bookmark, or left before they settled get none. A card without a cover shows a tile of its
 * site's color, drawn with no request.
 */
import type { BrowserContext, Page, Worker } from '@playwright/test';
import { readConfigToml } from '../config-files';
import { expect, test, toastRegion } from './fixtures';
import { managerUrl, readCoverInfos } from './manager-helpers';
import { readSettings, setSettings } from './storage';
import { seedFolder } from './tool-helpers';

/** Wait Before Capturing's default, from its setting's config. */
const settleDelayMs = (
  (readConfigToml('settings/metadata-content.toml').covers as Record<string, unknown>)
    .browse_settle_ms as { default: number }
).default;
/** A longer wait set in one test, to see the setting take effect. */
const LONGER_SETTLE_MS = 3_000;
const AFTER_SETTLE_MS = settleDelayMs + 2_000;

const pageHtml = (title: string) =>
  `<!doctype html><html><head><title>${title}</title></head>` +
  `<body style="margin:0;background:#2a6f97"><h1 style="color:white">${title}</h1></body></html>`;

/** Serves every `*.e2e.invalid` page; `/slow` answers only after the settle delay has passed. */
async function routePages(context: BrowserContext) {
  await context.route('https://*.e2e.invalid/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/slow') {
      await new Promise((resolve) => setTimeout(resolve, AFTER_SETTLE_MS));
    }
    await route.fulfill({ status: 200, contentType: 'text/html', body: pageHtml(url.hostname) });
  });
}

/** The background listens to tab loads only while the feature is on and allowed. */
const listening = (worker: Worker) => worker.evaluate(() => chrome.tabs.onUpdated.hasListeners());

/** Opens `url` in a new tab in front, as the user browsing to it. */
async function browseTo(context: BrowserContext, url: string): Promise<Page> {
  const tab = await context.newPage();
  await tab.goto(url);
  await tab.bringToFront();
  return tab;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('Capture Covers While Browsing is off by default and pictures nothing', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  const url = 'https://story.e2e.invalid/off';
  await seedFolder(extensionWorker, 'E2E Browse Off', [{ title: 'Story', url }]);
  await routePages(context);
  await setSettings(extensionWorker, { coversEnabled: true });

  await browseTo(context, url);
  await wait(AFTER_SETTLE_MS);
  expect(await readCoverInfos(extensionWorker)).toEqual([]);
  expect(await listening(extensionWorker)).toBe(false);

  // Turning it on asks for access to all pages; declined, it stays off and says so.
  await page.addInitScript(() => {
    Object.defineProperty(chrome.permissions, 'request', {
      configurable: true,
      value: () => Promise.resolve(false),
    });
  });
  await page.goto(`chrome-extension://${extensionId}/options.html?category=metadataContent`);
  await page.bringToFront();
  const toggle = page.getByRole('switch', { name: 'Capture Covers While Browsing' });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  // Its limits show only while it is on.
  await expect(page.locator('[data-setting="coversBrowseSettleMs"]')).toHaveCount(0);
  await toggle.click();
  const explanation = page.getByRole('dialog', { name: 'Allow pictures of bookmarked pages' });
  await expect(explanation).toContainText('nothing is sent anywhere');
  await explanation.getByRole('button', { name: 'Allow access' }).click();
  await expect(
    toastRegion(page).getByText(
      'Capture Covers While Browsing stays off. Turning it on asks your browser for access to all pages.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  expect((await readSettings(extensionWorker)).coversBrowseCapture).not.toBe(true);
  expect(await listening(extensionWorker)).toBe(false);
});

test.describe('with access to all pages', () => {
  test.use({ grantPermissions: ['<all_urls>'] });

  test('a bookmarked page that loads in the active tab gets a cover captured while browsing once it settles', async ({
    context,
    extensionId,
    extensionWorker,
    page,
  }) => {
    const url = 'https://story.e2e.invalid/a';
    const seeded = await seedFolder(extensionWorker, 'E2E Browse Covers', [
      { title: 'Browsed story', url },
    ]);
    const bookmarkId = seeded.ids['Browsed story'] as string;
    await routePages(context);

    // Allowed, so turning it on in Settings asks nothing more.
    await setSettings(extensionWorker, { coversEnabled: true, coversWidthPx: 320 });
    await page.goto(`chrome-extension://${extensionId}/options.html?category=metadataContent`);
    const toggle = page.getByRole('switch', { name: 'Capture Covers While Browsing' });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect
      .poll(async () => (await readSettings(extensionWorker)).coversBrowseCapture)
      .toBe(true);
    await expect.poll(() => listening(extensionWorker)).toBe(true);
    // Its limits show now, with a note while the browser keeps the extension out of private
    // windows (a test profile does).
    for (const key of [
      'coversBrowseCapturePrivate',
      'coversBrowseSettleMs',
      'coversBrowseIntervalMs',
      'coversBrowseMaxAgeDays',
    ]) {
      await expect(page.locator(`[data-setting="${key}"]`).first()).toBeVisible();
    }
    await expect(page.getByTestId('private-window-access-note')).toBeVisible();

    // A longer Wait Before Capturing applies to the next page.
    await setSettings(extensionWorker, { coversBrowseSettleMs: LONGER_SETTLE_MS });
    await expect
      .poll(async () => (await readSettings(extensionWorker)).coversBrowseSettleMs)
      .toBe(LONGER_SETTLE_MS);
    const startedAt = Date.now();
    await browseTo(context, url);
    await expect
      .poll(() => readCoverInfos(extensionWorker), {
        timeout: AFTER_SETTLE_MS + LONGER_SETTLE_MS + 10_000,
      })
      .toEqual([expect.objectContaining({ bookmarkId, url, width: 320, source: 'browse' })]);
    // Not before the page had settled for the time set.
    const [cover] = await readCoverInfos(extensionWorker);
    expect((cover?.savedAt ?? 0) - startedAt).toBeGreaterThanOrEqual(LONGER_SETTLE_MS);

    // The card shows it, and the preview says where it came from.
    await setSettings(extensionWorker, { managerViewMode: 'cards' });
    await page.goto(managerUrl(extensionId, seeded.folderId));
    await page.bringToFront();
    const card = page.locator('[data-slot="bookmark-card"]').filter({ hasText: 'Browsed story' });
    await expect(card.getByTestId('bookmark-cover')).toHaveAttribute('src', /^blob:/);
    await card.click();
    await page.keyboard.press('p');
    const preview = page.getByRole('dialog', { name: 'Browsed story' });
    await expect(preview.getByTestId('bookmark-preview-cover-source')).toContainText(
      'Captured while browsing, saved ',
    );

    // A recent cover is kept: loading the page again takes no new picture.
    await browseTo(context, url);
    await wait(AFTER_SETTLE_MS);
    expect((await readCoverInfos(extensionWorker))[0]?.savedAt).toBe(cover?.savedAt);
  });

  test('no picture in a private window, of a site never captured, of a page without a bookmark, or of one left before it settles', async ({
    context,
    extensionWorker,
  }) => {
    const seeded = await seedFolder(extensionWorker, 'E2E Browse Skips', [
      { title: 'Never page', url: 'https://mail.never.e2e.invalid/inbox' },
      { title: 'Left page', url: 'https://left.e2e.invalid/a' },
      { title: 'Private page', url: 'https://private.e2e.invalid/a' },
      { title: 'Good page', url: 'https://good.e2e.invalid/a' },
    ]);
    await routePages(context);
    await setSettings(extensionWorker, {
      coversEnabled: true,
      coversBrowseCapture: true,
      coversNeverCaptureSites: ['never.e2e.invalid'],
    });
    await expect.poll(() => listening(extensionWorker)).toBe(true);
    const nothingStored = async () => expect(await readCoverInfos(extensionWorker)).toEqual([]);

    // A site on Never Capture These Sites, here through one of its subdomains.
    const tab = await browseTo(context, 'https://mail.never.e2e.invalid/inbox');
    await wait(AFTER_SETTLE_MS);
    await nothingStored();

    // A page with no bookmark of its address.
    await tab.goto('https://plain.e2e.invalid/');
    await wait(AFTER_SETTLE_MS);
    await nothingStored();

    // A bookmarked page left before it settled: the next page is still loading when its turn
    // comes, so the tab no longer shows it.
    await tab.goto('https://left.e2e.invalid/a');
    await tab.goto('https://plain.e2e.invalid/slow');
    await wait(AFTER_SETTLE_MS);
    await nothingStored();

    // A private window: the browser shows the extension a tab of a private window only when it
    // is allowed there, so the load is dispatched as the browser would send it, with the tab
    // reported at the bookmarked address in every other way.
    const tabId = await extensionWorker.evaluate(async () => {
      const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      return active?.id ?? -1;
    });
    await extensionWorker.evaluate(
      async ({ id, url }) => {
        const real = await chrome.tabs.get(id);
        const shown = { ...real, url, status: 'complete', active: true, incognito: true };
        const original = chrome.tabs.get.bind(chrome.tabs);
        (globalThis as { realTabsGet?: unknown }).realTabsGet = chrome.tabs.get;
        Object.defineProperty(chrome.tabs, 'get', {
          configurable: true,
          value: async (asked: number) => (asked === id ? shown : original(asked)),
        });
        (
          chrome.tabs.onUpdated as unknown as {
            dispatch: (...args: unknown[]) => void;
          }
        ).dispatch(id, { status: 'complete' }, shown);
      },
      { id: tabId, url: 'https://private.e2e.invalid/a' },
    );
    await wait(AFTER_SETTLE_MS);
    await nothingStored();
    await extensionWorker.evaluate(() => {
      // Back to the browser's own.
      Object.defineProperty(chrome.tabs, 'get', {
        configurable: true,
        value: (globalThis as { realTabsGet?: unknown }).realTabsGet,
      });
    });

    // The same tab browsing to a bookmarked page gets its picture, so each case above was
    // pictured nothing for its own reason.
    await tab.goto('https://good.e2e.invalid/a');
    await tab.bringToFront();
    await expect
      .poll(() => readCoverInfos(extensionWorker), { timeout: AFTER_SETTLE_MS + 10_000 })
      .toEqual([
        expect.objectContaining({ bookmarkId: seeded.ids['Good page'], source: 'browse' }),
      ]);
  });
});

test('a card without a cover shows its site on a tile of the site color, with no request', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Placeholder', [
    { title: 'First page', url: 'https://www.tile.e2e.invalid/a' },
    { title: 'Second page', url: 'https://news.tile.e2e.invalid/b' },
    { title: 'Other site', url: 'https://other.e2e.invalid/' },
  ]);
  const requests: string[] = [];
  context.on('request', (request) => {
    if (/^https?:/.test(request.url())) requests.push(request.url());
  });
  await setSettings(extensionWorker, { managerViewMode: 'cards', theme: 'light' });
  await page.goto(managerUrl(extensionId, seeded.folderId));
  const tile = (title: string) =>
    page
      .locator('[data-slot="bookmark-card"]')
      .filter({ hasText: title })
      .getByTestId('bookmark-card-placeholder');
  await expect(tile('First page')).toBeVisible();
  await expect(tile('First page').getByTestId('bookmark-card-site')).toHaveText('tile.e2e.invalid');
  await expect(tile('Second page').getByTestId('bookmark-card-site')).toHaveText(
    'news.tile.e2e.invalid',
  );
  // One color for every page of a site.
  const hue = (title: string) => tile(title).getAttribute('data-hue');
  expect(await hue('First page')).toBe(await hue('Second page'));
  const background = (title: string) =>
    tile(title).evaluate((element) => getComputedStyle(element).backgroundColor);
  const light = await background('First page');
  expect(light).toBe(await background('Second page'));
  expect(light).not.toBe('rgba(0, 0, 0, 0)');

  // The dark theme draws the same hue darker, so the site name stays readable.
  await setSettings(extensionWorker, { theme: 'dark' });
  await expect.poll(() => background('First page')).not.toBe(light);
  const textColor = await tile('First page').evaluate((element) => getComputedStyle(element).color);
  const luminance = (rgb: string) => {
    const [r, g, b] = (rgb.match(/\d+/g) ?? []).map(Number);
    return ((r ?? 0) * 299 + (g ?? 0) * 587 + (b ?? 0) * 114) / 1000;
  };
  expect(luminance(await background('First page'))).toBeLessThan(luminance(textColor));
  expect(requests).toEqual([]);
});
