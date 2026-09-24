import type { Page, Worker } from '@playwright/test';
import { expect, test } from './fixtures';

const SETTINGS_KEY = 'bookmark-scout-settings';
const SEARCH_HISTORY_KEY = 'bookmark-scout-search-history';

type SeedItem = { title: string; url?: string; children?: SeedItem[] };

async function seedFolder(worker: Worker, title: string, items: SeedItem[]) {
  return worker.evaluate(
    async ({ folderTitle, entries }) => {
      const [root] = await chrome.bookmarks.getTree();
      const bar = root.children?.find((node) => node.children !== undefined);
      if (!bar) throw new Error('No writable bookmark root found');

      const folder = await chrome.bookmarks.create({ parentId: bar.id, title: folderTitle });
      const createItems = async (parentId: string, nodes: SeedItem[]) => {
        for (const node of nodes) {
          const created = await chrome.bookmarks.create({
            parentId,
            title: node.title,
            ...(node.url ? { url: node.url } : {}),
          });
          // Distinct creation dates make date ordering deterministic.
          await new Promise((resolve) => setTimeout(resolve, 25));
          if (node.children) await createItems(created.id, node.children);
        }
      };

      await createItems(folder.id, entries);
      return { folderId: folder.id, barId: bar.id, barTitle: bar.title };
    },
    { folderTitle: title, entries: items },
  );
}

async function setSettings(worker: Worker, updates: Record<string, unknown>) {
  await worker.evaluate(
    async ({ key, values }) => {
      const stored = await chrome.storage.sync.get(key);
      await chrome.storage.sync.set({ [key]: { ...(stored[key] ?? {}), ...values } });
    },
    { key: SETTINGS_KEY, values: updates },
  );
}

function topLevelFolders(page: Page) {
  return page.locator('.accordion-container > .accordion-item > .folder-item');
}

function folderTrigger(page: Page, title: string) {
  return page.locator('.folder-item').filter({ hasText: title }).first();
}

async function openPopup(page: Page, extensionId: string) {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.getByPlaceholder('Search bookmarks...')).toBeVisible();
}

async function visibleOrder(page: Page, titles: string[]) {
  const text = await page.locator('.accordion-container').innerText();
  return titles
    .filter((title) => text.includes(title))
    .sort((left, right) => text.indexOf(left) - text.indexOf(right));
}

test('renders permanent folders as the top level instead of the unnamed root', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Top Level', [
    { title: 'Top Level Link', url: 'https://e2e.invalid/top' },
  ]);

  await openPopup(page, extensionId);
  const topLevel = topLevelFolders(page);
  await expect(topLevel.first()).toContainText(seeded.barTitle);
  await expect(topLevel).toHaveCount(2);
  await expect(topLevel.nth(1)).toContainText(/other bookmarks/i);
  for (const text of await topLevel.allInnerTexts()) {
    expect(text.replace(/\(\d+\)/, '').trim()).not.toBe('');
  }

  await folderTrigger(page, seeded.barTitle).click();
  await expect(folderTrigger(page, 'E2E Top Level')).toBeVisible();
});

test('permanent folders hide delete but still accept new pages and folders', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E User Folder', []);
  await openPopup(page, extensionId);

  const bar = folderTrigger(page, seeded.barTitle);
  await bar.hover();
  await expect(bar.getByTitle('Delete folder')).toHaveCount(0);
  await expect(folderTrigger(page, 'Other bookmarks').getByTitle('Delete folder')).toHaveCount(0);

  await bar.getByTitle('Add current page').click();
  await expect(page.getByText('Failed to add bookmark', { exact: false })).toHaveCount(0);
  await expect
    .poll(() =>
      extensionWorker.evaluate(
        async (id) => (await chrome.bookmarks.getChildren(id)).filter((node) => node.url).length,
        seeded.barId,
      ),
    )
    .toBe(1);

  await bar.hover();
  await bar.getByTitle('Add folder').click();
  await page.getByPlaceholder('Enter folder name...').fill('Created In Bar');
  await page.getByPlaceholder('Enter folder name...').press('Enter');
  await expect
    .poll(() =>
      extensionWorker.evaluate(
        async (id) =>
          (await chrome.bookmarks.getChildren(id)).some(
            (node) => node.title === 'Created In Bar' && !node.url,
          ),
        seeded.barId,
      ),
    )
    .toBe(true);

  const userFolder = folderTrigger(page, 'E2E User Folder');
  await userFolder.hover();
  await expect(userFolder.getByTitle('Delete folder')).toBeVisible();
});

test('clearing search restores the expansion state from before the search', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Expanded Folder', [
    { title: 'Keep Visible Link', url: 'https://e2e.invalid/keep' },
  ]);
  await seedFolder(extensionWorker, 'E2E Search Target Folder', [
    { title: 'Needle Result', url: 'https://e2e.invalid/needle' },
  ]);

  await openPopup(page, extensionId);
  await folderTrigger(page, seeded.barTitle).click();
  await folderTrigger(page, 'E2E Expanded Folder').click();
  await expect(page.getByText('Keep Visible Link', { exact: true })).toBeVisible();

  const search = page.getByPlaceholder('Search bookmarks...');
  await search.fill('Needle Result');
  await expect(page.getByText('Needle Result', { exact: true })).toBeVisible();
  await expect(page.getByText('Keep Visible Link', { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page.getByText('Keep Visible Link', { exact: true })).toBeVisible();
  await expect(folderTrigger(page, 'E2E Search Target Folder')).toBeVisible();
  await expect(page.locator('.bookmark-item').filter({ hasText: 'Needle Result' })).toHaveCount(0);
});

