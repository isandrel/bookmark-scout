import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { bookmarkRow, openPopup, seedFolder, setSettings } from './popup-helpers';

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
  await page.getByRole('combobox', { name: 'Search bookmarks...' }).fill('Icon Source');
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
    await options.getByRole('switch', { name: "Use the browser's icon cache" }).click();
    await expect
      .poll(() =>
        extensionWorker.evaluate(
          async () =>
            (
              (await chrome.storage.sync.get('bookmark-scout-settings'))[
                'bookmark-scout-settings'
              ] as { browserIconCache?: boolean } | undefined
            )?.browserIconCache,
        ),
      )
      .toBe(true);

    const icon = row.locator('img');
    await expect(icon).toHaveAttribute('src', /\/_favicon\//);
    // The cache answers with a generic icon for a site it has never seen.
    await expect
      .poll(() => icon.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth))
      .toBeGreaterThan(0);
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
