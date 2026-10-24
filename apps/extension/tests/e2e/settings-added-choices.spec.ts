/**
 * Lists of what a part of a page shows (`src/lib/shown-ids.ts`): a choice added after the user
 * arranged a list shows until they hide it, and what they hid stays hidden. Also the manager's item
 * menu as 0.3.4 stored it, before menus named their hidden actions, which the storage migration
 * `2026-10-sync-list-shards` writes in the new form (deleted with it).
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { managerRow, managerUrl } from './manager-helpers';
import { openOptionsTab } from './options-helpers';
import { openPopup } from './popup-helpers';
import { readSettings, readStored, STORAGE_ITEMS, setSettings, writeStored } from './storage';
import { seedFolder } from './tool-helpers';

test.use({ viewport: { width: 1400, height: 900 } });

const menuItemNames = (page: Page) =>
  page
    .getByRole('menu')
    .getByRole('menuitem')
    .evaluateAll((items) => items.map((item) => item.textContent?.trim() ?? ''));

test('an item menu arranged in 0.3.4 shows the actions added since, and keeps hiding the rest', async ({
  extensionId,
  extensionWorker,
  page,
  context,
}) => {
  const { folderId } = await seedFolder(extensionWorker, 'E2E Added Actions', [
    { title: 'Added Actions Link', url: 'https://added-actions.e2e.invalid/' },
  ]);
  // As 0.3.4 stored it, in the settings item: the actions shown, Copy Bookmark ID left out
  // (hidden), and no Preview, which the menu gained later.
  await writeStored(extensionWorker, STORAGE_ITEMS.settings, {
    language: 'en',
    managerMenuActions: ['edit', 'viewDetails', 'copy', 'openInNewTab', 'delete'],
  });
  // Moved to its own item with what 0.3.4 hid marked hidden, and nothing for Preview.
  await expect
    .poll(() => readStored(extensionWorker, STORAGE_ITEMS.settingsList, 'managerMenuActions'))
    .toContain('!copyId');
  expect(
    await readStored<string[]>(extensionWorker, STORAGE_ITEMS.settingsList, 'managerMenuActions'),
  ).not.toContain('!preview');
  await page.goto(managerUrl(extensionId, folderId));
  await managerRow(page, 'Added Actions Link').click({ button: 'right' });
  await expect.poll(() => menuItemNames(page)).toContain('Preview');
  const names = await menuItemNames(page);
  expect(names).toEqual(expect.arrayContaining(['Edit', 'View Details', 'Copy', 'Delete']));
  expect(names).not.toContain('Copy Bookmark ID');
  expect(names).not.toContain('Cut');
  await page.keyboard.press('Escape');

  // Options shows it checked; hidden there, it stays hidden and is stored as hidden.
  const options = await context.newPage();
  await openOptionsTab(options, extensionId, 'Behavior');
  const editor = options.getByTestId('manager-menu-item');
  await expect(editor.getByRole('checkbox', { name: 'Preview' })).toBeChecked();
  await expect(editor.getByRole('checkbox', { name: 'Copy Bookmark ID' })).not.toBeChecked();
  await editor.getByRole('checkbox', { name: 'Preview' }).click();
  await expect
    .poll(async () => (await readSettings(extensionWorker)).managerMenuActions)
    .toContain('!preview');
  await managerRow(page, 'Added Actions Link').click({ button: 'right' });
  await expect.poll(() => menuItemNames(page)).toContain('Edit');
  expect(await menuItemNames(page)).not.toContain('Preview');
});

test('a popup part added after the parts were arranged shows, and one hidden stays hidden', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  // Arranged before Key hints existed: the list does not name it.
  await setSettings(extensionWorker, {
    language: 'en',
    popupSections: ['tree', 'currentPage', 'notices'],
  });
  await openPopup(page, extensionId);
  await expect(page.getByTestId('popup-hint-bar')).toBeVisible();

  // Hidden by the user, it stays hidden.
  await setSettings(extensionWorker, {
    popupSections: ['tree', 'currentPage', 'notices', '!hintBar'],
  });
  await page.reload();
  await expect(page.getByRole('tree')).toBeVisible();
  await expect(page.getByTestId('popup-hint-bar')).toHaveCount(0);
});
