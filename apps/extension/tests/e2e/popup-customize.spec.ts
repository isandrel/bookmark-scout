/**
 * The popup and side panel as the user arranges them in Options: the tree rows' actions (buttons,
 * ⋯ and right-click menus from the action registry), the order and visibility of the parts below
 * the search row, the toolbar buttons, Expand on Open, Tree Density, and the hover card's delay
 * and details.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openOptionsTab } from './options-helpers';
import { bookmarkRow, folderRow, openPopup, seedFolder } from './popup-helpers';
import { readSettings, STORAGE_ITEMS, setSettings, writeStored } from './storage';

const searchBox = (page: Page) =>
  page.getByRole('combobox', { name: 'Search bookmarks, or type a folder name' });

/** The names of the open menu's items, in order. */
async function menuItemNames(page: Page): Promise<string[]> {
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  return (await menu.getByRole('menuitem').allTextContents()).map((name) => name.trim());
}

test('a popup row ⋯ menu lists the configured actions and hiding one in Options removes it', async ({
  extensionId,
  extensionWorker,
  page,
  context,
}) => {
  await setSettings(extensionWorker, { language: 'en' });
  await seedFolder(extensionWorker, 'E2E Row Menu', [
    { title: 'Row Menu Link', url: 'https://row-menu.e2e.invalid/' },
  ]);
  await openPopup(page, extensionId);
  await searchBox(page).fill('Row Menu Link');
  const row = bookmarkRow(page, 'Row Menu Link');
  await expect(row).toBeVisible();

  // Delete stays the row's button; the open commands are in ⋯.
  await row.hover();
  await expect(row.getByRole('button', { name: 'Delete bookmark' })).toBeVisible();
  await row.getByRole('button', { name: 'Open menu' }).click();
  expect(await menuItemNames(page)).toEqual(
    expect.arrayContaining(['Open in new tab', 'Open in new window']),
  );
  await page.keyboard.press('Escape');

  // Right-clicking lists every action, Delete included.
  await row.click({ button: 'right' });
  const all = await menuItemNames(page);
  expect(all[0]).toBe('Delete bookmark');
  expect(all).toContain('Open in new window');
  await page.keyboard.press('Escape');

  const options = await context.newPage();
  await openOptionsTab(options, extensionId, 'Behavior');
  const panel = options.getByTestId('popup-menu-bookmark');
  await panel.getByRole('checkbox', { name: 'Open in new window' }).click();
  await expect
    .poll(async () => (await readSettings(extensionWorker)).popupBookmarkMenu)
    .not.toContain('openInNewWindow');

  await page.reload();
  await searchBox(page).fill('Row Menu Link');
  await row.hover();
  await row.getByRole('button', { name: 'Open menu' }).click();
  const names = await menuItemNames(page);
  expect(names).toContain('Open in new tab');
  expect(names).not.toContain('Open in new window');
  await page.keyboard.press('Escape');

  // Hiding Delete makes the next command the row's button.
  await panel.getByRole('checkbox', { name: 'Delete' }).click();
  await page.reload();
  await searchBox(page).fill('Row Menu Link');
  await row.hover();
  await expect(row.getByRole('button', { name: 'Delete bookmark' })).toHaveCount(0);
  await expect(row.getByRole('button', { name: 'Open in new tab' })).toBeVisible();
});

test('popup sections follow the order set in Options, in the popup and the side panel', async ({
  extensionId,
  extensionWorker,
  page,
  context,
}) => {
  await setSettings(extensionWorker, { language: 'en' });
  await seedFolder(extensionWorker, 'E2E Sections', [
    { title: 'Sections Link', url: 'https://sections.e2e.invalid/' },
  ]);

  const options = await context.newPage();
  await openOptionsTab(options, extensionId, 'Appearance');
  const panel = options.getByTestId('popup-layout-popupSections');
  // The handle is also a menu button with the moves, so this works from the keyboard too.
  await panel.getByRole('button', { name: 'Reorder Key hints' }).click();
  await options.getByRole('menuitem', { name: 'Move to top' }).click();
  // The bookmark tree cannot be hidden.
  await expect(panel.getByRole('checkbox', { name: 'Bookmarks' })).toBeDisabled();
  await expect
    .poll(async () => ((await readSettings(extensionWorker)).popupSections as string[])?.[0])
    .toBe('hintBar');

  for (const surface of ['popup', 'sidepanel'] as const) {
    await page.goto(`chrome-extension://${extensionId}/${surface}.html`);
    const hints = page.getByTestId('popup-hint-bar');
    const tree = page.getByRole('tree');
    await expect(hints).toBeVisible();
    await expect(tree).toBeVisible();
    const hintsBox = await hints.boundingBox();
    const treeBox = await tree.boundingBox();
    if (!hintsBox || !treeBox) throw new Error(`No hint bar or tree box in the ${surface}`);
    expect(hintsBox.y, surface).toBeLessThan(treeBox.y);
  }

  // Hiding a part removes it.
  await panel.getByRole('checkbox', { name: 'Key hints' }).click();
  await page.reload();
  await expect(page.getByRole('tree')).toBeVisible();
  await expect(page.getByTestId('popup-hint-bar')).toHaveCount(0);
});

