import { readFile } from 'node:fs/promises';
import type { Locator, Page, Worker } from '@playwright/test';
import { expect, test } from './fixtures';

type SeedItem = { title: string; url?: string; children?: SeedItem[] };

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

      const createItems = async (parentId: string, nodes: SeedItem[]) => {
        for (const node of nodes) {
          const created = await chrome.bookmarks.create({
            parentId,
            title: node.title,
            ...(node.url ? { url: node.url } : {}),
          });
          ids[node.title] = created.id;
          if (node.children) await createItems(created.id, node.children);
        }
      };

      await createItems(folder.id, entries);
      return { folderId: folder.id, ids };
    },
    { folderTitle: title, entries: items },
  );
}

function bookmarkPageUrl(extensionId: string, folderId: string) {
  return `chrome-extension://${extensionId}/bookmarks.html?id=${folderId}`;
}

function toolCard(page: Page, title: string): Locator {
  return page
    .getByRole('heading', { name: title, exact: true })
    .locator('..')
    .locator('..')
    .locator('..')
    .locator('..');
}

test('opens the popup and finds a bookmark through search', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await seedFolder(extensionWorker, 'E2E Popup', [
    { title: 'Popup Match', url: 'https://example.com/popup-match' },
    { title: 'Different Link', url: 'https://example.com/different' },
  ]);

  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  const search = page.getByPlaceholder('Search bookmarks...');
  await expect(search).toBeVisible();
  await search.fill('Popup Match');
  await expect(page.getByText('Popup Match', { exact: true })).toBeVisible();
  await expect(page.getByText('Different Link', { exact: true })).toHaveCount(0);
});

test('updates popup ordering from synced settings and creates a folder', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'E2E Popup Actions', [
    { title: 'Zulu Link', url: 'https://example.com/zulu' },
    { title: 'Alpha Link', url: 'https://example.com/alpha' },
  ]);

  const setSortOrder = (order: 'alphabetical' | 'folders') =>
    extensionWorker.evaluate(async (sortOrder) => {
      const key = 'bookmark-scout-settings';
      const stored = await chrome.storage.sync.get(key);
      await chrome.storage.sync.set({ [key]: { ...(stored[key] ?? {}), sortOrder } });
    }, order);

  const visibleLinkOrder = async () => {
    const text = await page.locator('body').innerText();
    return ['Zulu Link', 'Alpha Link'].sort(
      (left, right) => text.indexOf(left) - text.indexOf(right),
    );
  };

  await setSortOrder('alphabetical');
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  const browserRoot = page.locator('.accordion-item').first();
  await browserRoot.locator('.folder-item').first().click();
  await browserRoot.locator('.accordion-item').first().locator('.folder-item').first().click();
  await page.getByText('E2E Popup Actions', { exact: true }).click();
  await expect.poll(visibleLinkOrder).toEqual(['Alpha Link', 'Zulu Link']);

  await setSortOrder('folders');
  await expect.poll(visibleLinkOrder).toEqual(['Zulu Link', 'Alpha Link']);

  const folderTrigger = page
    .locator('.folder-item')
    .filter({ hasText: 'E2E Popup Actions' })
    .first();
  await folderTrigger.hover();
  await folderTrigger.getByTitle('Add folder').click();
  await page.getByPlaceholder('Enter folder name...').fill('Created in Popup');
  await page.getByPlaceholder('Enter folder name...').press('Enter');

  await expect
    .poll(() =>
      extensionWorker.evaluate(async (id) => {
        const children = await chrome.bookmarks.getChildren(id);
        return children.some((item) => item.title === 'Created in Popup' && !item.url);
      }, folder.folderId),
    )
    .toBe(true);
});

test('navigates folders and filters bookmarks by title and URL', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'E2E Collection', [
    { title: 'Alpha Item', url: 'https://example.com/alpha' },
    { title: 'Beta Item', url: 'https://example.com/beta' },
    {
      title: 'Nested Folder',
      children: [{ title: 'Inside Nested', url: 'https://example.com/nested' }],
    },
  ]);

  await page.goto(bookmarkPageUrl(extensionId, folder.folderId));
  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(3);

  await page.getByPlaceholder('Filter titles...').fill('alpha');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Alpha Item');
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(rows).toHaveCount(3);

  await page.getByPlaceholder('Filter URLs...').fill('example.com/beta');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Beta Item');
  await page.getByRole('button', { name: 'Reset' }).click();

  await rows.filter({ hasText: 'Nested Folder' }).click();
  await expect(page).toHaveURL(new RegExp(`id=${folder.ids['Nested Folder']}$`));
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Inside Nested');

  await page.locator('nav').getByRole('button', { name: 'E2E Collection' }).click();
  await expect(page).toHaveURL(new RegExp(`id=${folder.folderId}$`));
  await expect(rows).toHaveCount(3);
});

