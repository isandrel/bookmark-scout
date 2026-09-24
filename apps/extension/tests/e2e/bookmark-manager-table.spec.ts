import type { Page, Worker } from '@playwright/test';
import { expect, test } from './fixtures';

type SeedItem = { title: string; url?: string; children?: SeedItem[] };

const SETTINGS_KEY = 'bookmark-scout-settings';

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

async function updateSettings(worker: Worker, patch: Record<string, unknown>) {
  await worker.evaluate(
    async ({ key, values }) => {
      const stored = await chrome.storage.sync.get(key);
      await chrome.storage.sync.set({ [key]: { ...(stored[key] ?? {}), ...values } });
    },
    { key: SETTINGS_KEY, values: patch },
  );
}

function managerUrl(extensionId: string, folderId?: string) {
  const base = `chrome-extension://${extensionId}/bookmarks.html`;
  return folderId ? `${base}?id=${folderId}` : base;
}

function row(page: Page, title: string) {
  return page.locator('tbody tr').filter({ hasText: title });
}

async function openRowMenu(page: Page, title: string) {
  await row(page, title).getByRole('button', { name: 'Open menu' }).click();
  await expect(page.getByRole('menu')).toBeVisible();
}

test.use({ viewport: { width: 1400, height: 900 } });

test('manager toolbar stays compact and actions stay reachable with tools open', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'E2E Layout', [
    {
      title: 'Layout Link With A Fairly Long Title To Stretch Columns',
      url: 'https://example.com/a/very/long/path/that/keeps/going/for/layout/testing/purposes',
    },
  ]);
  await page.goto(managerUrl(extensionId, folder.folderId));

  const toolbar = page.getByTestId('bookmark-table-toolbar');
  await expect(toolbar).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Current folder only' })).toBeVisible();
  const toolbarBox = await toolbar.boundingBox();
  expect(toolbarBox?.height ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(90);

  await page.getByTitle('Show tools').click();
  await expect(page.getByTitle('Hide tools')).toBeVisible();
  // Wait for the sidebar width transition to settle.
  await page.waitForTimeout(400);

  const urlFilter = page.getByPlaceholder('Filter URLs...');
  expect((await urlFilter.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(120);

  const menuButton = row(page, 'Layout Link').getByRole('button', { name: 'Open menu' });
  const menuBox = await menuButton.boundingBox();
  const main = await page.locator('main').boundingBox();
  expect(menuBox).not.toBeNull();
  expect(main).not.toBeNull();
  if (menuBox && main) {
    expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(main.x + main.width);
  }
  await menuButton.click();
  await expect(page.getByRole('menuitem', { name: 'Edit' })).toBeVisible();
});

test('row menu edits, deletes, and undoes deletion of manager items', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await updateSettings(extensionWorker, { confirmBeforeDelete: false });
  const folder = await seedFolder(extensionWorker, 'E2E Row Actions', [
    { title: 'Editable Link', url: 'https://example.com/editable' },
    { title: 'Editable Folder' },
    { title: 'Doomed Link', url: 'https://example.com/doomed' },
  ]);
  await page.goto(managerUrl(extensionId, folder.folderId));
  await expect(page.locator('tbody tr')).toHaveCount(3);

  // Edit a link's title and URL.
  await openRowMenu(page, 'Editable Link');
  await expect(page.getByRole('menuitem', { name: 'Open in new tab' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  const linkDialog = page.getByRole('dialog', { name: 'Edit bookmark' });
  await linkDialog.getByLabel('Name').fill('Edited Link');
  await linkDialog.getByLabel('URL').fill('https://example.com/edited');
  await linkDialog.getByRole('button', { name: 'Save' }).click();
  await expect(linkDialog).toHaveCount(0);
  await expect(row(page, 'Edited Link')).toContainText('https://example.com/edited');
  await expect
    .poll(() =>
      extensionWorker.evaluate(
        async (id) => (await chrome.bookmarks.get(id))[0],
        folder.ids['Editable Link'],
      ),
    )
    .toMatchObject({ title: 'Edited Link', url: 'https://example.com/edited' });

  // Folders only expose a title field and no "open in new tab".
  await openRowMenu(page, 'Editable Folder');
  await expect(page.getByRole('menuitem', { name: 'Open in new tab' })).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  const folderDialog = page.getByRole('dialog', { name: 'Edit folder' });
  await expect(folderDialog.getByLabel('URL')).toHaveCount(0);
  await folderDialog.getByLabel('Name').fill('Renamed Folder');
  await folderDialog.getByRole('button', { name: 'Save' }).click();
  await expect(row(page, 'Renamed Folder')).toBeVisible();
  // Menu clicks must not navigate into the folder.
  await expect(page).toHaveURL(new RegExp(`id=${folder.folderId}$`));

  // Delete without confirmation, then undo.
  await openRowMenu(page, 'Doomed Link');
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(row(page, 'Doomed Link')).toHaveCount(0);
  await expect(
    page.getByText('Deleted "Doomed Link". Undo within 10 seconds.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(row(page, 'Doomed Link')).toBeVisible();
  await expect(page.getByText('Restored "Doomed Link".', { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      extensionWorker.evaluate(
        async (parentId) =>
          (await chrome.bookmarks.getChildren(parentId)).map((child) => child.title),
        folder.folderId,
      ),
    )
    .toContain('Doomed Link');

  // With confirmation enabled, cancelling keeps the item and confirming removes it.
  await updateSettings(extensionWorker, { confirmBeforeDelete: true });
  await page.reload();
  await openRowMenu(page, 'Doomed Link');
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  const confirmDialog = page.getByRole('dialog', { name: 'Delete bookmark' });
  await expect(confirmDialog).toContainText('Doomed Link');
  await confirmDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(row(page, 'Doomed Link')).toBeVisible();

  await openRowMenu(page, 'Doomed Link');
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page
    .getByRole('dialog', { name: 'Delete bookmark' })
    .getByRole('button', { name: 'Delete bookmark' })
    .click();
  await expect(row(page, 'Doomed Link')).toHaveCount(0);
});

test('permanent root folders cannot be edited or deleted', async ({ extensionId, page }) => {
  await page.goto(managerUrl(extensionId));
  const rows = page.locator('tbody tr');
  await expect(rows.first()).toBeVisible();
  const rowCount = await rows.count();
  expect(rowCount).toBeGreaterThan(0);

  for (let index = 0; index < rowCount; index += 1) {
    await rows.nth(index).getByRole('button', { name: 'Open menu' }).click();
    await expect(page.getByRole('menuitem', { name: 'View Details' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Edit' })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: 'Delete' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(rows.nth(index).getByRole('button', { name: 'Move up' })).toHaveCount(0);
  }
});

test('manager table uses Japanese labels', async ({ extensionId, extensionWorker, page }) => {
  await updateSettings(extensionWorker, { language: 'ja' });
  const folder = await seedFolder(extensionWorker, 'E2E Japanese', [
    { title: 'Japanese Link', url: 'https://example.com/ja' },
  ]);
  await page.goto(managerUrl(extensionId, folder.folderId));

  await expect(page.getByPlaceholder('タイトルで絞り込み...')).toBeVisible();
  await expect(page.getByPlaceholder('URLで絞り込み...')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: '現在のフォルダのみ' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'タイトル' })).toBeVisible();
  await expect(page.getByText('1ページの行数')).toBeVisible();
  await expect(page.getByText('1 / 1ページ')).toBeVisible();
  await expect(page.getByTitle('ツールを表示')).toBeVisible();

  await row(page, 'Japanese Link').getByRole('button', { name: 'メニューを開く' }).click();
  await expect(page.getByRole('menuitem', { name: '編集' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: '新しいタブで開く' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: '削除' })).toBeVisible();
});
