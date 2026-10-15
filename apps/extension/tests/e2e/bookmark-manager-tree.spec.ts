/**
 * The manager's folder tree as an ARIA tree, after Chrome's: one tab stop, the arrow keys, Home
 * and End, Enter and Space, and the account and device headings Chrome shows when it keeps
 * bookmarks in both places.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { OPEN_KEY } from './manager-keys';
import { seedFolder } from './popup-helpers';

function managerUrl(extensionId: string, folderId?: string) {
  const base = `chrome-extension://${extensionId}/bookmarks.html`;
  return folderId ? `${base}?id=${folderId}` : base;
}

const tree = (page: Page) => page.getByRole('tree', { name: 'Folders' });
const item = (page: Page, name: string) => tree(page).getByRole('treeitem', { name, exact: true });

test.use({ viewport: { width: 1400, height: 900 } });

test('the folder tree is one tab stop that the arrow keys, Home, End, Enter, and Space move through', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Tree Keys', [
    { title: 'Tree Alpha', children: [{ title: 'Tree Inner', children: [] }] },
    { title: 'Tree Beta', children: [] },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));

  // The open folder is selected and is the tree's only tab stop.
  const current = item(page, 'E2E Tree Keys');
  await expect(current).toHaveAttribute('aria-selected', 'true');
  await expect(current).toHaveAttribute('aria-expanded', 'true');
  await expect(current).toHaveAttribute('aria-level', '2');
  await expect(tree(page).locator('[role="treeitem"][tabindex="0"]')).toHaveCount(1);
  await expect(current).toHaveAttribute('tabindex', '0');
  await current.focus();

  // Down moves; Right opens a closed folder, then moves into it; Left goes back up and closes.
  await page.keyboard.press('ArrowDown');
  await expect(item(page, 'Tree Alpha')).toBeFocused();
  await expect(item(page, 'Tree Alpha')).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('ArrowRight');
  await expect(item(page, 'Tree Alpha')).toHaveAttribute('aria-expanded', 'true');
  await expect(item(page, 'Tree Alpha')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(item(page, 'Tree Inner')).toBeFocused();
  await expect(item(page, 'Tree Inner')).toHaveAttribute('aria-level', '4');
  await page.keyboard.press('ArrowLeft');
  await expect(item(page, 'Tree Alpha')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(item(page, 'Tree Alpha')).toHaveAttribute('aria-expanded', 'false');
  await expect(item(page, 'Tree Inner')).toHaveCount(0);

  // Moving focus does not open the folder; the open key does (Enter, or Cmd+O on a Mac, where
  // Enter renames as on the table's rows), and focus stays in the tree.
  await expect(page).toHaveURL(new RegExp(`id=${seeded.folderId}$`));
  await page.keyboard.press(OPEN_KEY);
  await expect(page).toHaveURL(new RegExp(`id=${seeded.ids['Tree Alpha']}$`));
  await expect(item(page, 'Tree Alpha')).toHaveAttribute('aria-selected', 'true');
  await expect(item(page, 'Tree Alpha')).toBeFocused();

  // Home reaches the top level, which Space opens; End reaches the last row.
  await page.keyboard.press('Home');
  await expect(item(page, 'Bookmarks')).toBeFocused();
  await page.keyboard.press(' ');
  await expect(page).not.toHaveURL(/id=/);
  await page.keyboard.press('End');
  await expect(tree(page).getByRole('treeitem').last()).toBeFocused();

  // Tab leaves the tree from the row last focused, and Shift+Tab comes back to it.
  await page.keyboard.press('Tab');
  await expect(tree(page).getByRole('treeitem').last()).not.toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(tree(page).getByRole('treeitem').last()).toBeFocused();
});

test('account and device bookmarks sit under two headings, the device ones closed', async ({
  extensionId,
  page,
}) => {
  // Chrome keeps both kinds once account storage is on; the test browser has no account, so the
  // page's tree read marks the folders as synced and adds a device-only bookmarks bar.
  await page.addInitScript(() => {
    const getTree = chrome.bookmarks.getTree.bind(chrome.bookmarks);
    Object.defineProperty(chrome.bookmarks, 'getTree', {
      configurable: true,
      value: async () => {
        const nodes = await getTree();
        const children = nodes[0]?.children ?? [];
        for (const child of children) Object.assign(child, { syncing: true });
        children.push({
          id: 'e2e-device-bar',
          parentId: nodes[0]?.id,
          index: children.length,
          title: 'Device Bar',
          folderType: 'bookmarks-bar',
          syncing: false,
          children: [
            {
              id: 'e2e-device-folder',
              parentId: 'e2e-device-bar',
              index: 0,
              title: 'Device Folder',
              syncing: false,
              children: [],
            },
          ],
        } as unknown as chrome.bookmarks.BookmarkTreeNode);
        return nodes;
      },
    });
  });
  await page.goto(managerUrl(extensionId));

  const account = item(page, 'In your account');
  const device = item(page, 'Only on this device');
  await expect(account).toHaveAttribute('aria-expanded', 'true');
  await expect(account).not.toHaveAttribute('aria-selected');
  await expect(device).toHaveAttribute('aria-expanded', 'false');
  await expect(item(page, 'Device Bar')).toHaveCount(0);
  // Chrome's bookmarks bar is id 1; its title differs between platforms.
  const bar = tree(page).locator('[role="treeitem"][data-folder-id="1"]');
  await expect(bar).toHaveAttribute('aria-level', '2');

  // Opened without a folder, the page shows the account's bookmarks bar.
  await expect(page).toHaveURL(/\?id=1$/);
  const opened = page.url();

  // A heading opens and closes; it is not a folder to show.
  await device.click();
  await expect(device).toHaveAttribute('aria-expanded', 'true');
  await expect(item(page, 'Device Bar')).toBeVisible();
  await expect(page).toHaveURL(opened);
  await device.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(item(page, 'Device Bar')).toHaveCount(0);
});
