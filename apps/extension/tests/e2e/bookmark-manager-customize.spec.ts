/**
 * The bookmark manager arranged in Options > Behavior: its menus (hidden, reordered, and moved
 * between sections), the defaults of a new or reset table view, the start folder, what cards and
 * the preview show, the sidebars' widths and whether they reopen as left, and an order of its own.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { breadcrumbCurrent, managerRow, managerUrl, waitForNoOverlay } from './manager-helpers';
import { openOptionsTab } from './options-helpers';
import { bookmarkRow, folderRow, openPopup } from './popup-helpers';
import { readSettings, readStored, STORAGE_ITEMS, setSettings, writeStored } from './storage';
import { seedFolder } from './tool-helpers';

test.use({ viewport: { width: 1400, height: 900 } });

const menuItemNames = (page: Page) =>
  page
    .getByRole('menu')
    .getByRole('menuitem')
    .evaluateAll((items) => items.map((item) => item.textContent?.trim() ?? ''));

const rowTitles = (page: Page) =>
  page
    .locator('tbody tr')
    .evaluateAll((rows) => rows.map((row) => row.querySelector('td + td')?.textContent ?? ''));

/** Picks `option` in the Options select named `name`. */
async function choose(page: Page, name: string, option: string) {
  await page.getByRole('combobox', { name, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

/** Moves an entry of an Options checklist with its handle's menu of moves. */
async function moveEntry(
  page: Page,
  list: ReturnType<Page['getByTestId']>,
  name: string,
  move: string,
) {
  await list
    .getByRole('button', { name: `Reorder ${name}` })
    .first()
    .click();
  await page.getByRole('menuitem', { name: move }).click();
}

test('Options arranges the Organize menu: hides, reorders, moves between sections, and resets', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  const { folderId } = await seedFolder(extensionWorker, 'E2E Organize Layout', [
    { title: 'Organize One', url: 'https://one.e2e.invalid/' },
    { title: 'Organize Two', url: 'https://two.e2e.invalid/' },
  ]);
  const options = await context.newPage();
  await openOptionsTab(options, extensionId, 'Behavior');
  const panel = options.getByTestId('manager-menus');
  await panel.getByRole('tab', { name: 'Organize menu' }).click();
  const editor = panel.getByTestId('manager-menu-organize');
  await expect(editor.locator('li')).toHaveText([
    'Sort by name',
    /Section break/,
    'Add new bookmark',
    'Add new folder',
  ]);

  // Add new folder to the top: it joins Sort by name's section.
  await moveEntry(options, editor, 'Add new folder', 'Move to top');
  await expect
    .poll(async () => (await readSettings(extensionWorker)).managerOrganizeMenu)
    .toEqual(['-addFolder', 'sortByName', '-addBookmark']);
  // Hide Add new bookmark, then split the first section with a new break moved up between them.
  await editor.getByRole('checkbox', { name: 'Add new bookmark' }).click();
  await expect(panel.getByTestId('manager-menu-organize-hidden')).toContainText('Add new bookmark');
  await editor.getByRole('button', { name: 'Add section break' }).click();
  await moveEntry(options, editor, 'Section break', 'Move up');
  await expect
    .poll(async () => (await readSettings(extensionWorker)).managerOrganizeMenu)
    .toEqual(['-addFolder', '-sortByName', '!addBookmark']);

  // The manager shows two sections, the folder first.
  await page.goto(managerUrl(extensionId, folderId));
  await page.getByTestId('organize-menu').click();
  await expect.poll(() => menuItemNames(page)).toEqual(['Add new folder', 'Sort by name']);
  await expect(page.getByRole('menu').getByRole('separator')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await waitForNoOverlay(page);

  // The last command stays, and the open manager follows at once.
  await editor.getByRole('checkbox', { name: 'Add new folder' }).click();
  await expect(editor.getByRole('checkbox', { name: 'Sort by name' })).toBeDisabled();
  await expect
    .poll(async () => (await readSettings(extensionWorker)).managerOrganizeMenu)
    .toEqual(['-sortByName', '!addBookmark', '!addFolder']);
  await page.getByTestId('organize-menu').click();
  await expect.poll(() => menuItemNames(page)).toEqual(['Sort by name']);
  await page.keyboard.press('Escape');
  await waitForNoOverlay(page);

  // Restore defaults is per menu: the item menu keeps its own arrangement.
  await setSettings(extensionWorker, { managerMenuActions: ['-edit', 'delete'] });
  await editor.getByRole('button', { name: 'Restore defaults' }).click();
  await expect
    .poll(async () => (await readSettings(extensionWorker)).managerOrganizeMenu)
    .toBeUndefined();
  expect((await readSettings(extensionWorker)).managerMenuActions).toEqual(['-edit', 'delete']);
  await page.getByTestId('organize-menu').click();
  await expect
    .poll(() => menuItemNames(page))
    .toEqual(['Sort by name', 'Add new bookmark', 'Add new folder']);
});

test('default columns, rows per page, and sort apply to a new view and after Reset table view', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  const { folderId } = await seedFolder(extensionWorker, 'E2E Table Defaults', [
    { title: 'Beta Row', url: 'https://beta.e2e.invalid/' },
    { title: 'Alpha Row', url: 'https://alpha.e2e.invalid/' },
    { title: 'Gamma Row', url: 'https://gamma.e2e.invalid/' },
  ]);
  const options = await context.newPage();
  await openOptionsTab(options, extensionId, 'Behavior');
  const columns = options.getByTestId('manager-columns');
  await columns.getByRole('checkbox', { name: 'Tags' }).click();
  await columns.getByRole('checkbox', { name: 'URL' }).click();
  await choose(options, 'Default Rows per Page', '20');
  await choose(options, 'Default Sort', 'Title, Z to A');
  await expect
    .poll(async () => (await readSettings(extensionWorker)).managerDefaultColumns)
    .toEqual(['title', 'dateAdded', 'tags']);
  // How a view starts suits one screen, so it stays on this device.
  await expect
    .poll(() => readStored(extensionWorker, STORAGE_ITEMS.deviceSettings))
    .toMatchObject({
      managerDefaultPageSize: 20,
      managerDefaultSort: 'titleDesc',
    });

  await page.goto(managerUrl(extensionId, folderId));
  const headers = page.locator('thead th');
  await expect(headers.filter({ hasText: 'Tags' })).toHaveCount(1);
  await expect(headers.filter({ hasText: 'URL' })).toHaveCount(0);
  await expect.poll(() => rowTitles(page)).toEqual(['Gamma Row', 'Beta Row', 'Alpha Row']);
  const pageSize = page
    .getByText('Rows per page', { exact: true })
    .locator('..')
    .getByRole('combobox');
  await expect(pageSize).toHaveText('20');

  // A part changed in the manager stays; the parts left alone follow the defaults as they change.
  await pageSize.click();
  await page.getByRole('option', { name: '10', exact: true }).click();
  await expect(pageSize).toHaveText('10');
  await choose(options, 'Default Rows per Page', '30');
  await columns.getByRole('checkbox', { name: 'Tags' }).click();
  await expect(headers.filter({ hasText: 'Tags' })).toHaveCount(0);
  await expect(pageSize).toHaveText('10');

  // Reset table view: the whole view follows the defaults again, here and after a reload.
  await columns.getByRole('button', { name: 'Reset table view' }).click();
  await expect(pageSize).toHaveText('30');
  await expect(columns.getByRole('button', { name: 'Reset table view' })).toBeDisabled();
  await page.reload();
  await expect(pageSize).toHaveText('30');
  await expect.poll(() => rowTitles(page)).toEqual(['Gamma Row', 'Beta Row', 'Alpha Row']);

  // Reset column widths forgets only the widths.
  await writeStored(extensionWorker, STORAGE_ITEMS.tableLayout, {
    pageSize: 10,
    columnSizing: { title: 320 },
  });
  await columns.getByRole('button', { name: 'Reset column widths' }).click();
  await expect
    .poll(() => readStored(extensionWorker, STORAGE_ITEMS.tableLayout))
    .toEqual({ pageSize: 10 });
});

test('the manager opens on the start folder: the last opened one, or a chosen one', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  const last = await seedFolder(extensionWorker, 'E2E Last Opened', [
    { title: 'Last Link', url: 'https://last.e2e.invalid/' },
  ]);
  const chosen = await seedFolder(extensionWorker, 'E2E Chosen Start', [
    { title: 'Chosen Link', url: 'https://chosen.e2e.invalid/' },
  ]);
  const barTitle = await extensionWorker.evaluate(
    async () => (await chrome.bookmarks.getChildren('0'))[0]?.title ?? '',
  );
  // The bookmarks bar by default.
  await page.goto(managerUrl(extensionId));
  await expect(breadcrumbCurrent(page)).toHaveText(barTitle);

  const options = await context.newPage();
  await openOptionsTab(options, extensionId, 'Behavior');
  await expect(options.getByRole('combobox', { name: 'Folder to Start On' })).toHaveCount(0);
  await choose(options, 'Start Folder', 'Last opened folder');
  await expect
    .poll(async () => (await readSettings(extensionWorker)).managerStartFolder)
    .toBe('last');
  expect(await readStored(extensionWorker, STORAGE_ITEMS.deviceSettings)).toMatchObject({
    managerStartFolder: 'last',
  });
  await page.goto(managerUrl(extensionId, last.folderId));
  await expect(managerRow(page, 'Last Link')).toBeVisible();
  await expect
    .poll(() => readStored(extensionWorker, STORAGE_ITEMS.managerLastFolder))
    .toBe(last.folderId);
  await page.goto(managerUrl(extensionId));
  await expect(breadcrumbCurrent(page)).toHaveText('E2E Last Opened');

  await choose(options, 'Start Folder', 'A folder I choose');
  await options.getByRole('combobox', { name: 'Folder to Start On' }).click();
  await options.getByRole('combobox', { name: 'Search...' }).fill('E2E Chosen Start');
  await options.getByRole('option', { name: /E2E Chosen Start$/ }).click();
  await expect
    .poll(async () => (await readSettings(extensionWorker)).managerStartFolderId)
    .toBe(chosen.folderId);
  await page.goto(managerUrl(extensionId));
  await expect(breadcrumbCurrent(page)).toHaveText('E2E Chosen Start');
  // An address that names a folder still opens it.
  await page.goto(managerUrl(extensionId, last.folderId));
  await expect(breadcrumbCurrent(page)).toHaveText('E2E Last Opened');

  // A chosen folder that is gone opens the bookmarks bar.
  await extensionWorker.evaluate((id) => chrome.bookmarks.removeTree(id), chosen.folderId);
  await page.goto(managerUrl(extensionId));
  await expect(breadcrumbCurrent(page)).toHaveText(barTitle);
});

test('cards show the details, size, and limits Options sets, and the preview its details', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Card Details', [
    { title: 'Detailed Card', url: 'https://detailed.e2e.invalid/' },
  ]);
  const id = (seeded.ids as Record<string, string>)['Detailed Card'] as string;
  await writeStored(extensionWorker, STORAGE_ITEMS.bookmarkMetadata, {
    [id]: { tags: ['one', 'two', 'three'], summary: 'A summary of the card' },
  });
  await setSettings(extensionWorker, { managerViewMode: 'cards', cardMaxTags: 1 });
  await page.goto(managerUrl(extensionId, seeded.folderId));
  const grid = page.getByTestId('bookmark-cards');
  const card = grid.locator('[data-slot="bookmark-card"]').filter({ hasText: 'Detailed Card' });
  await expect(card.getByTestId('bookmark-card-placeholder')).toHaveCount(1);
  await expect(card.getByTestId('bookmark-tags')).toContainText('+2');
  await expect(card.getByTestId('bookmark-card-folder')).toHaveCount(0);
  await expect(grid).toHaveAttribute('style', /--card-min-width: 224px/);

  // Options: no cover, the folder path first, large cards; the open manager follows at once.
  const options = await context.newPage();
  await openOptionsTab(options, extensionId, 'Behavior');
  const fields = options.getByTestId('manager-card-fields');
  await fields.getByRole('checkbox', { name: 'Cover' }).click();
  await fields.getByRole('checkbox', { name: 'Folder path' }).click();
  await moveEntry(options, fields, 'Folder path', 'Move to top');
  await options
    .getByRole('radiogroup', { name: 'Card Size' })
    .getByRole('radio', { name: 'Large' })
    .click();
  await expect
    .poll(async () => (await readSettings(extensionWorker)).managerCardFields)
    .toEqual(['folder', 'url', 'tags', 'summary', '!cover']);
  await expect(card.getByTestId('bookmark-card-placeholder')).toHaveCount(0);
  await expect(card.getByTestId('bookmark-card-folder')).toContainText('E2E Card Details');
  await expect(grid).toHaveAttribute('style', /--card-min-width: 296px/);
  // The folder path now comes before the summary.
  const order = await card.evaluate((element) =>
    ['bookmark-card-folder', 'bookmark-card-summary'].map((testId) =>
      Array.from(element.querySelectorAll('[data-testid]')).findIndex(
        (node) => node.getAttribute('data-testid') === testId,
      ),
    ),
  );
  expect(order[0]).toBeLessThan(order[1] as number);

  // The preview: no cover, the summary first.
  const preview = options.getByTestId('preview-fields');
  await preview.getByRole('checkbox', { name: 'Cover', exact: true }).click();
  await moveEntry(options, preview, 'Summary', 'Move to top');
  await expect
    .poll(async () => (await readSettings(extensionWorker)).previewFields)
    .toEqual(['summary', 'folder', 'tags', 'coverSource', '!cover']);
  await card.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('menuitem', { name: 'Preview' }).click();
  const dialog = page.getByTestId('bookmark-preview');
  await expect(dialog.getByTestId('bookmark-preview-summary')).toBeVisible();
  await expect(dialog.getByTestId('bookmark-cover')).toHaveCount(0);
  const previewOrder = await dialog.evaluate((element) =>
    ['bookmark-preview-summary', 'bookmark-preview-folder', 'bookmark-preview-tags'].map((testId) =>
      Array.from(element.querySelectorAll('[data-testid]')).findIndex(
        (node) => node.getAttribute('data-testid') === testId,
      ),
    ),
  );
  expect(previewOrder).toEqual([...previewOrder].sort((a, b) => a - b));
});

