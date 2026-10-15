/**
 * Journey: a bookmark dragged from the manager's list onto a folder in its tree moves there, a
 * popup that was already open shows it in the new folder without a reload, and the popup's search
 * finds it there.
 */
import { expect, test } from './fixtures';
import { dragOnto, managerRow, managerUrl, treeFolder } from './manager-helpers';
import {
  bookmarkRow,
  childTitles,
  folderRow,
  openPopup,
  popupTreeParentId,
  seedFolder,
  setSettings,
} from './popup-helpers';

test.use({ viewport: { width: 1400, height: 900 } });

test('a bookmark dragged onto a tree folder in the manager moves in an open popup too', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en', sortOrder: 'alphabetical' });
  const seeded = await seedFolder(extensionWorker, 'E2E Journey Drag', [
    {
      title: 'Archive Shelf',
      children: [{ title: 'Shelf Resident', url: 'https://e2e.invalid/r' }],
    },
    { title: 'Wandering Article', url: 'https://e2e.invalid/wandering' },
    { title: 'Staying Article', url: 'https://e2e.invalid/staying' },
  ]);
  const shelfId = seeded.ids['Archive Shelf'];
  const articleId = seeded.ids['Wandering Article'];

  // The popup is open first, with the folders expanded down to the shelf.
  await openPopup(page, extensionId);
  await folderRow(page, seeded.barTitle).click();
  await folderRow(page, 'E2E Journey Drag').click();
  await expect(bookmarkRow(page, 'Wandering Article')).toBeVisible();
  await folderRow(page, 'Archive Shelf').click();
  await expect(bookmarkRow(page, 'Shelf Resident')).toBeVisible();
  expect(await popupTreeParentId(page, articleId)).toBe(seeded.folderId);

  const manager = await context.newPage();
  await manager.goto(managerUrl(extensionId, seeded.folderId));
  await expect(treeFolder(manager, 'Archive Shelf')).toBeVisible();
  await dragOnto(
    managerRow(manager, 'Wandering Article'),
    treeFolder(manager, 'Archive Shelf'),
    0.5,
  );
  await expect
    .poll(() => childTitles(extensionWorker, shelfId))
    .toEqual(['Shelf Resident', 'Wandering Article']);
  expect(await childTitles(extensionWorker, seeded.folderId)).toEqual([
    'Archive Shelf',
    'Staying Article',
  ]);
  await expect(managerRow(manager, 'Wandering Article')).toHaveCount(0);

  // The popup was not reloaded: it follows the move into the shelf.
  await expect.poll(() => popupTreeParentId(page, articleId)).toBe(shelfId);
  await expect(bookmarkRow(page, 'Wandering Article')).toHaveCount(1);
  await expect(bookmarkRow(page, 'Staying Article')).toBeVisible();

  // Its search finds the bookmark, under the shelf.
  await page
    .getByRole('combobox', { name: 'Search bookmarks, or type a folder name' })
    .fill('Wandering');
  await expect(page.locator('mark').filter({ hasText: 'Wandering' })).toBeVisible();
  await expect(page.locator('.bookmark-item')).toHaveCount(1);
  expect(await popupTreeParentId(page, articleId)).toBe(shelfId);
});
