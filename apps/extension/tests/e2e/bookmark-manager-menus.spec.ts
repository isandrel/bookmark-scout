/**
 * The manager's command menus after Chrome's: right-click on rows (the selection) and on tree
 * folders, the empty-space menu, the header's Organize menu (sort by name, add bookmark, add
 * folder), cut, copy, and paste, and the open commands with their counts.
 */
import type { Page, Worker } from '@playwright/test';
import { type ExtensionBrowser, expect, test, toastRegion } from './fixtures';
import { setSettings } from './storage';

type SeedItem = { title: string; url?: string; children?: SeedItem[] };

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
      const folder = await chrome.bookmarks.create({
        parentId: writableRoot.id,
        title: folderTitle,
      });
      await create(folder.id, entries);
      return { folderId: folder.id, ids };
    },
    { folderTitle: title, entries: items },
  );
}

function managerUrl(extensionId: string, folderId: string) {
  return `chrome-extension://${extensionId}/bookmarks.html?id=${folderId}`;
}

function row(page: Page, title: string) {
  return page.locator('tbody tr').filter({ hasText: title });
}

function childTitles(worker: Worker, folderId: string) {
  return worker.evaluate(
    async (id) => (await chrome.bookmarks.getChildren(id)).map((child) => child.title),
    folderId,
  );
}

const menu = (page: Page) => page.getByRole('menu');

async function menuItemNames(page: Page) {
  return menu(page)
    .getByRole('menuitem')
    .evaluateAll((items) => items.map((item) => item.textContent?.trim() ?? ''));
}

async function waitForNoOverlay(page: Page) {
  await expect(page.locator('[role="dialog"], [role="menu"]')).toHaveCount(0);
}

test.use({ viewport: { width: 1400, height: 900 } });

/** Edge calls private windows InPrivate. */
function privateWindow(browser: ExtensionBrowser) {
  return browser === 'msedge' ? 'InPrivate' : 'incognito';
}

test.beforeEach(async ({ extensionWorker }) => {
  await setSettings(extensionWorker, { confirmBeforeDelete: false, sortOrder: 'alphabetical' });
});

test('right-click acts on the selection, or selects the row clicked', async ({
  extensionBrowser,
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Menu Rows', [
    { title: 'Menu A', url: 'https://e2e.invalid/a' },
    { title: 'Menu B', url: 'https://e2e.invalid/b' },
    { title: 'Menu C', url: 'https://e2e.invalid/c' },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));

  // A right click on an unselected row selects it and offers single-item commands.
  await row(page, 'Menu B').click({ button: 'right', position: { x: 200, y: 10 } });
  await expect(row(page, 'Menu B')).toHaveAttribute('aria-selected', 'true');
  expect(await menuItemNames(page)).toEqual([
    'Edit',
    'View Details',
    'Cut',
    'Copy',
    'Copy Bookmark ID',
    'Open in new tab',
    'Open in new window',
    `Open in ${privateWindow(extensionBrowser)} window`,
    'Delete',
  ]);
  await page.keyboard.press('Escape');
  await waitForNoOverlay(page);

  // With two selected, a right click on one of them acts on both.
  await row(page, 'Menu A').click({ position: { x: 200, y: 10 }, modifiers: ['ControlOrMeta'] });
  await row(page, 'Menu A').click({ button: 'right', position: { x: 200, y: 10 } });
  expect(await menuItemNames(page)).toEqual([
    'Cut',
    'Copy',
    'Open all (2)',
    'Open all (2) in new window',
    `Open all (2) in ${privateWindow(extensionBrowser)} window`,
    'Delete',
  ]);
  await menu(page).getByRole('menuitem', { name: 'Delete' }).click();
  await expect.poll(() => childTitles(extensionWorker, seeded.folderId)).toEqual(['Menu C']);

  // The deletion is one undo step.
  await waitForNoOverlay(page);
  await page.locator('tbody tr').first().focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => childTitles(extensionWorker, seeded.folderId)).toHaveLength(3);
});

test('Open all in new window opens the bookmarks of a folder from the tree', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Menu Tree', [
    {
      title: 'Tree Target',
      children: [
        { title: 'Tree One', url: 'https://e2e.invalid/t1' },
        { title: 'Tree Two', url: 'https://e2e.invalid/t2' },
        { title: 'Tree Sub', children: [{ title: 'Deep', url: 'https://e2e.invalid/deep' }] },
      ],
    },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  const treeFolder = page
    .getByTestId('folder-tree')
    .getByRole('button', { name: 'Tree Target', exact: true });
  await expect(treeFolder).toBeVisible();
  await treeFolder.click({ button: 'right' });
  expect(await menuItemNames(page)).toContain('Rename');
  const windows = () =>
    extensionWorker.evaluate(async () => await chrome.windows.getAll({ populate: true }));
  const before = (await windows()).length;
  // Only the bookmarks directly inside the folder, as in Chrome.
  await menu(page).getByRole('menuitem', { name: 'Open all (2) in new window' }).click();
  await expect.poll(async () => (await windows()).length).toBe(before + 1);
  // Tab URLs need the tabs permission; the count shows the subfolder was left out.
  expect((await windows()).at(-1)?.tabs).toHaveLength(2);

  // Rename from the tree.
  await page.bringToFront();
  await treeFolder.click({ button: 'right' });
  await menu(page).getByRole('menuitem', { name: 'Rename' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit folder' });
  await dialog.getByLabel('Name').fill('Tree Renamed');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => childTitles(extensionWorker, seeded.folderId)).toEqual(['Tree Renamed']);
});

