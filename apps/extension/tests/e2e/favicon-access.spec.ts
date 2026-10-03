import { expect, test } from './fixtures';
import { bookmarkRow, openPopup, seedFolder } from './popup-helpers';

/**
 * The browser's icon cache at `_favicon/` serves the extension's own pages without a
 * web_accessible_resources entry, and web pages cannot load icons through the extension.
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

test('the popup shows site icons from the browser cache', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await seedFolder(extensionWorker, 'E2E Favicon Access', [
    { title: 'Icon Source', url: 'https://e2e.invalid/icon-source' },
  ]);

  await openPopup(page, extensionId);
  await page.getByPlaceholder('Search bookmarks...').fill('Icon Source');
  const icon = bookmarkRow(page, 'Icon Source').locator('img');
  await expect(icon).toHaveAttribute('src', /\/_favicon\//);
  // The cache answers with a generic icon for a site it has never seen.
  await expect
    .poll(() => icon.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth))
    .toBeGreaterThan(0);
});

test('web pages cannot load icons through the extension', async ({ context, extensionId, page }) => {
  await context.route('https://favicon-probe.e2e.invalid/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Probe</title>' }),
  );
  await page.goto('https://favicon-probe.e2e.invalid/');

  const iconUrl = `chrome-extension://${extensionId}/_favicon/?pageUrl=${encodeURIComponent('https://example.com/')}&size=16`;
  expect(await page.evaluate(loadedWidth, iconUrl)).toBe(0);
});
