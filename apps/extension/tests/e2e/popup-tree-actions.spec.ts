import type { Locator } from '@playwright/test';
import { expect, test, toastRegion } from './fixtures';
import {
  bookmarkRow,
  childTitles,
  folderRow,
  openPopup,
  seedFolder,
  setSettings,
} from './popup-helpers';

async function dropOnLowerEdge(source: Locator, target: Locator) {
  const box = await target.boundingBox();
  if (!box) throw new Error('Drop target is not visible');
  await source.dragTo(target, { targetPosition: { x: box.width / 2, y: box.height - 3 } });
}

test('dropping beside a bookmark in another folder moves it there', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const recipes = await seedFolder(extensionWorker, 'E2E Recipes', [
    { title: 'Pasta', url: 'https://e2e.invalid/pasta' },
  ]);
  const tracked = await seedFolder(extensionWorker, 'E2E Tracked', [
    { title: 'Example tracked', url: 'https://e2e.invalid/tracked' },
  ]);

  await openPopup(page, extensionId);
  await page.getByPlaceholder('Search bookmarks...').fill('a');
  const source = bookmarkRow(page, 'Example tracked').locator('a');
  const target = bookmarkRow(page, 'Pasta').locator('a');
  await expect(source).toBeVisible();
  await expect(target).toBeVisible();

  await dropOnLowerEdge(source, target);
  await expect.poll(() => childTitles(extensionWorker, recipes.folderId)).toEqual([
    'Pasta',
    'Example tracked',
  ]);
  expect(await childTitles(extensionWorker, tracked.folderId)).toEqual([]);
  await expect(toastRegion(page)).toContainText('"Example tracked" moved to "E2E Recipes"');
});

test('reordering under date sort explains why the list does not change', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Reorder', [
    { title: 'Reorder First', url: 'https://e2e.invalid/first' },
    { title: 'Reorder Second', url: 'https://e2e.invalid/second' },
  ]);

  await openPopup(page, extensionId);
  await page.getByPlaceholder('Search bookmarks...').fill('Reorder');
  await dropOnLowerEdge(
    bookmarkRow(page, 'Reorder First').locator('a'),
    bookmarkRow(page, 'Reorder Second').locator('a'),
  );
  await expect
    .poll(() => childTitles(extensionWorker, seeded.folderId))
    .toEqual(['Reorder Second', 'Reorder First']);
  await expect(toastRegion(page)).toContainText('sorted by date or name');
});

test('dropping a folder into its own subfolder explains why it failed', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Parent Drag', [
    { title: 'E2E Child Drop', children: [{ title: 'Child Link', url: 'https://e2e.invalid/c' }] },
  ]);

  await openPopup(page, extensionId);
  await page.getByPlaceholder('Search bookmarks...').fill('E2E Child Drop');
  const parent = folderRow(page, 'E2E Parent Drag').locator('.cursor-grab');
  const child = folderRow(page, 'E2E Child Drop').locator('.cursor-grab');
  await parent.dragTo(child);

  await expect(toastRegion(page)).toContainText(
    "A folder can't be moved into itself or one of its subfolders.",
  );
  expect(await childTitles(extensionWorker, seeded.barId)).toContain('E2E Parent Drag');
});

test('popup follows bookmark changes made elsewhere and keeps expanded folders', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Live Folder', [
    { title: 'Live Existing', url: 'https://e2e.invalid/existing' },
  ]);

  await openPopup(page, extensionId);
  await folderRow(page, seeded.barTitle).click();
  await folderRow(page, 'E2E Live Folder').click();
  await expect(bookmarkRow(page, 'Live Existing')).toBeVisible();

  const created = await extensionWorker.evaluate(
    async (parentId) =>
      (await chrome.bookmarks.create({ parentId, title: 'Live Created', url: 'https://e2e.invalid/new' }))
        .id,
    seeded.folderId,
  );
  await expect(bookmarkRow(page, 'Live Created')).toBeVisible();

  await extensionWorker.evaluate(
    async (id) => chrome.bookmarks.update(id, { title: 'Live Renamed' }),
    created,
  );
  await expect(bookmarkRow(page, 'Live Renamed')).toBeVisible();

  await extensionWorker.evaluate(async (id) => chrome.bookmarks.remove(id), seeded.ids['Live Existing']);
  await expect(bookmarkRow(page, 'Live Existing')).toHaveCount(0);
  await expect(bookmarkRow(page, 'Live Renamed')).toBeVisible();
  await expect(page.locator('.animate-pulse')).toHaveCount(0);
});

test('an undo toast paused by hover closes when the undo window expires', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  test.setTimeout(45_000);
  await seedFolder(extensionWorker, 'E2E Late Undo', [
    { title: 'Late Undo Target', url: 'https://e2e.invalid/late' },
  ]);
  await setSettings(extensionWorker, { confirmBeforeDelete: false });

  await openPopup(page, extensionId);
  await page.getByPlaceholder('Search bookmarks...').fill('Late Undo Target');
  const row = bookmarkRow(page, 'Late Undo Target');
  await row.hover();
  await row.getByTitle('Delete bookmark').click();

  const undo = page.getByRole('button', { name: 'Undo' });
  await expect(undo).toBeVisible();
  await undo.hover();
  await expect(undo).toHaveCount(0, { timeout: 15_000 });
});

