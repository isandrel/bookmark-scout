import type { Page, Worker } from '@playwright/test';
import { expect } from './fixtures';

export const SETTINGS_KEY = 'bookmark-scout-settings';
export const SEARCH_HISTORY_KEY = 'bookmark-scout-search-history';

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

export async function setSettings(worker: Worker, updates: Record<string, unknown>) {
  await worker.evaluate(
    async ({ key, values }) => {
      const stored = await chrome.storage.sync.get(key);
      await chrome.storage.sync.set({ [key]: { ...(stored[key] ?? {}), ...values } });
    },
    { key: SETTINGS_KEY, values: updates },
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

export async function openPopup(page: Page, extensionId: string) {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.getByPlaceholder('Search bookmarks...')).toBeVisible();
}
