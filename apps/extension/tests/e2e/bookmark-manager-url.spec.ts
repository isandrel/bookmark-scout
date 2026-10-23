/**
 * The manager's address: `?q=` search with one history entry per burst of typing, Back and
 * Forward restoring search and folder, Chrome's folder UUID links, the tab title, Copy link to
 * this folder, and Show in folder from search results.
 */
import type { Page, Worker } from '@playwright/test';
import { expect, test, toastRegion } from './fixtures';
import { currentFolderOnly, setTablePageSize } from './manager-helpers';
import { STORAGE_ITEMS, writeStored } from './storage';

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
      const folder = await chrome.bookmarks.create({
        parentId: writableRoot.id,
        title: folderTitle,
      });
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
  return page.getByRole('textbox', { name: 'Search titles, addresses, folders, and tags' });
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

test('?q= with operators round-trips through the address, Back, Forward, and reload (U32)', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Url Operators', [
    { title: 'Operator Urgent', url: 'https://docs.e2e.invalid/urgent' },
    { title: 'Operator Docs', url: 'https://docs.e2e.invalid/plain' },
    { title: 'Operator Other', url: 'https://other.e2e.invalid/other' },
  ]);
  await writeStored(extensionWorker, STORAGE_ITEMS.bookmarkMetadata, {
    [seeded.ids['Operator Urgent'] as string]: { tags: ['Urgent'] },
  });
  const queryParam = () => page.evaluate(() => new URL(window.location.href).searchParams.get('q'));
  const titleOf = new Map(Object.entries(seeded.ids).map(([title, id]) => [id, title]));
  const shown = () =>
    page
      .locator('tbody tr[data-row-id]')
      .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-row-id') ?? ''))
      .then((ids) => ids.map((id) => titleOf.get(id) ?? id).sort());

  await page.goto(managerUrl(extensionId, `?q=${encodeURIComponent('tag:urgent')}`));
  await expect(titleFilter(page)).toHaveValue('tag:urgent');
  await expect.poll(shown).toEqual(['Operator Urgent']);
  await expect(page).toHaveTitle('Search "tag:urgent" - Bookmarks - Bookmark Scout');

  // A query with a quoted phrase and an exclusion goes into the address as typed.
  const second = 'folder:"E2E Url Operators" domain:docs.e2e.invalid -tag:urgent';
  await titleFilter(page).fill(second);
  await expect.poll(queryParam).toBe(second);
  await expect.poll(shown).toEqual(['Operator Docs']);

  await page.goBack();
  await expect(titleFilter(page)).toHaveValue('tag:urgent');
  await expect.poll(queryParam).toBe('tag:urgent');
  await expect.poll(shown).toEqual(['Operator Urgent']);
  await page.goForward();
  await expect(titleFilter(page)).toHaveValue(second);
  await expect.poll(shown).toEqual(['Operator Docs']);

  // The address alone brings it back, as a link or bookmark would.
  const link = page.url();
  await page.goto(managerUrl(extensionId));
  await page.goto(link);
  await expect(titleFilter(page)).toHaveValue(second);
  await expect.poll(shown).toEqual(['Operator Docs']);
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
  // The search spans every folder, so the breadcrumb says so instead of naming the folder.
  await expect(breadcrumbCurrent(page)).toHaveText('Results from all folders');
  await expect(row(page, 'Shared Name Inner')).toBeVisible();
  await expect(row(page, 'Shared Name Outer')).toBeVisible();
  await (await currentFolderOnly(page)).check();
  await expect(row(page, 'Shared Name Outer')).toHaveCount(0);
  await expect(row(page, 'Shared Name Inner')).toBeVisible();
  await expect(breadcrumbCurrent(page)).toHaveText('Inner');
});

