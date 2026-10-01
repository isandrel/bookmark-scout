import type { Page, Worker } from '@playwright/test';
import { expect, test } from './fixtures';

type SeedItem = { title: string; url?: string; children?: SeedItem[] };

const SETTINGS_KEY = 'bookmark-scout-settings';

/** Creates a folder under the first writable root and returns IDs keyed by title. */
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
      return { folderId: folder.id, ids };
    },
    { folderTitle: title, entries: items },
  );
}

async function childTitles(worker: Worker, parentId: string) {
  return worker.evaluate(
    async (id) => (await chrome.bookmarks.getChildren(id)).map((child) => child.title),
    parentId,
  );
}

function managerUrl(extensionId: string, folderId: string) {
  return `chrome-extension://${extensionId}/bookmarks.html?id=${folderId}`;
}

function row(page: Page, title: string) {
  return page.locator('tbody tr').filter({ hasText: title });
}

function selectBox(page: Page, title: string) {
  return page.getByRole('checkbox', { name: `Select "${title}"` });
}

test.use({ viewport: { width: 1400, height: 900 } });

test('folder navigation clears the selection, including Back and Forward', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Selection Nav', [
    { title: 'Nav Sub', children: [{ title: 'Nav Inside', url: 'https://inside.example.com/' }] },
    { title: 'Nav A', url: 'https://a.example.com/' },
    { title: 'Nav B', url: 'https://b.example.com/' },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  const bulk = page.getByTestId('bulk-actions');

  await selectBox(page, 'Nav A').check();
  await selectBox(page, 'Nav B').check();
  await expect(bulk).toContainText('2 selected');
  await expect(page.getByText('2 of 3 row(s) selected.', { exact: true })).toBeVisible();

  // Opening a subfolder starts with nothing selected.
  await row(page, 'Nav Sub').click();
  await expect(page).toHaveURL(new RegExp(`id=${seeded.ids['Nav Sub']}$`));
  await expect(row(page, 'Nav Inside')).toBeVisible();
  await expect(bulk).toHaveCount(0);
  await expect(page.getByText('0 of 1 row(s) selected.', { exact: true })).toBeVisible();

  // Back does not bring the earlier selection back, and Forward does not keep a new one.
  await selectBox(page, 'Nav Inside').check();
  await expect(bulk).toContainText('1 selected');
  await page.goBack();
  await expect(row(page, 'Nav A')).toBeVisible();
  await expect(selectBox(page, 'Nav A')).not.toBeChecked();
  await expect(selectBox(page, 'Nav B')).not.toBeChecked();
  await expect(bulk).toHaveCount(0);
  await expect(page.getByText('0 of 3 row(s) selected.', { exact: true })).toBeVisible();

  await selectBox(page, 'Nav B').check();
  await page.goForward();
  await expect(row(page, 'Nav Inside')).toBeVisible();
  await expect(selectBox(page, 'Nav Inside')).not.toBeChecked();
  await expect(bulk).toHaveCount(0);
});

test('a refresh keeps selected rows that remain and drops deleted or moved rows', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await extensionWorker.evaluate(
    async ({ key }) => {
      const stored = await chrome.storage.sync.get(key);
      await chrome.storage.sync.set({ [key]: { ...(stored[key] ?? {}), confirmBeforeDelete: false } });
    },
    { key: SETTINGS_KEY },
  );
  const seeded = await seedFolder(extensionWorker, 'E2E Selection Refresh', [
    { title: 'Elsewhere', children: [] },
    { title: 'Keep A', url: 'https://keep.example.com/' },
    { title: 'Rename B', url: 'https://rename.example.com/' },
    { title: 'Delete C', url: 'https://delete.example.com/' },
    { title: 'Move D', url: 'https://move.example.com/' },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  const bulk = page.getByTestId('bulk-actions');

  for (const title of ['Keep A', 'Rename B', 'Delete C', 'Move D']) {
    await selectBox(page, title).check();
  }
  await expect(bulk).toContainText('4 selected');

  // Changes from outside the page arrive as bookmark events and refresh the table.
  await extensionWorker.evaluate(
    async ({ folderId, ids }) => {
      await chrome.bookmarks.create({
        parentId: folderId,
        index: 0,
        title: 'New E',
        url: 'https://new.example.com/',
      });
      await chrome.bookmarks.update(ids['Rename B'], { title: 'Renamed B' });
      await chrome.bookmarks.remove(ids['Delete C']);
      await chrome.bookmarks.move(ids['Move D'], { parentId: ids.Elsewhere });
    },
    { folderId: seeded.folderId, ids: seeded.ids },
  );
  await expect(row(page, 'New E')).toBeVisible();
  await expect(row(page, 'Renamed B')).toBeVisible();
  await expect(row(page, 'Delete C')).toHaveCount(0);
  await expect(row(page, 'Move D')).toHaveCount(0);

  // The remaining rows stay selected by bookmark, not position; nothing hidden is left behind.
  await expect(selectBox(page, 'Keep A')).toBeChecked();
  await expect(selectBox(page, 'Renamed B')).toBeChecked();
  await expect(selectBox(page, 'New E')).not.toBeChecked();
  await expect(bulk).toContainText('2 selected');
  await expect(page.getByTestId('bulk-hidden-selection')).toHaveCount(0);
  await expect(page.getByText('2 of 4 row(s) selected.', { exact: true })).toBeVisible();

  // Bulk actions touch exactly the rows still selected; the moved bookmark is left alone.
  await bulk.getByRole('button', { name: 'Delete' }).click();
  await expect
    .poll(() => childTitles(extensionWorker, seeded.folderId))
    .toEqual(['New E', 'Elsewhere']);
  expect(await childTitles(extensionWorker, seeded.ids.Elsewhere)).toEqual(['Move D']);
  await expect(bulk).toHaveCount(0);
});