test('sidebars keep their dragged and keyed widths, and reopen as left when set to remember', async ({
  context,
  extensionId,
  page,
  extensionWorker,
}) => {
  const options = await context.newPage();
  await openOptionsTab(options, extensionId, 'Behavior');
  await options
    .getByRole('radiogroup', { name: 'Sidebars on Open' })
    .getByRole('radio', { name: 'As I left them' })
    .click();
  await expect
    .poll(async () => (await readSettings(extensionWorker)).managerSidebarsStart)
    .toBe('remember');

  await page.goto(managerUrl(extensionId));
  const folders = page.getByRole('separator', { name: 'Resize folder sidebar' });
  await expect(folders).toHaveAttribute('aria-valuenow', '256');
  // Drag the folder sidebar's edge 80px toward the table.
  const box = await folders.boundingBox();
  if (!box) throw new Error('no handle');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(folders).toHaveAttribute('aria-valuenow', '336');
  await expect
    .poll(async () => (await page.getByTestId('folder-sidebar').boundingBox())?.width)
    .toBe(336);
  // The keys: a step, a big step, and the ends.
  await folders.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(folders).toHaveAttribute('aria-valuenow', '320');
  await page.keyboard.press('End');
  await expect(folders).toHaveAttribute('aria-valuemax', '480');
  await expect(folders).toHaveAttribute('aria-valuenow', '480');
  await page.keyboard.press('Shift+ArrowLeft');
  await expect(folders).toHaveAttribute('aria-valuenow', '416');

  // The Tools sidebar widens toward the table, to the left.
  await page.getByRole('button', { name: 'Show tools' }).click();
  const tools = page.getByRole('separator', { name: 'Resize Tools sidebar' });
  await tools.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(tools).toHaveAttribute('aria-valuenow', '336');
  await page.getByRole('button', { name: 'Hide folders' }).click();
  await expect
    .poll(() => readStored(extensionWorker, STORAGE_ITEMS.managerSidebars))
    .toEqual({ foldersWidth: 416, toolsWidth: 336, toolsOpen: true, foldersOpen: false });

  // Reopened as left, at the widths set.
  await page.reload();
  await expect(page.getByTestId('folder-sidebar')).toHaveAttribute('aria-hidden', 'true');
  await expect(tools).toHaveAttribute('aria-valuenow', '336');
  await page.getByRole('button', { name: 'Show folders' }).click();
  await expect(folders).toHaveAttribute('aria-valuenow', '416');

  // Default reopens them as configured, keeping the widths.
  await setSettings(extensionWorker, { managerSidebarsStart: 'default' });
  await page.getByRole('button', { name: 'Hide tools' }).click();
  await page.reload();
  await expect(page.getByTestId('tools-sidebar')).toHaveAttribute('aria-hidden', 'true');
  await expect(folders).toHaveAttribute('aria-valuenow', '416');
});