test('a toolbar button hidden in Options leaves the popup', async ({
  extensionId,
  extensionWorker,
  page,
  context,
}) => {
  await setSettings(extensionWorker, { language: 'en' });
  await openPopup(page, extensionId);
  await expect(page.getByRole('button', { name: 'Dark mode' })).toBeVisible();

  const options = await context.newPage();
  await openOptionsTab(options, extensionId, 'Appearance');
  const panel = options.getByTestId('popup-layout-popupToolbarButtons');
  await panel.getByRole('checkbox', { name: 'Theme' }).click();
  await expect
    .poll(async () => (await readSettings(extensionWorker)).popupToolbarButtons)
    .not.toContain('theme');

  await page.reload();
  await expect(page.getByRole('button', { name: 'Open bookmark manager' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dark mode' })).toHaveCount(0);
});

test('Expand on Open opens the bookmarks bar, or the folders left open last time', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Expand Open', [
    { title: 'Expand Inner', children: [{ title: 'Expand Deep Link', url: 'https://x.invalid/' }] },
  ]);

  // The default opens nothing.
  await setSettings(extensionWorker, { language: 'en' });
  await openPopup(page, extensionId);
  await expect(folderRow(page, seeded.barTitle)).toBeVisible();
  await expect(folderRow(page, 'E2E Expand Open')).toHaveCount(0);

  await setSettings(extensionWorker, { popupExpandOnOpen: 'bookmarks_bar' });
  await page.reload();
  await expect(folderRow(page, 'E2E Expand Open')).toBeVisible();
  await expect(folderRow(page, 'Expand Inner')).toHaveCount(0);

  // As last left: the folders open when the popup closed come back. The open page remembers the
  // bookmarks bar it opened as soon as it sees the setting change, so wait for that before reloading.
  const expandedFolders = () =>
    extensionWorker.evaluate(
      async (key) => JSON.stringify(await chrome.storage.local.get(key)),
      'ui.popup-expanded-folders',
    );
  await setSettings(extensionWorker, { popupExpandOnOpen: 'last' });
  await expect.poll(expandedFolders).toContain(seeded.barId as string);
  await page.reload();
  await folderRow(page, 'E2E Expand Open').click();
  await folderRow(page, 'Expand Inner').click();
  await expect(bookmarkRow(page, 'Expand Deep Link')).toBeVisible();
  await expect.poll(expandedFolders).toContain(seeded.ids['Expand Inner'] as string);
  await page.reload();
  await expect(bookmarkRow(page, 'Expand Deep Link')).toBeVisible();
});

test('compact tree density makes popup rows shorter', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en' });
  const seeded = await seedFolder(extensionWorker, 'E2E Density', []);
  await openPopup(page, extensionId);
  const bar = folderRow(page, seeded.barTitle);
  await expect(bar).toBeVisible();
  const comfortable = (await bar.boundingBox())?.height ?? 0;

  await setSettings(extensionWorker, { treeDensity: 'compact' });
  await expect(page.locator('[data-slot="popup-tree"]')).toHaveAttribute('data-density', 'compact');
  await expect.poll(async () => (await bar.boundingBox())?.height ?? 0).toBeLessThan(comfortable);
});

test('hover card delay and details follow their settings', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, {
    language: 'en',
    // Longer than the default, so a card open at the default delay would show the setting ignored.
    hoverCardOpenDelayMs: 1500,
    hoverCardFields: ['summary', 'title', '!address', '!cover', '!tags', '!folder', '!dateAdded'],
  });
  const seeded = await seedFolder(extensionWorker, 'E2E Hover Fields', [
    { title: 'Hover fields link', url: 'https://fields.hover.e2e.invalid/' },
  ]);
  await writeStored(extensionWorker, STORAGE_ITEMS.bookmarkMetadata, {
    [seeded.ids['Hover fields link'] as string]: { tags: ['hidden-tag'], summary: 'Shown first' },
  });
  await openPopup(page, extensionId);
  await searchBox(page).fill('Hover fields link');
  const row = bookmarkRow(page, 'Hover fields link');
  await expect(row).toBeVisible();

  await row.hover();
  const card = page.getByTestId('bookmark-hover-card');
  await page.waitForTimeout(1000);
  await expect(card).toHaveCount(0);
  await expect(card).toBeVisible();
  await expect(card.getByTestId('bookmark-hover-card-summary')).toHaveText('Shown first');
  await expect(card.getByTestId('bookmark-hover-card-title')).toBeVisible();
  // The summary comes before the title, and what the setting leaves out is not shown.
  const summaryBox = await card.getByTestId('bookmark-hover-card-summary').boundingBox();
  const titleBox = await card.getByTestId('bookmark-hover-card-title').boundingBox();
  expect(summaryBox?.y ?? 0).toBeLessThan(titleBox?.y ?? 0);
  await expect(card.getByTestId('bookmark-hover-card-url')).toHaveCount(0);
  await expect(card.getByTestId('bookmark-hover-card-folder')).toHaveCount(0);
  await expect(card.getByText('hidden-tag')).toHaveCount(0);
});
