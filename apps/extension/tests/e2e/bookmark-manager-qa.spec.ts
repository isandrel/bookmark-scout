import type { Page, Worker } from '@playwright/test';
import { expect, test } from './fixtures';

type SeedItem = { title: string; url?: string; children?: SeedItem[] };

const SETTINGS_KEY = 'bookmark-scout-settings';
const METADATA_KEY = 'bookmark-scout-bookmark-metadata';

/** Creates a folder under the first writable root and returns IDs keyed by title. */
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
      const folder = await chrome.bookmarks.create({ parentId: writableRoot.id, title: folderTitle });
      await create(folder.id, entries);
      return { folderId: folder.id, rootId: writableRoot.id, ids };
    },
    { folderTitle: title, entries: items },
  );
}

async function updateSettings(worker: Worker, patch: Record<string, unknown>) {
  await worker.evaluate(
    async ({ key, values }) => {
      const stored = await chrome.storage.sync.get(key);
      await chrome.storage.sync.set({ [key]: { ...(stored[key] ?? {}), ...values } });
    },
    { key: SETTINGS_KEY, values: patch },
  );
}

function managerUrl(extensionId: string, folderId?: string) {
  const base = `chrome-extension://${extensionId}/bookmarks.html`;
  return folderId ? `${base}?id=${folderId}` : base;
}

function row(page: Page, title: string) {
  return page.locator('tbody tr').filter({ hasText: title });
}

async function openRowMenu(page: Page, title: string) {
  await row(page, title).getByRole('button', { name: 'Open menu' }).click();
  await expect(page.getByRole('menu')).toBeVisible();
}

test.use({ viewport: { width: 1400, height: 900 } });

test('undo after delete restores tags and summaries for the whole subtree', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await updateSettings(extensionWorker, { confirmBeforeDelete: false });
  const seeded = await seedFolder(extensionWorker, 'E2E Metadata Restore', [
    {
      title: 'Tagged Folder',
      children: [{ title: 'Tagged Child', url: 'https://example.com/tagged-child' }],
    },
  ]);
  await extensionWorker.evaluate(
    async ({ key, childId }) => {
      await chrome.storage.local.set({
        [key]: { [childId]: { tags: ['keep-me'], summary: 'Survives undo' } },
      });
    },
    { key: METADATA_KEY, childId: seeded.ids['Tagged Child'] },
  );

  await page.goto(managerUrl(extensionId, seeded.folderId));
  await openRowMenu(page, 'Tagged Folder');
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(row(page, 'Tagged Folder')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(row(page, 'Tagged Folder')).toBeVisible();

  await expect
    .poll(() =>
      extensionWorker.evaluate(
        async ({ key, parentId }) => {
          const [folder] = await chrome.bookmarks.getChildren(parentId);
          const [child] = await chrome.bookmarks.getChildren(folder.id);
          const stored = (await chrome.storage.local.get(key))[key] ?? {};
          return { childTitle: child.title, metadata: stored[child.id] ?? null };
        },
        { key: METADATA_KEY, parentId: seeded.folderId },
      ),
    )
    .toEqual({
      childTitle: 'Tagged Child',
      metadata: { tags: ['keep-me'], summary: 'Survives undo' },
    });
});