test('groupByFolders lists folders before links under date and alphabetical order', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Grouping', [
    { title: 'Zulu Folder', children: [] },
    { title: 'Alpha Link', url: 'https://e2e.invalid/alpha' },
  ]);
  const titles = ['Zulu Folder', 'Alpha Link'];

  await setSettings(extensionWorker, { sortOrder: 'alphabetical' });
  await openPopup(page, extensionId);
  await folderTrigger(page, seeded.barTitle).click();
  await folderTrigger(page, 'E2E Grouping').click();
  await expect.poll(() => visibleOrder(page, titles)).toEqual(['Zulu Folder', 'Alpha Link']);

  await setSettings(extensionWorker, { groupByFolders: false });
  await expect.poll(() => visibleOrder(page, titles)).toEqual(['Alpha Link', 'Zulu Folder']);

  // Alpha Link is newer, so date order puts it first unless folders are grouped.
  await setSettings(extensionWorker, { sortOrder: 'date' });
  await expect.poll(() => visibleOrder(page, titles)).toEqual(['Alpha Link', 'Zulu Folder']);

  await setSettings(extensionWorker, { groupByFolders: true });
  await expect.poll(() => visibleOrder(page, titles)).toEqual(['Zulu Folder', 'Alpha Link']);
});

test('expandFoldersOnSearch opens matching folders and ancestors only when enabled', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await seedFolder(extensionWorker, 'E2E Nested Search', [
    {
      title: 'Deep Folder',
      children: [{ title: 'Deep Needle', url: 'https://e2e.invalid/deep' }],
    },
    { title: 'Matching Parent', children: [{ title: 'Plain Child', url: 'https://e2e.invalid/c' }] },
  ]);

  await openPopup(page, extensionId);
  const search = page.getByPlaceholder('Search bookmarks...');
  await search.fill('Deep Needle');
  await expect(page.getByText('Deep Needle', { exact: true })).toBeVisible();

  await search.fill('Matching Parent');
  await expect(page.getByText('Plain Child', { exact: true })).toBeVisible();

  await setSettings(extensionWorker, { expandFoldersOnSearch: false });
  await page.reload();
  await page.getByPlaceholder('Search bookmarks...').fill('Deep Needle');
  await expect(topLevelFolders(page).first()).toBeVisible();
  await expect(page.getByText('Deep Needle', { exact: true })).toHaveCount(0);
});

test('maxSearchResults limits visible matches and explains the limit', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await seedFolder(
    extensionWorker,
    'E2E Limit',
    Array.from({ length: 12 }, (_, index) => ({
      title: `Limit Item ${index + 1}`,
      url: `https://e2e.invalid/limit-${index + 1}`,
    })),
  );
  await setSettings(extensionWorker, { maxSearchResults: 10 });

  await openPopup(page, extensionId);
  await page.getByPlaceholder('Search bookmarks...').fill('Limit Item');
  await expect(page.locator('.bookmark-item')).toHaveCount(10);
  await expect(page.getByRole('status').filter({ hasText: 'first 10 of 12' })).toBeVisible();

  await setSettings(extensionWorker, { maxSearchResults: 20 });
  await expect(page.locator('.bookmark-item')).toHaveCount(12);
  await expect(page.getByText('first 10 of 12', { exact: false })).toHaveCount(0);
});

test('search history records, reuses, clears, and respects the setting', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await seedFolder(extensionWorker, 'E2E History', [
    { title: 'History Target', url: 'https://e2e.invalid/history' },
  ]);
  const storedHistory = () =>
    extensionWorker.evaluate(
      async (key) => (await chrome.storage.local.get(key))[key] as string[] | undefined,
      SEARCH_HISTORY_KEY,
    );

  await openPopup(page, extensionId);
  const search = page.getByPlaceholder('Search bookmarks...');
  await search.fill('History Target');
  await search.press('Enter');
  await expect.poll(storedHistory).toEqual(['History Target']);

  await search.fill('');
  const historyList = page.getByTestId('search-history');
  await expect(historyList).toContainText('Recent searches');
  await historyList.getByRole('option', { name: 'History Target' }).click();
  await expect(search).toHaveValue('History Target');
  await expect(page.getByText('History Target', { exact: true })).toBeVisible();

  await search.fill('');
  await historyList.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(historyList).toHaveCount(0);
  await expect.poll(storedHistory).toBeUndefined();

  await search.fill('Second Query');
  await search.press('Enter');
  await expect.poll(storedHistory).toEqual(['Second Query']);

  await setSettings(extensionWorker, { searchHistory: false });
  await expect.poll(storedHistory).toBeUndefined();
  await search.fill('Untracked Query');
  await search.press('Enter');
  await search.fill('');
  await expect(historyList).toHaveCount(0);
  expect(await storedHistory()).toBeUndefined();
});
