import type { Page, Worker } from '@playwright/test';
import { expect } from './fixtures';

export { setSettings } from './storage';

export type SeedItem = { title: string; url?: string; children?: SeedItem[] };

/** Create a folder of items in the first writable permanent folder and return their ids. */
export async function seedFolder(worker: Worker, title: string, items: SeedItem[]) {
  return worker.evaluate(
    async ({ folderTitle, entries }) => {
      const [root] = await chrome.bookmarks.getTree();
      const bar = root.children?.find((node) => node.children !== undefined);
      if (!bar) throw new Error('No writable bookmark root found');

      const folder = await chrome.bookmarks.create({ parentId: bar.id, title: folderTitle });
      const ids: Record<string, string> = {};
      const createItems = async (parentId: string, nodes: SeedItem[]) => {
        for (const node of nodes) {
          const created = await chrome.bookmarks.create({
            parentId,
            title: node.title,
            ...(node.url ? { url: node.url } : {}),
          });
          ids[node.title] = created.id;
          if (node.children) await createItems(created.id, node.children);
        }
      };

      await createItems(folder.id, entries);
      return { folderId: folder.id, barId: bar.id, barTitle: bar.title, ids };
    },
    { folderTitle: title, entries: items },
  );
}

export async function childTitles(worker: Worker, folderId: string): Promise<string[]> {
  return worker.evaluate(
    async (id) => (await chrome.bookmarks.getChildren(id)).map((node) => node.title),
    folderId,
  );
}

export function folderRow(page: Page, title: string) {
  return page.locator('.folder-item').filter({ hasText: title }).first();
}

export function bookmarkRow(page: Page, title: string) {
  return page.locator('.bookmark-item').filter({ hasText: title });
}

/**
 * The id of the folder the popup tree shows the row of `nodeId` in: the closest row above it one
 * level up. The tree is a flat list of rows with ARIA levels, so nesting is read from those.
 */
export async function popupTreeParentId(page: Page, nodeId: string): Promise<string | null> {
  return page.getByRole('tree').evaluate((tree, id) => {
    const rows = [...tree.querySelectorAll('[role="treeitem"][data-tree-row-id]')].map((row) => ({
      id: row.getAttribute('data-tree-row-id'),
      level: Number(row.getAttribute('aria-level')),
    }));
    const index = rows.findIndex((row) => row.id === id);
    for (let above = index - 1; index >= 0 && above >= 0; above -= 1) {
      if (rows[above].level === rows[index].level - 1) return rows[above].id;
    }
    return null;
  }, nodeId);
}

/**
 * Turns a search option (Match Case, Match Whole Word, pattern search) on or off from the search
 * box's options menu, then closes the menu, which returns focus to the search box.
 */
export async function toggleSearchOption(page: Page, name: string | RegExp) {
  await page.getByTestId('search-options').click();
  const item = page.getByRole('menuitemcheckbox', { name });
  const before = await item.getAttribute('aria-checked');
  await item.click();
  await expect(item).toHaveAttribute('aria-checked', before === 'true' ? 'false' : 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
}

export async function openPopup(page: Page, extensionId: string) {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  // By its label: a header full of buttons (AI on) shortens the placeholder.
  await expect(
    page.getByRole('combobox', { name: 'Search bookmarks, or type a folder name' }),
  ).toBeVisible();
}

/**
 * Title of the second permanent folder: "Other bookmarks" in Chromium, "Other favorites" in Edge.
 * Read from the browser so assertions do not depend on one browser's folder names.
 */
export async function otherBookmarksTitle(worker: Worker): Promise<string> {
  return worker.evaluate(async () => {
    const [root] = await chrome.bookmarks.getTree();
    const title = root.children?.[1]?.title;
    if (!title) throw new Error('Second permanent bookmark folder not found');
    return title;
  });
}
