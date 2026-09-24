import type { Locator, Page, Worker } from '@playwright/test';

export type SeedItem = { title: string; url?: string; children?: SeedItem[] };

/** Creates a folder of bookmarks under the first writable root and returns their IDs by title. */
export async function seedFolder(worker: Worker, title: string, items: SeedItem[]) {
  return worker.evaluate(
    async ({ folderTitle, entries }) => {
      const [root] = await chrome.bookmarks.getTree();
      const writableRoot = root.children?.find((node) => node.children !== undefined);
      if (!writableRoot) throw new Error('No writable bookmark root found');
      const folder = await chrome.bookmarks.create({
        parentId: writableRoot.id,
        title: folderTitle,
      });
      const ids: Record<string, string> = {};
      const createItems = async (parentId: string, nodes: typeof entries) => {
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
      return { folderId: folder.id, ids };
    },
    { folderTitle: title, entries: items },
  );
}

export async function setSettings(worker: Worker, updates: Record<string, unknown>) {
  await worker.evaluate(async (values) => {
    const key = 'bookmark-scout-settings';
    const stored = await chrome.storage.sync.get(key);
    await chrome.storage.sync.set({ [key]: { ...(stored[key] ?? {}), ...values } });
  }, updates);
}

export async function childrenOf(worker: Worker, folderId: string) {
  return worker.evaluate(async (id) => {
    const children = await chrome.bookmarks.getChildren(id);
    return children.map((item) => ({ id: item.id, title: item.title, url: item.url }));
  }, folderId);
}

export function toolCard(page: Page, title: string): Locator {
  return page
    .getByRole('heading', { name: title, exact: true })
    .locator('..')
    .locator('..')
    .locator('..')
    .locator('..');
}

export async function openTools(page: Page, extensionId: string, folderId: string) {
  await page.goto(`chrome-extension://${extensionId}/bookmarks.html?id=${folderId}`);
  await page.getByTitle('Show tools').click();
}
