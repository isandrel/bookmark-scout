import type { Page, Worker } from '@playwright/test';
import { storageAreaKey } from '../../src/lib/storage/registry';
import { expect, test, toastRegion } from './fixtures';
import { addressFilter, currentFolderOnly } from './manager-helpers';
import { readStored, STORAGE_ITEMS, writeStored } from './storage';

type SeedItem = { title: string; url?: string };

const SAVED_SEARCHES = STORAGE_ITEMS.savedSearches;

async function seedFolder(worker: Worker, title: string, items: SeedItem[]) {
  return worker.evaluate(
    async ({ folderTitle, entries }) => {
      const [root] = await chrome.bookmarks.getTree();
      const writableRoot = root.children?.find((node) => node.children !== undefined);
      if (!writableRoot) throw new Error('No writable bookmark root found');
      const folder = await chrome.bookmarks.create({
        parentId: writableRoot.id,
        title: folderTitle,
      });
      const ids: Record<string, string> = {};
      for (const entry of entries) {
        const created = await chrome.bookmarks.create({
          parentId: folder.id,
          title: entry.title,
          ...(entry.url ? { url: entry.url } : {}),
        });
        ids[entry.title] = created.id;
      }
      return { folderId: folder.id, ids };
    },
    { folderTitle: title, entries: items },
  );
}

/** The stored saved searches, and whatever sync storage holds under the same key name. */
async function readSavedSearches(worker: Worker) {
  const sync = await worker.evaluate(
    async (key) => (await chrome.storage.sync.get(key))[key] as unknown,
    storageAreaKey(SAVED_SEARCHES),
  );
  return { local: await readStored(worker, SAVED_SEARCHES), sync };
}

async function writeSavedSearches(worker: Worker, value: unknown) {
  await writeStored(worker, SAVED_SEARCHES, value);
}

const storedSearch = (id: string, name: string, query: unknown) => ({
  id,
  name,
  createdAt: 1,
  query,
});

function managerUrl(extensionId: string, folderId?: string) {
  const base = `chrome-extension://${extensionId}/bookmarks.html`;
  return folderId ? `${base}?id=${folderId}` : base;
}

const rows = (page: Page) => page.locator('tbody tr');
const row = (page: Page, title: string) => rows(page).filter({ hasText: title });
const savedSearchesButton = (page: Page) =>
  page.getByTestId('bookmark-table-toolbar').getByRole('button', { name: 'Saved searches' });
const savedSearchesMenu = (page: Page) => page.getByRole('dialog', { name: 'Saved searches' });

async function openSavedSearches(page: Page) {
  await savedSearchesButton(page).click();
  await expect(savedSearchesMenu(page)).toBeVisible();
  return savedSearchesMenu(page);
}

async function rowTitles(page: Page) {
  return (await rows(page).allTextContents()).map((text) => text.trim());
}

test.use({ viewport: { width: 1400, height: 900 } });

