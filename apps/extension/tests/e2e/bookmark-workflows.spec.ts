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
      return {
        folderId: folder.id,
        ids,
        writableRootTitle: writableRoot.title || 'Untitled',
      };
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

test('side panel search and dark mode persist across reload', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await seedFolder(extensionWorker, 'E2E Side Panel', [
    { title: 'Side Panel Match', url: 'https://example.com/side-panel' },
  ]);

  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  const search = page.getByPlaceholder('Search bookmarks...');
  await expect(search).toBeVisible();
  await search.fill('Side Panel Match');
  await expect(page.getByText('Side Panel Match', { exact: true })).toBeVisible();

  await page.getByTitle('Dark mode').click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.getByTitle('Light mode')).toBeVisible();
});

test('popup uses selected Japanese and Korean language settings', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const setLanguage = (language: 'ja' | 'ko') =>
    extensionWorker.evaluate(async (selectedLanguage) => {
      const key = 'bookmark-scout-settings';
      const stored = await chrome.storage.sync.get(key);
      await chrome.storage.sync.set({
        [key]: { ...(stored[key] ?? {}), language: selectedLanguage },
      });
    }, language);

  await setLanguage('ja');
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.getByPlaceholder('ブックマークを検索...')).toBeVisible();

  await setLanguage('ko');
  await page.reload();
  await expect(page.getByPlaceholder('북마크 검색...')).toBeVisible();
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

test('deletes a bookmark and a nested folder from the popup', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'E2E Delete', [
    { title: 'Delete Me', url: 'https://example.com/delete-me' },
    { title: 'Keep Me', url: 'https://example.com/keep-me' },
    {
      title: 'Removable Folder',
      children: [{ title: 'Nested Delete', url: 'https://example.com/nested-delete' }],
    },
  ]);

  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  const search = page.getByPlaceholder('Search bookmarks...');
  await search.fill('Delete Me');
  const bookmarkRow = page.locator('.bookmark-item').filter({ hasText: 'Delete Me' });
  await expect(bookmarkRow).toBeVisible();
  await bookmarkRow.hover();
  await bookmarkRow.getByTitle('Delete bookmark').click();

  await expect
    .poll(() =>
      extensionWorker.evaluate(async (id) => {
        const children = await chrome.bookmarks.getChildren(id);
        return children.some((item) => item.title === 'Delete Me');
      }, folder.folderId),
    )
    .toBe(false);
  await expect(bookmarkRow).toHaveCount(0);

  await search.fill('Removable Folder');
  const folderRow = page.locator('.folder-item').filter({ hasText: 'Removable Folder' }).first();
  await expect(folderRow).toBeVisible();
  await folderRow.hover();
  await folderRow.getByTitle('Delete folder').click();

  await expect
    .poll(() =>
      extensionWorker.evaluate(async (id) => {
        const children = await chrome.bookmarks.getChildren(id);
        return children.map((item) => item.title);
      }, folder.folderId),
    )
    .toEqual(['Keep Me']);
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

test('manager filters globally across nested folders or only the selected folder', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const local = await seedFolder(extensionWorker, 'E2E Scope Local', [
    { title: 'Shared Target Local', url: 'https://example.com/local-target' },
    {
      title: 'Inner Scope',
      children: [{ title: 'Shared Target Nested', url: 'https://example.com/nested-target' }],
    },
  ]);
  const remote = await seedFolder(extensionWorker, 'E2E Scope Remote', [
    { title: 'Shared Target Remote', url: 'https://example.com/remote-target' },
  ]);

  await page.goto(bookmarkPageUrl(extensionId, local.folderId));
  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: 'Shared Target Nested' })).toHaveCount(0);

  await page.getByPlaceholder('Filter titles...').fill('Shared Target');
  await expect(rows).toHaveCount(3);
  await expect(
    rows
      .filter({ hasText: 'Shared Target Nested' })
      .getByTitle(`${local.writableRootTitle} / E2E Scope Local / Inner Scope`, { exact: true }),
  ).toBeVisible();
  await expect(
    rows
      .filter({ hasText: 'Shared Target Remote' })
      .getByTitle(`${remote.writableRootTitle} / E2E Scope Remote`, { exact: true }),
  ).toBeVisible();

  await page.getByRole('checkbox', { name: 'Apply to current folder only' }).check();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Shared Target Local');
  await expect(rows.filter({ hasText: 'Shared Target Nested' })).toHaveCount(0);
  await expect(rows.filter({ hasText: 'Shared Target Remote' })).toHaveCount(0);

  await page.getByRole('checkbox', { name: 'Apply to current folder only' }).uncheck();
  await expect(rows).toHaveCount(3);
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: 'Inner Scope' })).toHaveCount(1);

  await page.getByPlaceholder('Filter URLs...').fill('remote-target');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Shared Target Remote');
  await page.getByRole('checkbox', { name: 'Apply to current folder only' }).check();
  await expect(rows.filter({ hasText: 'Shared Target Remote' })).toHaveCount(0);
  await expect(page.getByText('No results.', { exact: true })).toBeVisible();
});

test('keeps full titles and URLs available past the former truncation limits', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const commonTitle = 'Common bookmark prefix '.repeat(2);
  const zuluTitle = `${commonTitle}Zulu`;
  const alphaTitle = `${commonTitle}Alpha`;
  const longUrl = `https://example.com/${'segment-'.repeat(8)}tail-marker`;
  const folder = await seedFolder(extensionWorker, 'E2E Full Values', [
    { title: zuluTitle, url: longUrl },
    { title: alphaTitle, url: 'https://example.com/short' },
  ]);
  await extensionWorker.evaluate(async () => {
    const key = 'bookmark-scout-settings';
    const stored = await chrome.storage.sync.get(key);
    await chrome.storage.sync.set({ [key]: { ...(stored[key] ?? {}), sortOrder: 'alphabetical' } });
  });

  await page.goto(bookmarkPageUrl(extensionId, folder.folderId));
  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText(alphaTitle);
  await expect(rows.nth(1).getByTitle(zuluTitle, { exact: true })).toBeVisible();
  await expect(rows.nth(1).getByTitle(longUrl, { exact: true })).toBeVisible();

  await page.getByPlaceholder('Filter titles...').fill('Zulu');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(zuluTitle);
  await page.getByRole('button', { name: 'Reset' }).click();

  await page.getByPlaceholder('Filter URLs...').fill('tail-marker');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(zuluTitle);
  const persistedOrder = await extensionWorker.evaluate(async (id) => {
    const children = await chrome.bookmarks.getChildren(id);
    return children.map((item) => item.title);
  }, folder.folderId);
  expect(persistedOrder).toEqual([zuluTitle, alphaTitle]);
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
