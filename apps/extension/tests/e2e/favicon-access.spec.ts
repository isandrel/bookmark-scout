import type { Page } from '@playwright/test';
import { expect, test, toastRegion } from './fixtures';
import { bookmarkRow, openPopup, seedFolder, setSettings } from './popup-helpers';
import { readSettings } from './storage';
import { openTools, toolCard } from './tool-helpers';

/**
 * The browser's icon cache at `_favicon/` is used only once the user turns on Use the browser's
 * icon cache and allows the optional `favicon` permission. It serves the extension's own pages
 * without a web_accessible_resources entry, and web pages cannot load icons through the extension.
 */

/** Resolves once the image finished loading: its natural width, or 0 when it failed. */
function loadedWidth(src: string): Promise<number> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image.naturalWidth);
    image.onerror = () => resolve(0);
    image.src = src;
  });
}

async function showIconSource(page: Page, extensionId: string) {
  await openPopup(page, extensionId);
  await page
    .getByRole('combobox', { name: 'Search bookmarks, or type a folder name' })
    .fill('Icon Source');
  return bookmarkRow(page, 'Icon Source');
}

test.describe('with the favicon permission granted', () => {
  test.use({ grantPermissions: ['favicon'] });

  test("Use the browser's icon cache shows cached icons only once it is on and allowed", async ({
    extensionId,
    extensionWorker,
    page,
  }) => {
    await seedFolder(extensionWorker, 'E2E Favicon Access', [
      { title: 'Icon Source', url: 'https://e2e.invalid/icon-source' },
    ]);
    const row = await showIconSource(page, extensionId);
    // Off by default: no request to the browser cache, so the row shows its generic icon.
    await expect(row.locator('img[src*="/_favicon/"]')).toHaveCount(0);

    // Turned on in Options, which asks for the permission (granted already, so no prompt).
    const options = await page.context().newPage();
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    await options.getByRole('tab', { name: 'Appearance' }).click();
    await options.getByRole('checkbox', { name: "Use the browser's icon cache" }).click();
    await expect
      .poll(async () => (await readSettings(extensionWorker)).browserIconCache)
      .toBe(true);

    const icon = row.locator('img');
    await expect(icon).toHaveAttribute('src', /\/_favicon\//);
    // The cache answers with a generic icon for a site it has never seen.
    await expect
      .poll(() => icon.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth))
      .toBeGreaterThan(0);
  });

  test('Show browser icons on Refresh Site Icons turns the icon cache on in one click', async ({
    extensionId,
    extensionWorker,
    page,
  }) => {
    const folder = await seedFolder(extensionWorker, 'E2E Favicon Offer', [
      { title: 'Icon Source', url: 'https://e2e.invalid/icon-source' },
    ]);
    await openTools(page, extensionId, folder.folderId);
    const offer = toolCard(page, 'Refresh Site Icons').getByTestId('browser-icons-offer');
    await offer.getByRole('button', { name: 'Show browser icons' }).click();
    // Already allowed here, so no explanation and no prompt.
    await expect
      .poll(async () => (await readSettings(extensionWorker)).browserIconCache)
      .toBe(true);
    await expect(offer).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  // With the permission granted, so only the missing web_accessible_resources entry blocks it.
  test('web pages cannot load icons through the extension', async ({
    context,
    extensionId,
    page,
  }) => {
    await context.route('https://favicon-probe.e2e.invalid/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Probe</title>' }),
    );
    await page.goto('https://favicon-probe.e2e.invalid/');

    const iconUrl = `chrome-extension://${extensionId}/_favicon/?pageUrl=${encodeURIComponent('https://example.com/')}&size=16`;
    expect(await page.evaluate(loadedWidth, iconUrl)).toBe(0);
  });
});

test('the setting alone does not use the icon cache without the permission', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await seedFolder(extensionWorker, 'E2E Favicon Missing', [
    { title: 'Icon Source', url: 'https://e2e.invalid/icon-source' },
  ]);
  // On in synced settings (for example from another device), but not granted here.
  await setSettings(extensionWorker, { browserIconCache: true });
  const row = await showIconSource(page, extensionId);
  await expect(row).toBeVisible();
  await expect(row.locator('img[src*="/_favicon/"]')).toHaveCount(0);
});

test('Refresh Site Icons offers the browser icons first, explains the mild prompt, and stays off when declined', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'E2E Favicon Offer Declined', [
    { title: 'Icon Source', url: 'https://e2e.invalid/icon-source' },
  ]);
  // Record and decline requests: the real prompt cannot be answered headlessly.
  await page.addInitScript(() => {
    const calls: unknown[] = [];
    (window as unknown as { permissionRequests: unknown[] }).permissionRequests = calls;
    Object.defineProperty(chrome.permissions, 'request', {
      configurable: true,
      value: (request: unknown) => {
        calls.push(request);
        return Promise.resolve(false);
      },
    });
  });
  const requests = () =>
    page.evaluate(
      () => (window as unknown as { permissionRequests: unknown[] }).permissionRequests,
    );

  await openTools(page, extensionId, folder.folderId);
  const card = toolCard(page, 'Refresh Site Icons');
  const show = card.getByRole('button', { name: 'Show browser icons' });
  const dialog = page.getByRole('dialog', { name: 'Show the icons your browser already has?' });

  await show.click();
  await expect(dialog).toContainText('“Read the icons of the websites you visit”');
  await expect(dialog).toContainText('nothing leaves your device');
  await dialog.getByRole('button', { name: 'Not now' }).click();
  await expect(dialog).toHaveCount(0);
  expect(await requests()).toEqual([]);

  await show.click();
  await dialog.getByRole('button', { name: 'Allow access' }).click();
  await expect.poll(requests).toEqual([{ permissions: ['favicon'] }]);
  await expect(
    toastRegion(page).getByText('× Permission not granted', { exact: true }),
  ).toBeVisible();
  expect((await readSettings(extensionWorker)).browserIconCache).not.toBe(true);
  // Refresh Site Icons stays available as the other way.
  await expect(card.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
});