test('saves the current search, reopens it after a reload, and follows bookmark changes', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const docs = await seedFolder(extensionWorker, 'E2E Saved Docs', [
    { title: 'Saved Alpha Docs', url: 'https://docs.e2e.invalid/alpha' },
    { title: 'Saved Beta Docs', url: 'https://docs.e2e.invalid/beta' },
    { title: 'Saved Gamma Docs', url: 'https://blog.e2e.invalid/gamma' },
  ]);
  await seedFolder(extensionWorker, 'E2E Saved Other', [
    { title: 'Saved Delta Docs', url: 'https://docs.e2e.invalid/delta' },
  ]);
  await page.goto(managerUrl(extensionId));

  // Nothing filtered yet: there is nothing to save.
  let menu = await openSavedSearches(page);
  await expect(menu).toContainText('No saved searches yet.');
  await expect(menu.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');

  await page.getByPlaceholder('Search titles, addresses, folders, and tags').fill('Saved');
  await (await addressFilter(page)).fill('docs.e2e.invalid');
  await page.getByRole('button', { name: 'Title', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Desc' }).click();
  await expect
    .poll(() => rowTitles(page))
    .toEqual([
      expect.stringContaining('Saved Delta Docs'),
      expect.stringContaining('Saved Beta Docs'),
      expect.stringContaining('Saved Alpha Docs'),
    ]);

  menu = await openSavedSearches(page);
  await expect(menu.getByLabel('Name for the current search')).toBeFocused();
  await page.keyboard.type('Docs pages');
  await page.keyboard.press('Enter');
  await expect(
    toastRegion(page).getByText('✓ Saved search "Docs pages"', { exact: true }),
  ).toBeVisible();
  const savedEntry = menu.getByRole('button', { name: 'Docs pages', exact: true });
  await expect(savedEntry).toHaveAttribute('aria-current', 'true');

  // Only the query is stored, on this device: nothing about the matching bookmarks.
  const stored = await readSavedSearches(extensionWorker);
  expect(stored.sync).toBeUndefined();
  expect(stored.local).toEqual([
    {
      id: expect.any(String),
      createdAt: expect.any(Number),
      name: 'Docs pages',
      query: {
        filters: { title: 'Saved', url: 'docs.e2e.invalid' },
        syntaxVersion: 2,
        sorting: [{ id: 'title', desc: true }],
      },
    },
  ]);
  const storedText = JSON.stringify(stored.local);
  await page.keyboard.press('Escape');

  // Clear everything, reload, and reopen the saved search.
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.reload();
  await expect(page.getByPlaceholder('Search titles, addresses, folders, and tags')).toHaveValue(
    '',
  );
  menu = await openSavedSearches(page);
  await menu.getByRole('button', { name: 'Docs pages', exact: true }).click();
  await expect(menu).toHaveCount(0);
  await expect(page.getByPlaceholder('Search titles, addresses, folders, and tags')).toHaveValue(
    'Saved',
  );
  await expect(await addressFilter(page)).toHaveValue('docs.e2e.invalid');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Title, sorted descending' })).toBeVisible();
  await expect
    .poll(() => rowTitles(page))
    .toEqual([
      expect.stringContaining('Saved Delta Docs'),
      expect.stringContaining('Saved Beta Docs'),
      expect.stringContaining('Saved Alpha Docs'),
    ]);
  await expect(savedSearchesButton(page)).toBeVisible();

  // Results are evaluated live: new matches appear and deleted bookmarks disappear.
  await extensionWorker.evaluate(
    async (parentId) =>
      chrome.bookmarks.create({
        parentId,
        title: 'Saved Epsilon Docs',
        url: 'https://docs.e2e.invalid/epsilon',
      }),
    docs.folderId,
  );
  await extensionWorker.evaluate(
    async (id) => chrome.bookmarks.remove(id),
    docs.ids['Saved Beta Docs'],
  );
  await expect
    .poll(() => rowTitles(page))
    .toEqual([
      expect.stringContaining('Saved Epsilon Docs'),
      expect.stringContaining('Saved Delta Docs'),
      expect.stringContaining('Saved Alpha Docs'),
    ]);
  await expect(row(page, 'Saved Gamma Docs')).toHaveCount(0);
  expect(JSON.stringify((await readSavedSearches(extensionWorker)).local)).toBe(storedText);
});

test('the search box reads operators and tags, and old saved searches find what they found', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Query Work', [
    { title: 'Query Guide', url: 'https://docs.e2e.invalid/guide' },
    { title: 'Query Notes', url: 'https://notes.e2e.invalid/notes' },
    { title: 'Query Plain', url: 'https://other.e2e.invalid/docs-only' },
  ]);
  await writeStored(extensionWorker, STORAGE_ITEMS.bookmarkMetadata, {
    [seeded.ids['Query Notes'] as string]: { tags: ['reading'] },
  });
  const search = page.getByPlaceholder('Search titles, addresses, folders, and tags');

  // `?q=` opens the manager on a query in the search query language.
  await page.goto(`${managerUrl(extensionId)}?q=${encodeURIComponent('tag:reading')}`);
  await expect(search).toHaveValue('tag:reading');
  await expect.poll(() => rowTitles(page)).toEqual([expect.stringContaining('Query Notes')]);

  // Every word must match, each anywhere: the folder path counts with the title.
  await search.fill('query work guide');
  await expect.poll(() => rowTitles(page)).toEqual([expect.stringContaining('Query Guide')]);
  await search.fill('domain:docs.e2e.invalid');
  await expect.poll(() => rowTitles(page)).toEqual([expect.stringContaining('Query Guide')]);
  // A word naming a folder lists the folder; `folder:` lists what is in it.
  await search.fill('folder:"E2E Query Work" -is:untagged');
  await expect.poll(() => rowTitles(page)).toEqual([expect.stringContaining('Query Notes')]);
  // The address follows the query, for Back and for links.
  await expect
    .poll(() => new URL(page.url()).searchParams.get('q'))
    .toBe('folder:"E2E Query Work" -is:untagged');

  // A search saved before the search query language matched its text in titles and addresses.
  // It still finds a bookmark whose address alone has the text, and a colon stays text.
  await writeSavedSearches(extensionWorker, [
    storedSearch('old', 'Old docs', { filters: { title: 'docs' }, sorting: [] }),
    storedSearch('colon', 'Old colon', { filters: { title: 'tag:reading' }, sorting: [] }),
  ]);
  await page.reload();
  let menu = await openSavedSearches(page);
  await menu.getByRole('button', { name: 'Old docs', exact: true }).click();
  await expect(search).toHaveValue('docs');
  await expect
    .poll(async () => (await rowTitles(page)).sort())
    .toEqual([expect.stringContaining('Query Guide'), expect.stringContaining('Query Plain')]);
  menu = await openSavedSearches(page);
  await menu.getByRole('button', { name: 'Old colon', exact: true }).click();
  await expect(search).toHaveValue('"tag:reading"');
  await expect(rows(page).filter({ hasText: 'Query' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  // Opening it rewrote nothing.
  expect((await readSavedSearches(extensionWorker)).local).toEqual([
    storedSearch('old', 'Old docs', { filters: { title: 'docs' }, sorting: [] }),
    storedSearch('colon', 'Old colon', { filters: { title: 'tag:reading' }, sorting: [] }),
  ]);
});

test('renames and deletes saved searches from the keyboard, with undo', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await writeSavedSearches(extensionWorker, [
    storedSearch('alpha', 'Alpha', { filters: { title: 'alpha' }, sorting: [] }),
    storedSearch('beta', 'Beta', { filters: { title: 'beta' }, sorting: [] }),
  ]);
  await page.goto(managerUrl(extensionId));
  await expect(savedSearchesButton(page)).toHaveAttribute('aria-keyshortcuts', 's');

  // `?` lists the shortcut, and `s` opens the menu.
  await page.keyboard.press('Shift+?');
  const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(help).toContainText('Open saved searches');
  await page.keyboard.press('Escape');
  await expect(help).toHaveCount(0);
  await page.keyboard.press('s');
  const menu = savedSearchesMenu(page);
  await expect(menu).toBeVisible();
  // Typing `s` in the name field is text, not the shortcut.
  await page.keyboard.type('ss');
  await expect(menu.getByLabel('Name for the current search')).toHaveValue('ss');

  // Rename: a name in use is refused, Escape cancels without closing the menu, Enter saves.
  await menu.getByRole('button', { name: 'Rename "Alpha"' }).click();
  const renameInput = menu.getByLabel('New name for "Alpha"');
  await expect(renameInput).toBeFocused();
  await renameInput.fill('beta');
  await renameInput.press('Enter');
  await expect(menu.getByRole('alert')).toHaveText('A saved search with this name already exists.');
  await renameInput.press('Escape');
  await expect(renameInput).toHaveCount(0);
  await expect(menu).toBeVisible();
  await menu.getByRole('button', { name: 'Rename "Alpha"' }).click();
  await menu.getByLabel('New name for "Alpha"').fill('Alpha renamed');
  await page.keyboard.press('Enter');
  await expect(menu.getByRole('button', { name: 'Alpha renamed', exact: true })).toBeVisible();
  await expect
    .poll(async () => {
      const stored = (await readSavedSearches(extensionWorker)).local as { name: string }[];
      return stored.map((search) => search.name);
    })
    .toEqual(['Alpha renamed', 'Beta']);

  // Delete, then undo from the toast.
  await menu.getByRole('button', { name: 'Delete "Beta"' }).click();
  await expect(menu.getByRole('button', { name: 'Beta', exact: true })).toHaveCount(0);
  await expect
    .poll(async () => (await readSavedSearches(extensionWorker)).local as unknown[])
    .toHaveLength(1);
  const toasts = toastRegion(page);
  await expect(toasts.getByText('✓ Deleted saved search "Beta"', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await toasts.getByRole('button', { name: 'Undo' }).click();
  await expect
    .poll(async () => {
      const stored = (await readSavedSearches(extensionWorker)).local as { id: string }[];
      return stored.map((search) => search.id);
    })
    .toEqual(['alpha', 'beta']);
  const reopened = await openSavedSearches(page);
  await expect(reopened.getByRole('button', { name: 'Beta', exact: true })).toBeVisible();
});

test('a folder-scoped search reopens its folder, and stale folder IDs are skipped', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const work = await seedFolder(extensionWorker, 'E2E Scoped Work', [
    { title: 'Scoped Report', url: 'https://work.e2e.invalid/report' },
  ]);
  const home = await seedFolder(extensionWorker, 'E2E Scoped Home', [
    { title: 'Scoped Recipe', url: 'https://home.e2e.invalid/recipe' },
  ]);
  await page.goto(managerUrl(extensionId, work.folderId));

  await page.getByPlaceholder('Search titles, addresses, folders, and tags').fill('Scoped');
  await (await currentFolderOnly(page)).check();
  await expect(rows(page)).toHaveCount(1);
  let menu = await openSavedSearches(page);
  await menu.getByLabel('Name for the current search').fill('Work only');
  await menu.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(menu.getByRole('button', { name: 'Work only', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  // From another folder, the saved search returns to its folder with the scope on.
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.goto(managerUrl(extensionId, home.folderId));
  menu = await openSavedSearches(page);
  await menu.getByRole('button', { name: 'Work only', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`id=${work.folderId}&q=Scoped$`));
  await expect(await currentFolderOnly(page)).toBeChecked();
  await expect(rows(page)).toHaveCount(1);
  await expect(row(page, 'Scoped Report')).toBeVisible();

  // A search naming a deleted folder (scope and folder filter) skips those folders and says so.
  await writeSavedSearches(extensionWorker, [
    storedSearch('stale', 'Stale folders', {
      filters: { title: 'Scoped', parentId: [home.folderId, 'missing-folder-id'] },
      sorting: [],
      folderId: 'missing-scope-id',
    }),
  ]);
  menu = await openSavedSearches(page);
  await menu.getByRole('button', { name: 'Stale folders', exact: true }).click();
  const toasts = toastRegion(page);
  await expect(toasts.getByText('Some folders no longer exist', { exact: true })).toBeVisible();
  await expect(
    toasts.getByText(
      'Folders skipped because they were deleted: 2. The other filters still apply.',
      { exact: true },
    ),
  ).toBeVisible();
  // The scope is dropped, so the remaining folder filter searches all bookmarks.
  await expect(page).toHaveURL(new RegExp(`id=${work.folderId}&q=Scoped$`));
  await expect(await currentFolderOnly(page)).not.toBeChecked();
  await expect(rows(page)).toHaveCount(1);
  await expect(row(page, 'Scoped Recipe')).toBeVisible();

  // Deleting the folder of a scoped search makes it fall back the same way.
  await extensionWorker.evaluate(async (id) => chrome.bookmarks.removeTree(id), work.folderId);
  // The manager was showing that folder; it moves to the nearest folder that still exists.
  await expect(page.getByTestId('folder-notice')).toContainText(
    "That folder doesn't exist anymore.",
  );
  await writeSavedSearches(extensionWorker, [
    storedSearch('scoped', 'Work only', {
      filters: { title: 'Scoped', type: ['link'] },
      sorting: [],
      folderId: work.folderId,
    }),
  ]);
  menu = await openSavedSearches(page);
  await menu.getByRole('button', { name: 'Work only', exact: true }).click();
  await expect(
    toasts.getByText(
      'Folders skipped because they were deleted: 1. The other filters still apply.',
      {
        exact: true,
      },
    ),
  ).toBeVisible();
  // The deleted folder's bookmark is gone, so only the other folder's link matches.
  await expect(await currentFolderOnly(page)).not.toBeChecked();
  await expect(rows(page)).toHaveCount(1);
  await expect(row(page, 'Scoped Recipe')).toBeVisible();
});

test('malformed saved searches are ignored and never break the manager', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await seedFolder(extensionWorker, 'E2E Malformed Saved', [
    { title: 'Malformed Survivor', url: 'https://survivor.e2e.invalid/' },
  ]);
  const hostileName = '<img src=x onerror=alert(1)><style>*{display:none}</style>';
  await writeSavedSearches(extensionWorker, [
    { id: 5 },
    'not a search',
    storedSearch('bad-query', 'Bad query', { filters: { title: 42 } }),
    storedSearch('good', hostileName, { filters: { title: 'Survivor' }, sorting: [] }),
  ]);
  await page.goto(managerUrl(extensionId));
  await expect(page.getByPlaceholder('Search titles, addresses, folders, and tags')).toBeVisible();

  let menu = await openSavedSearches(page);
  await expect(menu.getByRole('listitem')).toHaveCount(1);
  await expect(menu.getByRole('button', { name: hostileName, exact: true })).toBeVisible();
  await menu.getByRole('button', { name: hostileName, exact: true }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(row(page, 'Malformed Survivor')).toBeVisible();

  // A payload that is not a list at all reads as empty; saving replaces it.
  await writeSavedSearches(extensionWorker, 'corrupted');
  await page.reload();
  await expect(page.getByPlaceholder('Search titles, addresses, folders, and tags')).toBeVisible();
  await page.getByPlaceholder('Search titles, addresses, folders, and tags').fill('Survivor');
  menu = await openSavedSearches(page);
  await expect(menu).toContainText('No saved searches yet.');
  await menu.getByLabel('Name for the current search').fill('Recovered');
  await page.keyboard.press('Enter');
  await expect(menu.getByRole('button', { name: 'Recovered', exact: true })).toBeVisible();
  expect((await readSavedSearches(extensionWorker)).local).toMatchObject([
    { name: 'Recovered', query: { filters: { title: 'Survivor' } } },
  ]);
});

test('saved searches reorder from each handle menu, and the order is stored', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const query = { filters: { title: 'alpha' }, sorting: [] };
  await writeSavedSearches(extensionWorker, [
    storedSearch('one', 'First search', query),
    storedSearch('two', 'Second search', query),
  ]);
  await page.goto(managerUrl(extensionId));
  const menu = await openSavedSearches(page);
  const names = () => menu.getByRole('list').locator('li').allTextContents();

  await menu.getByRole('button', { name: 'Reorder Second search' }).click();
  await page.getByRole('menuitem', { name: 'Move to top' }).click();
  // The popover stays open, so several moves can follow one another.
  await expect(menu).toBeVisible();
  await expect
    .poll(async () => (await names()).map((text) => text.trim()))
    .toEqual(['Second search', 'First search']);
  await expect
    .poll(async () => (await readSavedSearches(extensionWorker)).local)
    .toEqual([expect.objectContaining({ id: 'two' }), expect.objectContaining({ id: 'one' })]);
});
