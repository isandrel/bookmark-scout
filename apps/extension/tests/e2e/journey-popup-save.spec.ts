/**
 * Journey: a page saved from the popup by typing a folder's name shows up in the bookmark manager
 * at that folder's path, and the manager's undo and redo take it out and put it back.
 */
import type { Page } from '@playwright/test';
import { expect, test, toastRegion } from './fixtures';
import { breadcrumbCurrent, managerRow, managerUrl } from './manager-helpers';
import { childTitles, openPopup, seedFolder, setSettings } from './popup-helpers';
import { bookmarksWithUrl } from './quick-save-helpers';

// The harness opens the popup as a tab, which gets no activeTab, so the popup reads the current
// page (the popup's own tab) through the optional tabs permission.
test.use({ grantPermissions: ['tabs'], viewport: { width: 1400, height: 900 } });

/** Saves the page the popup runs in to the folder matching `query`, and returns its address. */
async function saveFromPopupByFolderName(page: Page, query: string, folderTitle: string) {
  const search = page.getByRole('combobox', { name: 'Search bookmarks, or type a folder name' });
  await search.fill(query);
  const match = page.getByTestId('folder-matches').locator('[data-slot="folder-match"]').first();
  await expect(match).toContainText(folderTitle);
  // What the welcome page promises: Enter saves into the first match, highlighted meanwhile.
  await expect(match).toHaveAttribute('data-active', 'true');
  await search.press('Enter');
  await expect(toastRegion(page).getByText(/Bookmark Added$/)).toBeVisible();
  return page.url();
}

test('a popup save by folder name appears at its path in the manager', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en' });
  const seeded = await seedFolder(extensionWorker, 'E2E Journey Save', [
    { title: 'Typescript Notes', children: [] },
    { title: 'Cooking', children: [] },
  ]);
  const notesId = seeded.ids['Typescript Notes'];
  await openPopup(page, extensionId);
  const title = await page.title();

  const url = await saveFromPopupByFolderName(page, 'typescript notes', 'Typescript Notes');
  await expect
    .poll(() => bookmarksWithUrl(extensionWorker, url))
    .toEqual([expect.objectContaining({ parentId: notesId, title })]);

  // The ?id= deep link opens the folder at its full path, with the saved page in it.
  const manager = await context.newPage();
  await manager.goto(managerUrl(extensionId, notesId));
  await expect(breadcrumbCurrent(manager)).toHaveText('Typescript Notes');
  await expect(manager.getByTestId('breadcrumb')).toContainText(seeded.barTitle);
  await expect(manager.getByTestId('breadcrumb')).toContainText('E2E Journey Save');
  await expect(managerRow(manager, title)).toHaveCount(1);
  expect(await childTitles(extensionWorker, notesId)).toEqual([title]);
});

test('the manager undoes and redoes a save made in the popup', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en' });
  const seeded = await seedFolder(extensionWorker, 'E2E Journey Undo Save', [
    { title: 'Typescript Notes', children: [] },
  ]);
  const notesId = seeded.ids['Typescript Notes'];
  await openPopup(page, extensionId);
  const title = await page.title();
  const url = await saveFromPopupByFolderName(page, 'typescript notes', 'Typescript Notes');
  await expect.poll(() => childTitles(extensionWorker, notesId)).toEqual([title]);

  const manager = await context.newPage();
  await manager.goto(managerUrl(extensionId, notesId));
  const saved = managerRow(manager, title);
  await expect(saved).toHaveCount(1);

  await saved.click({ position: { x: 200, y: 10 } });
  await manager.keyboard.press('ControlOrMeta+z');
  await expect(
    toastRegion(manager).getByText(`✓ Undone: Add "${title}"`, { exact: true }),
  ).toBeVisible();
  await expect(saved).toHaveCount(0);
  await expect.poll(() => bookmarksWithUrl(extensionWorker, url)).toEqual([]);

  await manager.keyboard.press('ControlOrMeta+Shift+z');
  await expect(saved).toHaveCount(1);
  await expect
    .poll(() => bookmarksWithUrl(extensionWorker, url))
    .toEqual([expect.objectContaining({ parentId: notesId, title })]);
});
