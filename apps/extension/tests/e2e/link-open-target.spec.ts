import type { BrowserContext, Page, Worker } from '@playwright/test';
import { expect, test } from './fixtures';
import { bookmarkRow, openPopup, seedFolder, setSettings } from './popup-helpers';

const LINK_URL = 'https://links.e2e.invalid/article';
const FOLDER = 'E2E Link Target';
// Longer than the URL column at this width, so the manager cuts it short.
const LONG_URL = `https://long.e2e.invalid/${'a-very-long-path-segment/'.repeat(12)}end`;

// The check reads tab URLs, which the extension sees only with the optional tabs permission.
test.use({ viewport: { width: 1400, height: 900 }, grantPermissions: ['tabs'] });

async function serveLink(context: BrowserContext) {
  await context.route(LINK_URL, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Article</title>' }),
  );
}

async function openManagerFolder(page: Page, extensionId: string, folderId: string) {
  await page.goto(`chrome-extension://${extensionId}/bookmarks.html?id=${folderId}`);
  const link = page.locator('tbody tr').getByRole('link', { name: LINK_URL });
  await expect(link).toBeVisible();
  return link;
}

/** Whether the tab showing the link is its window's active tab. */
async function linkTabIsActive(worker: Worker): Promise<boolean | undefined> {
  return worker.evaluate(async (url) => {
    const tabs = await chrome.tabs.query({});
    return tabs.find((tab) => (tab.pendingUrl || tab.url) === url)?.active;
  }, LINK_URL);
}

test('linkOpenTarget opens a manager URL in a new tab, a background tab, or the current tab', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await serveLink(context);
  const { folderId } = await seedFolder(extensionWorker, FOLDER, [
    { title: 'Article', url: LINK_URL },
  ]);

  // Default: a new tab that becomes the active one.
  let link = await openManagerFolder(page, extensionId, folderId);
  let opened = context.waitForEvent('page');
  await link.click();
  const foreground = await opened;
  await expect(foreground).toHaveURL(LINK_URL);
  await expect.poll(() => linkTabIsActive(extensionWorker)).toBe(true);
  await foreground.close();

  // Background: a new tab opens, and the manager stays the active tab.
  await setSettings(extensionWorker, { linkOpenTarget: 'background_tab' });
  link = await openManagerFolder(page, extensionId, folderId);
  await page.bringToFront();
  opened = context.waitForEvent('page');
  await link.click();
  const background = await opened;
  // A background tab can start loading before the route above is attached to it, so check the
  // tab rather than the page it loaded.
  await expect.poll(() => linkTabIsActive(extensionWorker)).toBe(false);
  await background.close();

  // Current tab: the manager itself navigates to the link.
  await setSettings(extensionWorker, { linkOpenTarget: 'current_tab' });
  link = await openManagerFolder(page, extensionId, folderId);
  await link.click();
  await expect(page).toHaveURL(LINK_URL);
});

test('the link target icon follows Open links in, hides with Show Where Links Open off, and leaves truncated addresses whole', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en' });
  const { folderId } = await seedFolder(extensionWorker, FOLDER, [
    { title: 'Article', url: LINK_URL },
    { title: 'Long address', url: LONG_URL },
  ]);
  const link = await openManagerFolder(page, extensionId, folderId);

  // Default: a new tab, said by the icon's words inside the link.
  await expect(link).toHaveAccessibleName(/Opens in a new tab$/);
  await expect(link.locator('[data-slot="link-target"]')).toHaveAttribute('data-target', 'new_tab');

  // The long address is cut short with an ellipsis, and its icon stays whole inside the cell.
  const longLink = page.locator('tbody tr').getByRole('link', { name: LONG_URL });
  const cell = longLink.locator('xpath=ancestor::td');
  const icon = longLink.locator('[data-slot="link-target"]');
  await expect(icon).toBeVisible();
  const truncated = await longLink.evaluate((anchor) => {
    const text = anchor.firstElementChild as HTMLElement;
    return text.scrollWidth > text.clientWidth;
  });
  expect(truncated).toBe(true);
  const [iconBox, cellBox] = await Promise.all([icon.boundingBox(), cell.boundingBox()]);
  if (!iconBox || !cellBox) throw new Error('No icon or cell box');
  expect(iconBox.width).toBeGreaterThan(0);
  expect(iconBox.x + iconBox.width).toBeLessThanOrEqual(cellBox.x + cellBox.width);

  // The current tab: the icon and its words change live.
  await setSettings(extensionWorker, { linkOpenTarget: 'current_tab' });
  await expect(link).toHaveAccessibleName(/Opens in this tab$/);
  await expect(link.locator('[data-slot="link-target"]')).toHaveAttribute(
    'data-target',
    'current_tab',
  );

  // A popup row shows the same icon with its hover actions, and says it to screen readers.
  const popup = await context.newPage();
  await openPopup(popup, extensionId);
  await popup
    .getByRole('combobox', { name: 'Search bookmarks, or type a folder name' })
    .fill('Article');
  const row = bookmarkRow(popup, 'Article');
  await row.hover();
  await expect(
    row.locator('[data-slot="bookmark-actions"] [data-slot="link-target"]'),
  ).toHaveAttribute('data-target', 'current_tab');
  await expect(row.getByRole('treeitem')).toHaveAccessibleDescription('Opens in this tab');

  // Show Where Links Open off: no icon anywhere, and the links say only their address.
  await setSettings(extensionWorker, { showLinkTarget: false });
  await expect(page.locator('[data-slot="link-target"]')).toHaveCount(0);
  await expect(link).toHaveAccessibleName(LINK_URL);
  await expect(popup.locator('[data-slot="link-target"]')).toHaveCount(0);
  await expect(row.getByRole('treeitem')).toHaveAccessibleDescription('');
});
