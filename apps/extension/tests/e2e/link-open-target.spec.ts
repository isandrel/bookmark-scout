import type { BrowserContext, Page, Worker } from '@playwright/test';
import { expect, test } from './fixtures';
import { seedFolder, setSettings } from './popup-helpers';

const LINK_URL = 'https://links.e2e.invalid/article';
const FOLDER = 'E2E Link Target';

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
