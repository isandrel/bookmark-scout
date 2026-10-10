import type { Locator, Page, Worker } from '@playwright/test';
import { expect, test, toastRegion } from './fixtures';

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
    toastRegion(page).getByText('Deleted "Doomed Link". Undo within 10 seconds.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(row(page, 'Doomed Link')).toBeVisible();
  await expect(
    toastRegion(page).getByText('Restored "Doomed Link".', { exact: true }),
  ).toBeVisible();
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

test('current-folder help tooltip shows its full text', async ({ extensionId, page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(managerUrl(extensionId));
  const helpText = 'When unchecked, filters search all bookmarks.';
  await page
    .getByTestId('bookmark-table-toolbar')
    .getByRole('button', { name: helpText })
    .hover();

  const tooltip = page.locator('[data-base-ui-portal]').getByText(helpText).first();
  await expect(tooltip).toBeVisible();
  const clipped = await tooltip.evaluate(
    (element) =>
      element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight,
  );
  expect(clipped).toBe(false);
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

test('bookmark details open with the title in view', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  // A short window makes the dialog scroll, so opening it scrolled to a footer button hides the title.
  await page.setViewportSize({ width: 1400, height: 420 });
  const folder = await seedFolder(extensionWorker, 'E2E Details Scroll', [
    { title: 'Scroll Details Link', url: 'https://e2e.invalid/details-scroll' },
  ]);

  await page.goto(managerUrl(extensionId, folder.folderId));
  await openRowMenu(page, 'Scroll Details Link');
  await page.getByRole('menuitem', { name: 'View Details' }).click();

  const dialog = page.getByRole('dialog', { name: 'Bookmark Details' });
  await expect(dialog).toBeVisible();
  // Initial focus moves a frame after opening; measure once it has landed inside the dialog.
  await expect
    .poll(() => dialog.evaluate((element) => element.contains(document.activeElement)))
    .toBe(true);
  expect(
    await dialog.evaluate((element) => element.scrollHeight > element.clientHeight),
    'the dialog must overflow for this check to mean anything',
  ).toBe(true);

  const title = dialog.getByRole('heading', { name: 'Bookmark Details' });
  await expect
    .poll(async () => {
      const [dialogBox, titleBox] = await Promise.all([dialog.boundingBox(), title.boundingBox()]);
      if (!dialogBox || !titleBox) return 'not rendered';
      const inView =
        titleBox.y >= dialogBox.y && titleBox.y + titleBox.height <= dialogBox.y + dialogBox.height;
      return inView ? 'in view' : `title at ${titleBox.y}, dialog from ${dialogBox.y}`;
    })
    .toBe('in view');

  // Keyboard users reach the URL link, then the first field, once the stored metadata has loaded.
  const tags = dialog.getByRole('textbox', { name: 'Tags' });
  await expect(tags).toBeEnabled();
  await page.keyboard.press('Tab');
  await expect(
    dialog.getByRole('link', { name: 'https://e2e.invalid/details-scroll' }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(tags).toBeFocused();
});

test('rows-per-page select keeps the gap the other pagination groups use', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'E2E Pagination Spacing', [
    { title: 'Spacing Link', url: 'https://e2e.invalid/spacing' },
  ]);

  await page.goto(managerUrl(extensionId, folder.folderId));
  const label = page.getByText('Rows per page', { exact: true });
  const trigger = label.locator('..').getByRole('combobox');
  const pageOf = page.getByText('Page 1 of 1', { exact: true });
  const firstPage = page.getByRole('button', { name: 'Go to first page' });
  await expect(trigger).toHaveText('10');

  const box = async (locator: Locator) => {
    const value = await locator.boundingBox();
    if (!value) throw new Error('Pagination control is not rendered');
    return value;
  };
  const [labelBox, triggerBox, pageOfBox, firstPageBox] = await Promise.all([
    box(label),
    box(trigger),
    box(pageOf),
    box(firstPage),
  ]);
  // The pagination groups share one gap: the select ends as far from "Page 1 of 1" as that text
  // ends from the page buttons. A stray end margin on the select pushes its group left.
  const selectToPageOf = pageOfBox.x - (triggerBox.x + triggerBox.width);
  const pageOfToButtons = firstPageBox.x - (pageOfBox.x + pageOfBox.width);
  expect(Math.abs(selectToPageOf - pageOfToButtons)).toBeLessThanOrEqual(1);
  // The label and the select stay on one row.
  const labelMiddle = labelBox.y + labelBox.height / 2;
  const triggerMiddle = triggerBox.y + triggerBox.height / 2;
  expect(Math.abs(labelMiddle - triggerMiddle)).toBeLessThanOrEqual(1);
});
