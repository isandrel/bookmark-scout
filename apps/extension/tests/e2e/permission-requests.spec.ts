import type { BrowserContext, Page, Worker } from '@playwright/test';
import { expect, test, toastRegion } from './fixtures';
import { seedFolder } from './popup-helpers';
import { readSettings, STORAGE_ITEMS, writeStored } from './storage';

/**
 * Optional permissions are asked for when the user turns on the feature that needs them.
 * Chrome grants a permission without a warning (contextMenus) without a prompt, so that request
 * runs for real. Prompts with a warning (tabs) cannot be answered headlessly: the declined path
 * stubs `permissions.request`, and the granted path loads a copy with the permission granted.
 */

const ARTICLE_URL = 'https://current.e2e.invalid/permission-article';

async function storedSettings(worker: Worker): Promise<Record<string, unknown>> {
  return readSettings(worker);
}

async function hasContextMenus(worker: Worker): Promise<boolean> {
  return worker.evaluate(() => chrome.permissions.contains({ permissions: ['contextMenus'] }));
}

/** Chrome removes the API from the worker while the permission is missing. */
async function menuRootRegistered(worker: Worker): Promise<boolean> {
  return worker.evaluate(async () => {
    if (!chrome.contextMenus) return false;
    try {
      await chrome.contextMenus.update('bookmark-scout::root', {});
      return true;
    } catch {
      return false;
    }
  });
}

async function openDataSettings(page: Page, extensionId: string) {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByRole('tab', { name: 'Saving & Search', exact: true }).click();
  return page.getByRole('switch', { name: 'Right-Click Menu' });
}

/** Simulates the user declining every permission prompt on this page. */
async function declinePermissionPrompts(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(chrome.permissions, 'request', {
      configurable: true,
      value: () => Promise.resolve(false),
    });
  });
}

test('turning on Context Menu asks for the permission, builds the menu, and a revoke turns it off', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  // Off on a fresh install, with no permission and no menu.
  expect(await hasContextMenus(extensionWorker)).toBe(false);
  expect(await menuRootRegistered(extensionWorker)).toBe(false);
  const toggle = await openDataSettings(page, extensionId);
  await expect(toggle).toHaveAttribute('aria-checked', 'false');

  await toggle.click();
  await expect.poll(() => hasContextMenus(extensionWorker)).toBe(true);
  await expect
    .poll(async () => (await storedSettings(extensionWorker)).contextMenuEnabled)
    .toBe(true);
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => menuRootRegistered(extensionWorker)).toBe(true);

  // Revoked outside the page: the menu goes and the switch shows off, but the synced setting
  // stays on for devices where the permission is still granted.
  await extensionWorker.evaluate(() =>
    chrome.permissions.remove({ permissions: ['contextMenus'] }),
  );
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect.poll(() => menuRootRegistered(extensionWorker)).toBe(false);
  expect((await storedSettings(extensionWorker)).contextMenuEnabled).toBe(true);
});

test('declining a permission leaves Context Menu off and says so', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await declinePermissionPrompts(page);
  const toggle = await openDataSettings(page, extensionId);

  await toggle.click();
  const toast = toastRegion(page);
  await expect(toast.getByText('× Permission not granted', { exact: true })).toBeVisible();
  await expect(
    toast.getByText(
      'The right-click menu stays off. To allow it, turn on Right-Click Menu again.',
      {
        exact: true,
      },
    ),
  ).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  expect((await storedSettings(extensionWorker)).contextMenuEnabled).not.toBe(true);
  expect(await hasContextMenus(extensionWorker)).toBe(false);
});

/** Opens the side panel page, then a web page in front of it, as when browsing with the panel. */
async function sidePanelBehindArticle(context: BrowserContext, page: Page, extensionId: string) {
  await context.route(ARTICLE_URL, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<title>Permission Article</title><main>Article</main>',
    }),
  );
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(
    page.getByRole('combobox', { name: 'Search bookmarks, or type a folder name' }),
  ).toBeVisible();
  const article = await context.newPage();
  await article.goto(ARTICLE_URL);
  await article.bringToFront();
}