test('moves a bookmark with the table controls and persists the new order', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'E2E Reorder', [
    { title: 'First Link', url: 'https://example.com/first' },
    { title: 'Second Link', url: 'https://example.com/second' },
    { title: 'Third Link', url: 'https://example.com/third' },
  ]);

  await extensionWorker.evaluate(async () => {
    const key = 'bookmark-scout-settings';
    const stored = await chrome.storage.sync.get(key);
    await chrome.storage.sync.set({ [key]: { ...(stored[key] ?? {}), sortOrder: 'folders' } });
  });

  await page.goto(bookmarkPageUrl(extensionId, folder.folderId));
  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('First Link');

  const firstRow = rows.filter({ hasText: 'First Link' });
  await firstRow.hover();
  await firstRow.locator('div.opacity-0 button').nth(2).click();

  await expect
    .poll(() =>
      extensionWorker.evaluate(async (id) => {
        const children = await chrome.bookmarks.getChildren(id);
        return children.map((item) => item.title);
      }, folder.folderId),
    )
    .toEqual(['Second Link', 'First Link', 'Third Link']);
  await expect(rows.nth(0)).toContainText('Second Link');
});

test('previews and applies duplicate and URL cleanup tools', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'E2E Maintenance', [
    { title: 'Duplicate One', url: 'https://example.com/duplicate' },
    { title: 'Duplicate Two', url: 'https://example.com/duplicate' },
    { title: 'Tracked Link', url: 'https://example.com/page?utm_source=e2e&keep=yes' },
  ]);

  await page.goto(bookmarkPageUrl(extensionId, folder.folderId));
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await page.getByTitle('Show tools').click();

  await toolCard(page, 'Duplicate Cleaner').getByRole('button', { name: 'Scan' }).click();
  const duplicates = page.getByRole('dialog', { name: 'Duplicate Cleaner' });
  await expect(duplicates).toContainText('Duplicate One');
  await expect(duplicates).toContainText('Duplicate Two');
  await duplicates.getByRole('button', { name: 'Remove duplicates' }).click();

  await expect
    .poll(() =>
      extensionWorker.evaluate(async (id) => {
        const children = await chrome.bookmarks.getChildren(id);
        return children.filter((item) => item.url === 'https://example.com/duplicate').length;
      }, folder.folderId),
    )
    .toBe(1);

  await toolCard(page, 'URL Cleaner').getByRole('button', { name: 'Clean' }).click();
  const cleaner = page.getByRole('dialog', { name: 'URL Cleaner' });
  await expect(cleaner).toContainText('Tracked Link');
  await expect(cleaner).toContainText('utm_source=e2e');
  await cleaner.getByRole('button', { name: 'Apply Changes' }).click();

  await expect
    .poll(() =>
      extensionWorker.evaluate(async (id) => {
        const [bookmark] = await chrome.bookmarks.get(id);
        return bookmark.url;
      }, folder.ids['Tracked Link']),
    )
    .toBe('https://example.com/page?keep=yes');
});

test('reports scoped statistics and privacy findings', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'E2E Reports', [
    { title: 'Safe Link', url: 'https://example.com/safe' },
    { title: 'Privacy Link', url: 'https://example.com/private?token=fixture' },
  ]);

  await page.goto(bookmarkPageUrl(extensionId, folder.folderId));
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await page.getByTitle('Show tools').click();

  await toolCard(page, 'Bookmark Statistics').getByRole('button', { name: 'View' }).click();
  const statistics = page.getByRole('dialog', { name: 'Bookmark Statistics' });
  await expect(statistics).toContainText('Bookmarks');
  await expect(statistics).toContainText('2');
  await page.keyboard.press('Escape');

  await toolCard(page, 'Privacy Scanner').getByRole('button', { name: 'Scan' }).click();
  const privacy = page.getByRole('dialog', { name: 'Privacy Scanner' });
  await expect(privacy).toContainText('Privacy Link');
  await expect(privacy).toContainText('Sensitive query parameter: token');
});

test('exports and imports bookmark data without manual file handling', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'E2E Data', [
    { title: 'Exported Link', url: 'https://example.com/exported' },
  ]);

  await page.goto(bookmarkPageUrl(extensionId, folder.folderId));
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByTitle('Show tools').click();

  const exportCard = toolCard(page, 'Export Bookmarks');
  await exportCard.getByRole('combobox').click();
  await page.getByRole('option', { name: 'JSON' }).click();
  const downloadPromise = page.waitForEvent('download');
  await exportCard.getByRole('button', { name: 'Export' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.json$/);
  const exported = JSON.parse(await readFile(await download.path(), 'utf8')) as {
    children: SeedItem[];
  };
  expect(JSON.stringify(exported)).toContain('Exported Link');

  await page.locator('#bookmark-import-input').setInputFiles({
    name: 'e2e-import.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify([{ title: 'Imported Link', url: 'https://example.com/imported' }]),
    ),
  });

  await expect
    .poll(() =>
      extensionWorker.evaluate(async (id) => {
        const children = await chrome.bookmarks.getChildren(id);
        return children.some(
          (item) => item.title === 'Imported Link' && item.url === 'https://example.com/imported',
        );
      }, folder.folderId),
    )
    .toBe(true);

  await page.reload();
  await expect(page.locator('tbody tr').filter({ hasText: 'Imported Link' })).toHaveCount(1);
});
