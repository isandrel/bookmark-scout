/**
 * The manager's address: `?q=` search with one history entry per burst of typing, Back and
 * Forward restoring search and folder, Chrome's folder UUID links, the tab title, Copy link to
 * this folder, and Show in folder from search results.
 */
import type { Page, Worker } from '@playwright/test';
import { expect, test, toastRegion } from './fixtures';

type SeedItem = { title: string; url?: string; children?: SeedItem[] };

/** Creates a folder under the bookmarks bar's sibling root and returns IDs keyed by title. */
async function seedFolder(worker: Worker, title: string, items: SeedItem[]) {
  return worker.evaluate(
    async ({ folderTitle, entries }) => {
      const [root] = await chrome.bookmarks.getTree();
      const writableRoot = root.children?.find((node) => node.children !== undefined);
      if (!writableRoot) throw new Error('No writable bookmark root found');
      const ids: Record<string, string> = {};
      const create = async (parentId: string, list: typeof entries) => {
        for (const entry of list) {
          const created = await chrome.bookmarks.create({
            parentId,
            title: entry.title,
            ...(entry.url ? { url: entry.url } : {}),
          });
          ids[entry.title] = created.id;
          if (entry.children) await create(created.id, entry.children);
        }
      };
      const folder = await chrome.bookmarks.create({ parentId: writableRoot.id, title: folderTitle });
      await create(folder.id, entries);
      return { folderId: folder.id, rootId: writableRoot.id, ids };
    },
    { folderTitle: title, entries: items },
  );
}

function managerUrl(extensionId: string, query = '') {
  return `chrome-extension://${extensionId}/bookmarks.html${query}`;
}

function row(page: Page, title: string) {
  return page.locator('tbody tr').filter({ hasText: title });
}

function titleFilter(page: Page) {
  return page.getByRole('textbox', { name: 'Filter titles' });
}

function breadcrumbCurrent(page: Page) {
  return page.getByTestId('breadcrumb').locator('[aria-current="page"]');
}

function search(page: Page) {
  return page.evaluate(() => window.location.search);
}

test.use({ viewport: { width: 1400, height: 900 } });

test('?q= searches every folder, and typing adds one history entry per burst', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Url Search', [
    { title: 'Nested', children: [{ title: 'Needle Deep', url: 'https://example.com/deep' }] },
    { title: 'Needle Top', url: 'https://example.com/top' },
    { title: 'Haystack', url: 'https://example.com/hay' },
  ]);

  await page.goto(managerUrl(extensionId, '?q=Needle'));
  await expect(titleFilter(page)).toHaveValue('Needle');
  await expect(row(page, 'Needle Deep')).toBeVisible();
  await expect(row(page, 'Needle Top')).toBeVisible();
  await expect(row(page, 'Haystack')).toHaveCount(0);
  await expect(page).toHaveTitle('Search "Needle" - Bookmarks - Bookmark Scout');

  // A folder, then a search typed in one burst: one entry, and Back returns to the folder.
  await page.goto(managerUrl(extensionId, `?id=${seeded.folderId}`));
  await expect(row(page, 'Haystack')).toBeVisible();
  await expect(page).toHaveTitle('E2E Url Search - Bookmarks - Bookmark Scout');
  const historyLength = () => page.evaluate(() => window.history.length);
  const start = await historyLength();
  await titleFilter(page).pressSequentially('Hay', { delay: 20 });
  await expect.poll(() => search(page)).toBe(`?id=${seeded.folderId}&q=Hay`);
  expect(await historyLength()).toBe(start + 1);
  await expect(row(page, 'Needle Top')).toHaveCount(0);

  // A pause starts a new entry.
  await page.waitForTimeout(400);
  await titleFilter(page).press('Backspace');
  await expect.poll(() => search(page)).toBe(`?id=${seeded.folderId}&q=Ha`);
  expect(await historyLength()).toBe(start + 2);

  await page.goBack();
  await expect(titleFilter(page)).toHaveValue('Hay');
  await page.goBack();
  await expect(titleFilter(page)).toHaveValue('');
  await expect(row(page, 'Needle Top')).toBeVisible();
  await expect(breadcrumbCurrent(page)).toHaveText('E2E Url Search');
  await page.goForward();
  await expect(titleFilter(page)).toHaveValue('Hay');
  await expect(row(page, 'Needle Top')).toHaveCount(0);

  // Clearing the filters clears the address too.
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect.poll(() => search(page)).toBe(`?id=${seeded.folderId}`);
});

