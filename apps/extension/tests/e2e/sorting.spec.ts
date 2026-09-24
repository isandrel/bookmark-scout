import type { Page, Worker } from '@playwright/test';
import { expect, test } from './fixtures';

const SETTINGS_KEY = 'bookmark-scout-settings';
const TABLE_VIEW_KEY = 'bookmark-scout-table-view';

const titles = {
  testFolder: 'Sorting Test Root',
  link10: 'Item 10',
  folderZulu: 'Zulu Folder',
  link2: 'item 2',
  folderAlpha: 'Alpha Folder',
} as const;

type SortOrder = 'date' | 'alphabetical' | 'folders';

type BookmarkFixture = {
  folderId: string;
  originalOrder: string[];
};

async function seedBookmarks(worker: Worker): Promise<BookmarkFixture> {
  return worker.evaluate(async (fixtureTitles) => {
    const [root] = await chrome.bookmarks.getTree();
    const parent = root.children?.find((node) => node.children !== undefined);

    if (!parent) {
      throw new Error('No writable bookmark root found');
    }

    const testFolder = await chrome.bookmarks.create({
      parentId: parent.id,
      title: fixtureTitles.testFolder,
    });

    const createdTitles: string[] = [];
    const createWithDistinctDate = async (details: chrome.bookmarks.CreateDetails) => {
      const bookmark = await chrome.bookmarks.create(details);
      createdTitles.push(bookmark.title);
      await new Promise((resolve) => setTimeout(resolve, 25));
    };

    await createWithDistinctDate({
      parentId: testFolder.id,
      title: fixtureTitles.link10,
      url: 'https://example.com/item-10',
    });
    await createWithDistinctDate({
      parentId: testFolder.id,
      title: fixtureTitles.folderZulu,
    });
    await createWithDistinctDate({
      parentId: testFolder.id,
      title: fixtureTitles.link2,
      url: 'https://example.com/item-2',
    });
    await createWithDistinctDate({
      parentId: testFolder.id,
      title: fixtureTitles.folderAlpha,
    });

    return {
      folderId: testFolder.id,
      originalOrder: createdTitles,
    };
  }, titles);
}

async function setSortOrder(worker: Worker, sortOrder: SortOrder) {
  await worker.evaluate(
    async ({ key, order }) => {
      const stored = await chrome.storage.sync.get(key);
      await chrome.storage.sync.set({
        [key]: {
          ...(stored[key] ?? {}),
          sortOrder: order,
        },
      });
    },
    { key: SETTINGS_KEY, order: sortOrder },
  );
}

async function expectTableOrder(page: Page, expectedTitles: string[]) {
  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(expectedTitles.length);

  for (const [index, title] of expectedTitles.entries()) {
    await expect(rows.nth(index)).toContainText(title);
  }
}

test('sorts the bookmarks table without changing persisted browser order', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const fixture = await seedBookmarks(extensionWorker);
  const bookmarksUrl = `chrome-extension://${extensionId}/bookmarks.html?id=${fixture.folderId}`;

  await setSortOrder(extensionWorker, 'alphabetical');
  await page.goto(bookmarksUrl);
  await expectTableOrder(page, [
    titles.folderAlpha,
    titles.link2,
    titles.link10,
    titles.folderZulu,
  ]);

  await setSortOrder(extensionWorker, 'folders');
  await page.reload();
  await expectTableOrder(page, [
    titles.folderZulu,
    titles.folderAlpha,
    titles.link10,
    titles.link2,
  ]);

  await setSortOrder(extensionWorker, 'date');
  await page.reload();
  await expectTableOrder(page, [
    titles.folderAlpha,
    titles.link2,
    titles.folderZulu,
    titles.link10,
  ]);

  const persistedOrder = await extensionWorker.evaluate(async (folderId) => {
    const children = await chrome.bookmarks.getChildren(folderId);
    return children.map((bookmark) => bookmark.title);
  }, fixture.folderId);
  expect(persistedOrder).toEqual(fixture.originalOrder);
});