test('expand all subfolders opens the folder, toggles its label, and hides without subfolders', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Expand Tree', [
    { title: 'Level One', children: [{ title: 'Level Two', children: [{ title: 'Deep Leaf', url: 'https://e2e.invalid/leaf' }] }] },
    { title: 'Only Links', children: [{ title: 'Flat Link', url: 'https://e2e.invalid/flat' }] },
  ]);

  await openPopup(page, extensionId);
  await folderRow(page, seeded.barTitle).click();
  const tree = folderRow(page, 'E2E Expand Tree');
  await tree.hover();
  await tree.getByRole('button', { name: 'Expand all subfolders' }).click();
  await expect(bookmarkRow(page, 'Deep Leaf')).toBeVisible();

  await tree.hover();
  await tree.getByRole('button', { name: 'Collapse all subfolders' }).click();
  await expect(bookmarkRow(page, 'Deep Leaf')).toHaveCount(0);
  await expect(folderRow(page, 'Level One')).toBeVisible();

  const onlyLinks = folderRow(page, 'Only Links');
  await onlyLinks.hover();
  await expect(onlyLinks.getByRole('button', { name: /all subfolders/ })).toHaveCount(0);
});

test('row actions have no nested buttons and appear on keyboard focus', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Keyboard Row', [
    { title: 'Keyboard Link', url: 'https://e2e.invalid/keyboard' },
  ]);

  await openPopup(page, extensionId);
  await folderRow(page, seeded.barTitle).click();
  await expect(folderRow(page, 'E2E Keyboard Row')).toBeVisible();
  expect(await page.locator('button button, a button, button a').count()).toBe(0);

  const row = folderRow(page, 'E2E Keyboard Row');
  const deleteButton = row.getByRole('button', { name: 'Delete folder' });
  // The action group, not each button, carries the hover/focus opacity.
  const actions = deleteButton.locator('..');
  await expect(actions).toHaveCSS('opacity', '0');
  await row.getByRole('button', { name: 'E2E Keyboard Row' }).focus();
  await page.keyboard.press('Tab');
  await expect(row.getByRole('button', { name: 'Add current page' })).toBeFocused();
  await expect(actions).toHaveCSS('opacity', '1');
});

test('popup applies favicon, new folder name, and popup size settings', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const settingsSeed = await seedFolder(extensionWorker, 'E2E Settings Row', [
    { title: 'Favicon Link', url: 'https://e2e.invalid/favicon' },
  ]);
  await setSettings(extensionWorker, {
    faviconSize: 32,
    defaultNewFolderName: 'Reading List',
    popupWidth: 500,
    popupHeight: 1000,
  });

  await openPopup(page, extensionId);
  const search = page.getByPlaceholder('Search bookmarks...');
  await search.fill('Favicon Link');
  const favicon = bookmarkRow(page, 'Favicon Link').locator('img');
  await expect(favicon).toHaveAttribute('width', '32');
  await expect(favicon).toHaveAttribute('src', /size=64/);

  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).width))
    .toBe('500px');
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).height))
    .toBe('600px');

  await setSettings(extensionWorker, { showFavicons: false });
  await expect(bookmarkRow(page, 'Favicon Link').locator('img')).toHaveCount(0);

  await search.fill('');
  await expect(bookmarkRow(page, 'Favicon Link')).toHaveCount(0);
  const settingsFolder = folderRow(page, 'E2E Settings Row');
  await folderRow(page, settingsSeed.barTitle).click();
  await settingsFolder.hover();
  await settingsFolder.getByRole('button', { name: 'Add folder' }).click();
  const input = page.getByPlaceholder('Enter folder name...');
  await expect(input).toHaveValue('Reading List');
  await input.press('Enter');
  await expect(settingsFolder).toContainText('(2)');
});

test('adding the current page to a folder twice does not duplicate it', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Duplicate Add', []);

  await openPopup(page, extensionId);
  await folderRow(page, seeded.barTitle).click();
  const row = folderRow(page, 'E2E Duplicate Add');
  await row.hover();
  await row.getByRole('button', { name: 'Add current page' }).click();
  await expect.poll(() => childTitles(extensionWorker, seeded.folderId)).toHaveLength(1);

  await row.hover();
  await row.getByRole('button', { name: 'Add current page' }).click();
  await expect(toastRegion(page)).toContainText('Already saved');
  expect(await childTitles(extensionWorker, seeded.folderId)).toHaveLength(1);
});

test('long unbroken toast text wraps inside the toast', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Long Toast', []);
  await page.setViewportSize({ width: 400, height: 600 });

  await openPopup(page, extensionId);
  await folderRow(page, seeded.barTitle).click();
  const row = folderRow(page, 'E2E Long Toast');
  await row.hover();
  await row.getByRole('button', { name: 'Add folder' }).click();
  const input = page.getByPlaceholder('Enter folder name...');
  await input.fill('W'.repeat(200));
  await input.press('Enter');

  const description = toastRegion(page).locator('li').first().locator('div.opacity-90');
  await expect(description).toContainText('WWWW');
  const overflow = await description.evaluate((node) => node.scrollWidth - node.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const box = await description.boundingBox();
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(400);
});

test('popup controls, row actions, and toasts use the selected language', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Locale Row', [
    { title: 'Locale Link', url: 'https://e2e.invalid/locale' },
  ]);
  await setSettings(extensionWorker, { language: 'ja', confirmBeforeDelete: false });

  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  const search = page.getByPlaceholder('ブックマークを検索...');
  await expect(search).toBeVisible();
  await search.fill('Locale');
  await expect(page.getByRole('button', { name: '検索をクリア' })).toBeVisible();

  const row = folderRow(page, 'E2E Locale Row');
  await row.hover();
  await expect(row.getByRole('button', { name: 'フォルダを削除' })).toBeVisible();
  await row.getByRole('button', { name: '現在のページを追加' }).click();
  const region = page.getByRole('region', { name: '通知 (F8)' });
  await expect(region).toContainText('」を「E2E Locale Row」に追加しました');
  await expect.poll(() => childTitles(extensionWorker, seeded.folderId)).toHaveLength(2);
});