test('q wins over id, which keeps the folder for Current folder only', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Url Both', [
    { title: 'Inner', children: [{ title: 'Shared Name Inner', url: 'https://example.com/i' }] },
    { title: 'Shared Name Outer', url: 'https://example.com/o' },
  ]);
  await page.goto(managerUrl(extensionId, `?id=${seeded.ids.Inner}&q=Shared`));
  await expect(breadcrumbCurrent(page)).toHaveText('Inner');
  await expect(row(page, 'Shared Name Inner')).toBeVisible();
  await expect(row(page, 'Shared Name Outer')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Current folder only' }).check();
  await expect(row(page, 'Shared Name Outer')).toHaveCount(0);
  await expect(row(page, 'Shared Name Inner')).toBeVisible();
});

test("Chrome's folder UUID links open the matching folder", async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const bar = await extensionWorker.evaluate(async () => {
    const [root] = await chrome.bookmarks.getTree();
    const folder = root.children?.find((node) => node.folderType === 'bookmarks-bar');
    if (!folder) throw new Error('No bookmarks bar');
    return { id: folder.id, title: folder.title };
  });

  await page.goto(managerUrl(extensionId, '?id=0bc5d13f-2cba-5d74-951f-3f233fe6c908'));
  await expect(breadcrumbCurrent(page)).toHaveText(bar.title);
  await expect.poll(() => search(page)).toBe(`?id=${bar.id}`);
  await expect(page.getByTestId('folder-notice')).toHaveCount(0);

  await page.goto(managerUrl(extensionId, '?id=account_heading'));
  await expect(page.getByTestId('breadcrumb').locator('[aria-current="page"]')).toHaveCount(0);
  await expect.poll(() => search(page)).toBe('');

  // Any other folder's UUID cannot be resolved through the extension API.
  await page.goto(managerUrl(extensionId, '?id=5a3c2b1e-0000-4000-8000-0000000000aa'));
  await expect(page.getByTestId('folder-notice')).toContainText(
    "That folder doesn't exist anymore",
  );
});

test("Copy link to this folder copies the browser manager's address", async ({
  context,
  extensionBrowser,
  extensionId,
  extensionWorker,
  page,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  // The page replaces chrome://bookmarks in Chrome and edge://favorites in Edge.
  const base = extensionBrowser === 'msedge' ? 'edge://favorites/' : 'chrome://bookmarks/';
  const seeded = await seedFolder(extensionWorker, 'E2E Url Link', [
    { title: 'Linked Child', children: [] },
  ]);
  await page.goto(managerUrl(extensionId, `?id=${seeded.folderId}`));
  await page.getByRole('button', { name: 'Copy link to this folder' }).click();
  await expect(toastRegion(page).getByText('✓ Link copied', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `${base}?id=${seeded.folderId}`,
  );

  await row(page, 'Linked Child').getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('menuitem', { name: 'Copy link to this folder' }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(`${base}?id=${seeded.ids['Linked Child']}`);
});

test('Show in folder opens the folder of a search result with the row selected', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  // Enough rows that the result sits on the folder's second page (10 rows per page).
  const filler = Array.from({ length: 14 }, (_, index) => ({
    title: `Filler ${String(index).padStart(2, '0')}`,
    url: `https://example.com/f${index}`,
  }));
  const seeded = await seedFolder(extensionWorker, 'E2E Url Reveal', [
    { title: 'Reveal Box', children: [...filler, { title: 'Zz Target', url: 'https://t.test/' }] },
  ]);
  await page.goto(managerUrl(extensionId, '?q=Zz%20Target'));
  await expect(row(page, 'Zz Target')).toHaveCount(1);
  await row(page, 'Zz Target').getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('menuitem', { name: 'Show in folder' }).click();

  await expect(breadcrumbCurrent(page)).toHaveText('Reveal Box');
  await expect(titleFilter(page)).toHaveValue('');
  await expect.poll(() => search(page)).toBe(`?id=${seeded.ids['Reveal Box']}`);
  await expect(row(page, 'Zz Target')).toHaveAttribute('data-state', 'selected');
  await expect(row(page, 'Filler 00')).toHaveCount(0);
  await expect(page).toHaveTitle('Reveal Box - Bookmarks - Bookmark Scout');

  // The row menu of a row in the open folder has no Show in folder.
  await row(page, 'Filler 13').getByRole('button', { name: 'Open menu' }).click();
  await expect(page.getByRole('menuitem', { name: 'Edit' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Show in folder' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.goBack();
  await expect(titleFilter(page)).toHaveValue('Zz Target');
});