test('cut and copy put URLs on the clipboard; paste moves or copies into a folder', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const seeded = await seedFolder(extensionWorker, 'E2E Menu Clip', [
    { title: 'Clip Box', children: [] },
    { title: 'Clip One', url: 'https://e2e.invalid/one' },
    { title: 'Clip Two', url: 'https://e2e.invalid/two' },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));

  // Copy two bookmarks: their URLs go on the clipboard, one per line.
  await row(page, 'Clip One').click({ position: { x: 200, y: 10 } });
  await row(page, 'Clip Two').click({ position: { x: 200, y: 10 }, modifiers: ['Shift'] });
  await row(page, 'Clip One').click({ button: 'right', position: { x: 200, y: 10 } });
  await menu(page).getByRole('menuitem', { name: 'Copy', exact: true }).click();
  await expect(toastRegion(page).getByText('✓ Copied 2 items', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'https://e2e.invalid/one\nhttps://e2e.invalid/two',
  );

  // Paste into the folder from the tree: copies, and the originals stay.
  await waitForNoOverlay(page);
  const box = page
    .getByTestId('folder-tree')
    .getByRole('button', { name: 'Clip Box', exact: true });
  await box.click({ button: 'right' });
  await menu(page).getByRole('menuitem', { name: 'Paste' }).click();
  await expect
    .poll(() => childTitles(extensionWorker, seeded.ids['Clip Box']))
    .toEqual(['Clip One', 'Clip Two']);
  expect(await childTitles(extensionWorker, seeded.folderId)).toEqual([
    'Clip Box',
    'Clip One',
    'Clip Two',
  ]);

  // Cut one, then paste into the box: it moves, once.
  await waitForNoOverlay(page);
  await row(page, 'Clip Two').click({ position: { x: 200, y: 10 } });
  await row(page, 'Clip Two').click({ button: 'right', position: { x: 200, y: 10 } });
  await menu(page).getByRole('menuitem', { name: 'Cut' }).click();
  await expect(row(page, 'Clip Two')).toBeVisible();
  await waitForNoOverlay(page);
  await box.click({ button: 'right' });
  await menu(page).getByRole('menuitem', { name: 'Paste' }).click();
  await expect
    .poll(() => childTitles(extensionWorker, seeded.folderId))
    .toEqual(['Clip Box', 'Clip One']);
  await expect
    .poll(() => childTitles(extensionWorker, seeded.ids['Clip Box']))
    .toEqual(['Clip One', 'Clip Two', 'Clip Two']);
  await waitForNoOverlay(page);
  await box.click({ button: 'right' });
  expect(await menuItemNames(page)).not.toContain('Paste');
});

test('Organize sorts the folder by name, and adds bookmarks and folders at its end', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Menu Organize', [
    { title: 'Item 10', url: 'https://e2e.invalid/10' },
    { title: 'Zeta Folder', children: [] },
    { title: 'item 2', url: 'https://e2e.invalid/2' },
    { title: 'Alpha Folder', children: [] },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  await page.getByTestId('organize-menu').click();
  await menu(page).getByRole('menuitem', { name: 'Sort by name' }).click();
  await expect
    .poll(() => childTitles(extensionWorker, seeded.folderId))
    .toEqual(['Alpha Folder', 'Zeta Folder', 'item 2', 'Item 10']);
  await expect(
    toastRegion(page).getByText('✓ Folder sorted by name', { exact: true }),
  ).toBeVisible();
  await waitForNoOverlay(page);
  await page.keyboard.press('ControlOrMeta+z');
  await expect
    .poll(() => childTitles(extensionWorker, seeded.folderId))
    .toEqual(['Item 10', 'Zeta Folder', 'item 2', 'Alpha Folder']);

  await page.getByTestId('organize-menu').click();
  await menu(page).getByRole('menuitem', { name: 'Add new bookmark' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add bookmark' });
  await dialog.getByLabel('Name').fill('Added Link');
  await dialog.getByLabel('URL').fill('not a url');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toContainText('Enter a complete URL');
  await dialog.getByLabel('URL').fill('https://e2e.invalid/added');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => childTitles(extensionWorker, seeded.folderId)).toHaveLength(5);
  expect((await childTitles(extensionWorker, seeded.folderId)).at(-1)).toBe('Added Link');

  // The empty space under the rows has its own menu.
  await waitForNoOverlay(page);
  await page.getByTestId('bookmark-table-menu-area').locator('thead').click({ button: 'right' });
  expect(await menuItemNames(page)).toEqual(['Add new bookmark', 'Add new folder', 'Paste']);
  await menu(page).getByRole('menuitem', { name: 'Add new folder' }).click();
  const folderDialog = page.getByRole('dialog', { name: 'Add folder' });
  await folderDialog.getByLabel('Name').fill('Added Folder');
  await folderDialog.getByRole('button', { name: 'Save' }).click();
  await expect
    .poll(async () => (await childTitles(extensionWorker, seeded.folderId)).at(-1))
    .toBe('Added Folder');
});