test('applies an Options UI sorting change to an open bookmarks table', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  const fixture = await seedBookmarks(extensionWorker);
  const bookmarksUrl = `chrome-extension://${extensionId}/bookmarks.html?id=${fixture.folderId}`;

  await setSortOrder(extensionWorker, 'date');
  await page.goto(bookmarksUrl);
  await expectTableOrder(page, [
    titles.folderAlpha,
    titles.link2,
    titles.folderZulu,
    titles.link10,
  ]);

  const optionsPage = await context.newPage();
  await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);
  await optionsPage.getByRole('tab', { name: 'Behavior' }).click();

  const sortSetting = optionsPage
    .getByText('Sort Order', { exact: true })
    .locator('..')
    .locator('..')
    .locator('..');
  await sortSetting.getByRole('combobox').click();
  await optionsPage.getByRole('option', { name: 'Alphabetical' }).click();

  await expect
    .poll(() =>
      extensionWorker.evaluate(async (key) => {
        const stored = await chrome.storage.sync.get(key);
        const settings = stored[key] as { sortOrder?: string } | undefined;
        return settings?.sortOrder;
      }, SETTINGS_KEY),
    )
    .toBe('alphabetical');
  await expectTableOrder(page, [
    titles.folderAlpha,
    titles.link2,
    titles.link10,
    titles.folderZulu,
  ]);
});

test('saves, restores, and resets the bookmark table view without reordering bookmarks', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const fixture = await seedBookmarks(extensionWorker);
  const bookmarksUrl = `chrome-extension://${extensionId}/bookmarks.html?id=${fixture.folderId}`;

  await page.goto(bookmarksUrl);
  await page.getByRole('button', { name: 'Customize table view' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'url' }).click();
  // Visible columns skip hidden ones: Title passes Folder Path and Type, then stops first.
  for (let index = 0; index < 2; index += 1) {
    await page.getByRole('button', { name: 'Move title left' }).click();
  }
  await expect(page.getByRole('button', { name: 'Move title left' })).toBeDisabled();

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Title' }).click();

  const pageSizeControl = page.getByText('Rows per page').locator('..').getByRole('combobox');
  await pageSizeControl.click();
  await page.getByRole('option', { name: '20' }).click();

  await expect
    .poll(() =>
      extensionWorker.evaluate(async (key) => {
        const stored = await chrome.storage.sync.get(key);
        return stored[key];
      }, TABLE_VIEW_KEY),
    )
    .toMatchObject({
      version: 1,
      columnVisibility: { url: false },
      pageSize: 20,
      sorting: [{ id: 'title', desc: false }],
    });

  await page.reload();
  const headers = page.locator('thead th');
  await expect(page.getByRole('columnheader', { name: 'URL' })).toHaveCount(0);
  await expect(headers.nth(1)).toContainText('Title');
  await expect(pageSizeControl).toHaveText('20');
  await expectTableOrder(page, [
    titles.folderAlpha,
    titles.link2,
    titles.link10,
    titles.folderZulu,
  ]);

  const persistedOrder = await extensionWorker.evaluate(async (folderId) => {
    const children = await chrome.bookmarks.getChildren(folderId);
    return children.map((bookmark) => bookmark.title);
  }, fixture.folderId);
  expect(persistedOrder).toEqual(fixture.originalOrder);

  await page.getByRole('button', { name: 'Customize table view' }).click();
  await page.getByRole('button', { name: 'Reset view' }).click();
  await expect
    .poll(() =>
      extensionWorker.evaluate(async (key) => {
        const stored = await chrome.storage.sync.get(key);
        return stored[key];
      }, TABLE_VIEW_KEY),
    )
    .toMatchObject({
      version: 1,
      pageSize: 10,
      sorting: [],
      columnVisibility: {
        id: false,
        parentId: false,
        dateGroupModified: false,
        unmodifiable: false,
      },
    });

  await page.reload();
  await expect(page.getByRole('columnheader', { name: 'URL' })).toBeVisible();
  await expect(pageSizeControl).toHaveText('10');
  await page.getByRole('button', { name: 'Customize table view' }).click();
  await expect(page.getByRole('menuitemcheckbox', { name: 'url' })).toBeChecked();
});