test('Manager Order sorts the manager without changing the popup', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  const { folderId } = await seedFolder(extensionWorker, 'E2E Own Order', [
    { title: 'Zeta Item', url: 'https://zeta.e2e.invalid/' },
    { title: 'Alpha Item', url: 'https://alpha.e2e.invalid/' },
    { title: 'Mid Item', url: 'https://mid.e2e.invalid/' },
  ]);
  await page.goto(managerUrl(extensionId, folderId));
  await expect.poll(() => rowTitles(page)).toEqual(['Zeta Item', 'Alpha Item', 'Mid Item']);

  const options = await context.newPage();
  await openOptionsTab(options, extensionId, 'Behavior');
  await choose(options, 'Manager Order', 'Alphabetical');
  await expect.poll(() => rowTitles(page)).toEqual(['Alpha Item', 'Mid Item', 'Zeta Item']);
  const settings = await readSettings(extensionWorker);
  expect(settings).toMatchObject({ managerSortOrder: 'alphabetical' });
  expect(settings.sortOrder).toBeUndefined();

  // The popup keeps the browser's order (Sort Order, at its default).
  const barTitle = await extensionWorker.evaluate(
    async () => (await chrome.bookmarks.getChildren('0'))[0]?.title ?? '',
  );
  const popup = await context.newPage();
  await openPopup(popup, extensionId);
  await folderRow(popup, barTitle).click();
  await folderRow(popup, 'E2E Own Order').click();
  await expect(bookmarkRow(popup, 'Mid Item')).toBeVisible();
  const popupOrder = await popup
    .locator('.bookmark-item')
    .evaluateAll((rows) =>
      rows.map((row) => row.textContent ?? '').filter((text) => text.includes(' Item')),
    );
  expect(popupOrder.map((text) => text.match(/(\w+) Item/)?.[1])).toEqual(['Zeta', 'Alpha', 'Mid']);
});