async function addCurrentPageTo(page: Page, folderTitle: string) {
  await page
    .getByRole('combobox', { name: 'Search bookmarks, or type a folder name' })
    .fill(folderTitle);
  const row = page.locator('.folder-item').filter({ hasText: folderTitle }).first();
  await row.hover();
  await row.getByTitle('Add current page').click();
}

async function folderUrls(worker: Worker, folderId: string): Promise<string[]> {
  return worker.evaluate(
    async (id) => (await chrome.bookmarks.getChildren(id)).flatMap((node) => node.url ?? []),
    folderId,
  );
}

test('the side panel offers the ways that need no permission, then asks for tab access, and saves nothing when declined', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'E2E Tab Access Declined', []);
  await declinePermissionPrompts(page);
  await sidePanelBehindArticle(context, page, extensionId);
  // The quick save keys the browser actually assigned, as the dialog shows them.
  const quickSaveKeys = await extensionWorker.evaluate(
    async () =>
      (await chrome.commands.getAll()).find((command) => command.name === 'quick-save')?.shortcut,
  );
  expect(quickSaveKeys).toBeTruthy();

  await addCurrentPageTo(page, 'E2E Tab Access Declined');
  const prompt = page.getByRole('dialog', { name: "Save the page you're on" });
  await expect(prompt).toContainText('The side panel stays open while you switch tabs');
  const alternatives = prompt.getByTestId('permission-alternatives');
  await expect(alternatives).toContainText('Click the Bookmark Scout button in the toolbar');
  await expect(alternatives).toContainText(`Press ${quickSaveKeys} on the page`);
  await expect(prompt).toContainText('“Read your browsing history”');
  await prompt.getByRole('button', { name: 'Not now' }).click();
  await expect(prompt).toHaveCount(0);

  await addCurrentPageTo(page, 'E2E Tab Access Declined');
  await prompt.getByRole('button', { name: 'Allow access' }).click();
  await expect(
    toastRegion(page).getByText('× Permission not granted', { exact: true }),
  ).toBeVisible();
  expect(await folderUrls(extensionWorker, folder.folderId)).toEqual([]);
});

test.describe('with tab access granted', () => {
  test.use({ grantPermissions: ['tabs'] });

  test('the side panel saves the current page without asking', async ({
    context,
    extensionId,
    extensionWorker,
    page,
  }) => {
    const folder = await seedFolder(extensionWorker, 'E2E Tab Access Granted', []);
    await sidePanelBehindArticle(context, page, extensionId);

    await addCurrentPageTo(page, 'E2E Tab Access Granted');
    await expect.poll(() => folderUrls(extensionWorker, folder.folderId)).toEqual([ARTICLE_URL]);
    await expect(page.getByRole('dialog', { name: "Save the page you're on" })).toHaveCount(0);
  });
});

test('Read page content explains website access before the browser asks, and Not now asks nothing', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await writeStored(extensionWorker, STORAGE_ITEMS.settings, { language: 'en', aiEnabled: true });
  // Count requests and decline them, since the real prompt cannot be answered headlessly.
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
  const requestCount = () =>
    page.evaluate(
      () => (window as unknown as { permissionRequests: unknown[] }).permissionRequests.length,
    );

  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByRole('tab', { name: 'AI', exact: true }).click();
  const toggle = page.getByRole('switch', { name: 'Read page content' });
  const dialog = page.getByRole('dialog', { name: 'Allow reading page content' });

  await toggle.click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Bookmark Scout never receives page content.');
  expect(await requestCount()).toBe(0);
  await dialog.getByRole('button', { name: 'Not now' }).click();
  await expect(dialog).toBeHidden();
  await expect(toggle).not.toBeChecked();
  expect(await requestCount()).toBe(0);

  // Allow access is the click the browser's own prompt runs from.
  await toggle.click();
  await dialog.getByRole('button', { name: 'Allow access' }).click();
  await expect.poll(requestCount).toBe(1);
  await expect(toggle).not.toBeChecked();
  expect((await storedSettings(extensionWorker)).aiReadPageContent).not.toBe(true);
});
