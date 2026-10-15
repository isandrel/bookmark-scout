/**
 * Journey: settings changed in Options reach pages and the background that are already running,
 * without a reload: a manager menu action hidden in Options leaves the open manager's menu, folder
 * matches turned off leave the open popup, and a new quick save folder strategy decides where the
 * next quick save goes.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { managerRow, managerUrl } from './manager-helpers';
import { openOptionsTab } from './options-helpers';
import { openPopup, seedFolder, setSettings } from './popup-helpers';
import { finishedRecord, pressShortcut, routeArticle } from './quick-save-helpers';
import { readSettings, STORAGE_ITEMS, writeStored } from './storage';

test.use({ viewport: { width: 1400, height: 900 } });

const ARTICLE_URL = 'https://journey.e2e.invalid/articles/react-hooks-in-depth';

/** The names of the items in the open context menu. */
async function menuItemNames(page: Page) {
  return page
    .getByRole('menu')
    .getByRole('menuitem')
    .evaluateAll((items) => items.map((item) => item.textContent?.trim() ?? ''));
}

function folderMatches(page: Page) {
  return page.getByTestId('folder-matches').locator('[data-slot="folder-match"]');
}

test('settings changed in Options apply to an open manager, an open popup, and quick save', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en' });
  const react = await seedFolder(extensionWorker, 'React', [
    { title: 'React hooks reference', url: 'https://react.e2e.invalid/reference/hooks' },
  ]);
  const inbox = await seedFolder(extensionWorker, 'Inbox', [
    { title: 'Inbox Row', url: 'https://e2e.invalid/inbox-row' },
  ]);
  await writeStored(extensionWorker, STORAGE_ITEMS.recentFolders, [
    { id: inbox.folderId, title: 'Inbox', lastUsed: Date.now() },
  ]);
  await routeArticle(context, ARTICLE_URL, 'React hooks in depth');

  // The manager and the popup are open, with the defaults in effect.
  const manager = await context.newPage();
  await manager.goto(managerUrl(extensionId, inbox.folderId));
  await managerRow(manager, 'Inbox Row').click({ button: 'right' });
  expect(await menuItemNames(manager)).toContain('Copy Bookmark ID');
  await manager.keyboard.press('Escape');
  await expect(manager.getByRole('menu')).toHaveCount(0);

  await openPopup(page, extensionId);
  const search = page.getByRole('combobox', { name: 'Search bookmarks, or type a folder name' });
  await search.fill('inbox');
  await expect(folderMatches(page)).toHaveCount(1);
  await search.fill('');

  const options = await context.newPage();

  // Behavior > manager menus: hide Copy Bookmark ID.
  await openOptionsTab(options, extensionId, 'Behavior');
  await options
    .getByTestId('manager-menus')
    .getByRole('checkbox', { name: 'Copy Bookmark ID' })
    .click();
  // The setting lists the actions shown, in order.
  await expect
    .poll(async () => (await readSettings(extensionWorker)).managerMenuActions)
    .toEqual(expect.arrayContaining(['edit']));
  expect((await readSettings(extensionWorker)).managerMenuActions).not.toContain('copyId');
  await managerRow(manager, 'Inbox Row').click({ button: 'right' });
  await expect(manager.getByRole('menuitem', { name: 'Edit' })).toBeVisible();
  expect(await menuItemNames(manager)).not.toContain('Copy Bookmark ID');
  await manager.keyboard.press('Escape');

  // Saving & Search: folder matches off, and quick save to the last used folder.
  await options.getByRole('tab', { name: 'Saving & Search', exact: true }).click();
  await options.getByRole('switch', { name: 'Folder Matches' }).click();
  await options
    .getByRole('radiogroup', { name: 'Quick Save Folder' })
    .getByRole('radio', { name: 'Last used' })
    .click();
  await expect
    .poll(() => readSettings(extensionWorker))
    .toMatchObject({ folderMatchesEnabled: false, quickSaveFolderStrategy: 'last_used' });

  await search.fill('inbox');
  await expect(page.locator('mark').filter({ hasText: /inbox/i }).first()).toBeVisible();
  await expect(page.getByTestId('folder-matches')).toHaveCount(0);

  // The best match would be React; the background now saves to the last used folder instead.
  const article = await context.newPage();
  await article.goto(ARTICLE_URL);
  await pressShortcut(extensionWorker, article, 'quick-save');
  const record = await finishedRecord(extensionWorker);
  expect(record).toMatchObject({ status: 'saved', folderId: inbox.folderId });
  expect(record.folderId).not.toBe(react.folderId);
});
