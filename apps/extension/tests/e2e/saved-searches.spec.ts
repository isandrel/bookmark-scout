import type { Page, Worker } from '@playwright/test';
import { expect, test, toastRegion } from './fixtures';

type SeedItem = { title: string; url?: string };

const STORAGE_KEY = 'bookmark-scout-saved-searches';

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

function readStored(worker: Worker) {
  return worker.evaluate(async (key) => {
    const local = await chrome.storage.local.get(key);
    const sync = await chrome.storage.sync.get(key);
    return { local: local[key] as unknown, sync: sync[key] as unknown };
  }, STORAGE_KEY);
}

async function writeStored(worker: Worker, value: unknown) {
  await worker.evaluate(async ({ key, stored }) => chrome.storage.local.set({ [key]: stored }), {
    key: STORAGE_KEY,
    stored: value,
  });
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

  await page.getByPlaceholder('Filter titles...').fill('Saved');
  await page.getByPlaceholder('Filter URLs...').fill('docs.e2e.invalid');
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
  const stored = await readStored(extensionWorker);
  expect(stored.sync).toBeUndefined();
  expect(stored.local).toEqual({
    version: 1,
    searches: [
      {
        id: expect.any(String),
        createdAt: expect.any(Number),
        name: 'Docs pages',
        query: {
          filters: { title: 'Saved', url: 'docs.e2e.invalid' },
          sorting: [{ id: 'title', desc: true }],
        },
      },
    ],
  });
  const storedText = JSON.stringify(stored.local);
  await page.keyboard.press('Escape');

  // Clear everything, reload, and reopen the saved search.
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.reload();
  await expect(page.getByPlaceholder('Filter titles...')).toHaveValue('');
  menu = await openSavedSearches(page);
  await menu.getByRole('button', { name: 'Docs pages', exact: true }).click();
  await expect(menu).toHaveCount(0);
  await expect(page.getByPlaceholder('Filter titles...')).toHaveValue('Saved');
  await expect(page.getByPlaceholder('Filter URLs...')).toHaveValue('docs.e2e.invalid');
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
  expect(JSON.stringify((await readStored(extensionWorker)).local)).toBe(storedText);
});

test('renames and deletes saved searches from the keyboard, with undo', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await writeStored(extensionWorker, {
    version: 1,
    searches: [
      storedSearch('alpha', 'Alpha', { filters: { title: 'alpha' }, sorting: [] }),
      storedSearch('beta', 'Beta', { filters: { title: 'beta' }, sorting: [] }),
    ],
  });
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
      const stored = (await readStored(extensionWorker)).local as { searches: { name: string }[] };
      return stored.searches.map((search) => search.name);
    })
    .toEqual(['Alpha renamed', 'Beta']);

  // Delete, then undo from the toast.
  await menu.getByRole('button', { name: 'Delete "Beta"' }).click();
  await expect(menu.getByRole('button', { name: 'Beta', exact: true })).toHaveCount(0);
  await expect
    .poll(
      async () => ((await readStored(extensionWorker)).local as { searches: unknown[] }).searches,
    )
    .toHaveLength(1);
  const toasts = toastRegion(page);
  await expect(toasts.getByText('✓ Deleted saved search "Beta"', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await toasts.getByRole('button', { name: 'Undo' }).click();
  await expect
    .poll(async () => {
      const stored = (await readStored(extensionWorker)).local as { searches: { id: string }[] };
      return stored.searches.map((search) => search.id);
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

  await page.getByPlaceholder('Filter titles...').fill('Scoped');
  await page.getByRole('checkbox', { name: 'Current folder only' }).check();
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
  await expect(page).toHaveURL(new RegExp(`id=${work.folderId}$`));
  await expect(page.getByRole('checkbox', { name: 'Current folder only' })).toBeChecked();
  await expect(rows(page)).toHaveCount(1);
  await expect(row(page, 'Scoped Report')).toBeVisible();

  // A search naming a deleted folder (scope and folder filter) skips those folders and says so.
  await writeStored(extensionWorker, {
    version: 1,
    searches: [
      storedSearch('stale', 'Stale folders', {
        filters: { title: 'Scoped', parentId: [home.folderId, 'missing-folder-id'] },
        sorting: [],
        folderId: 'missing-scope-id',
      }),
    ],
  });
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
  await expect(page).toHaveURL(new RegExp(`id=${work.folderId}$`));
  await expect(page.getByRole('checkbox', { name: 'Current folder only' })).not.toBeChecked();
  await expect(rows(page)).toHaveCount(1);
  await expect(row(page, 'Scoped Recipe')).toBeVisible();

  // Deleting the folder of a scoped search makes it fall back the same way.
  await extensionWorker.evaluate(async (id) => chrome.bookmarks.removeTree(id), work.folderId);
  // The manager was showing that folder; it moves to the nearest folder that still exists.
  await expect(page.getByTestId('folder-notice')).toContainText(
    "That folder doesn't exist anymore.",
  );
  await writeStored(extensionWorker, {
    version: 1,
    searches: [
      storedSearch('scoped', 'Work only', {
        filters: { title: 'Scoped', type: ['link'] },
        sorting: [],
        folderId: work.folderId,
      }),
    ],
  });
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
  await expect(page.getByRole('checkbox', { name: 'Current folder only' })).not.toBeChecked();
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
  await writeStored(extensionWorker, {
    version: 1,
    searches: [
      { id: 5 },
      'not a search',
      storedSearch('bad-query', 'Bad query', { filters: { title: 42 } }),
      storedSearch('good', hostileName, { filters: { title: 'Survivor' }, sorting: [] }),
    ],
  });
  await page.goto(managerUrl(extensionId));
  await expect(page.getByPlaceholder('Filter titles...')).toBeVisible();

  let menu = await openSavedSearches(page);
  await expect(menu.getByRole('listitem')).toHaveCount(1);
  await expect(menu.getByRole('button', { name: hostileName, exact: true })).toBeVisible();
  await menu.getByRole('button', { name: hostileName, exact: true }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(row(page, 'Malformed Survivor')).toBeVisible();

  // A payload that is not an object at all reads as empty; saving replaces it.
  await writeStored(extensionWorker, 'corrupted');
  await page.reload();
  await expect(page.getByPlaceholder('Filter titles...')).toBeVisible();
  await page.getByPlaceholder('Filter titles...').fill('Survivor');
  menu = await openSavedSearches(page);
  await expect(menu).toContainText('No saved searches yet.');
  await menu.getByLabel('Name for the current search').fill('Recovered');
  await page.keyboard.press('Enter');
  await expect(menu.getByRole('button', { name: 'Recovered', exact: true })).toBeVisible();
  expect((await readStored(extensionWorker)).local).toMatchObject({
    version: 1,
    searches: [{ name: 'Recovered', query: { filters: { title: 'Survivor' } } }],
  });
});