test('Current folder only ANDs the folder with an operator query from ?q=, and Show in folder leaves both (U32)', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Url Scope', [
    {
      title: 'Scope Box',
      children: [
        { title: 'Scope AI Here', url: 'https://here.e2e.invalid/ai' },
        { title: 'Scope Plain Here', url: 'https://here.e2e.invalid/plain' },
      ],
    },
    {
      title: 'Scope Away',
      children: [{ title: 'Scope AI Away', url: 'https://away.e2e.invalid/ai' }],
    },
  ]);
  const ids = seeded.ids as Record<string, string>;
  await writeStored(extensionWorker, STORAGE_ITEMS.bookmarkMetadata, {
    [ids['Scope AI Here'] as string]: { tags: ['ai'] },
    [ids['Scope AI Away'] as string]: { tags: ['AI', 'later'] },
  });
  const titleOf = new Map(Object.entries(ids).map(([title, id]) => [id, title]));
  const shown = () =>
    page
      .locator('tbody tr[data-row-id]')
      .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-row-id') ?? ''))
      .then((rowIds) => rowIds.map((id) => titleOf.get(id) ?? id).sort());
  const params = () =>
    page.evaluate(() => Object.fromEntries(new URL(window.location.href).searchParams));
  const box = ids['Scope Box'] as string;

  // The folder and the query come from the address; the query alone searches every folder.
  await page.goto(managerUrl(extensionId, `?id=${box}&q=${encodeURIComponent('tag:ai')}`));
  await expect(titleFilter(page)).toHaveValue('tag:ai');
  await expect.poll(shown).toEqual(['Scope AI Away', 'Scope AI Here']);
  await expect(breadcrumbCurrent(page)).toHaveText('Results from all folders');

  // Both at once: the open folder's rows that match the query, nothing from another folder, and
  // no row of the folder that does not match.
  await (await currentFolderOnly(page)).check();
  await page.keyboard.press('Escape');
  await expect.poll(shown).toEqual(['Scope AI Here']);
  await expect(breadcrumbCurrent(page)).toHaveText('Scope Box');
  expect(await params()).toEqual({ id: box, q: 'tag:ai' });
  // A row in the open folder is already in its folder.
  await row(page, 'Scope AI Here').getByRole('button', { name: 'Open menu' }).click();
  await expect(page.getByRole('menuitem', { name: 'Edit' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Show in folder' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Another operator in the same box narrows the folder's rows further, still from the address.
  await titleFilter(page).fill('tag:ai -domain:here.e2e.invalid');
  await expect.poll(params).toEqual({ id: box, q: 'tag:ai -domain:here.e2e.invalid' });
  await expect.poll(shown).toEqual([]);
  await titleFilter(page).fill('tag:ai');
  await expect.poll(shown).toEqual(['Scope AI Here']);

  // Every folder again, then Show in folder on the other folder's result.
  await (await currentFolderOnly(page)).uncheck();
  await page.keyboard.press('Escape');
  await expect.poll(shown).toEqual(['Scope AI Away', 'Scope AI Here']);
  await row(page, 'Scope AI Away').getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('menuitem', { name: 'Show in folder' }).click();
  await expect(breadcrumbCurrent(page)).toHaveText('Scope Away');
  await expect(titleFilter(page)).toHaveValue('');
  await expect.poll(params).toEqual({ id: ids['Scope Away'] });
  await expect(row(page, 'Scope AI Away')).toHaveAttribute('data-state', 'selected');

  // Back returns to the search in its folder, and the address alone brings it back after a reload.
  await page.goBack();
  await expect(titleFilter(page)).toHaveValue('tag:ai');
  await expect.poll(params).toEqual({ id: box, q: 'tag:ai' });
  await expect.poll(shown).toEqual(['Scope AI Away', 'Scope AI Here']);
  await page.reload();
  await expect(titleFilter(page)).toHaveValue('tag:ai');
  await expect.poll(shown).toEqual(['Scope AI Away', 'Scope AI Here']);
  await (await currentFolderOnly(page)).check();
  await page.keyboard.press('Escape');
  await expect.poll(shown).toEqual(['Scope AI Here']);
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
  await setTablePageSize(extensionWorker, 10);
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
