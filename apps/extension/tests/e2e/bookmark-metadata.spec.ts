import type { Page, Worker } from '@playwright/test';
import { expect, test } from './fixtures';

const METADATA_KEY = 'bookmark-scout-bookmark-metadata';

type SeedItem = { title: string; url: string };

async function seedFolders(worker: Worker, items: SeedItem[]) {
  return worker.evaluate(async (entries) => {
    const [root] = await chrome.bookmarks.getTree();
    const writableRoot = root.children?.find((node) => node.children !== undefined);
    if (!writableRoot) throw new Error('No writable bookmark root found');

    const source = await chrome.bookmarks.create({
      parentId: writableRoot.id,
      title: 'E2E Metadata',
    });
    const target = await chrome.bookmarks.create({
      parentId: writableRoot.id,
      title: 'E2E Metadata Target',
    });
    const ids: Record<string, string> = {};
    for (const entry of entries) {
      const created = await chrome.bookmarks.create({ parentId: source.id, ...entry });
      ids[entry.title] = created.id;
    }
    return { sourceId: source.id, targetId: target.id, ids };
  }, items);
}

async function readMetadata(worker: Worker) {
  return worker.evaluate(async (key) => {
    const stored = await chrome.storage.local.get(key);
    return (stored[key] ?? {}) as Record<string, { tags?: string[]; summary?: string }>;
  }, METADATA_KEY);
}

async function openDetails(page: Page, extensionId: string, folderId: string, title: string) {
  await page.goto(`chrome-extension://${extensionId}/bookmarks.html?id=${folderId}`);
  const row = page.locator('tbody tr').filter({ hasText: title });
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('menuitem', { name: 'View Details' }).click();
  const dialog = page.getByRole('dialog', { name: 'Bookmark Details' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('saves, edits, and clears bookmark tags and summaries without AI', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const title = 'Metadata Bookmark';
  const seeded = await seedFolders(extensionWorker, [
    { title, url: 'https://e2e.invalid/metadata-editor' },
  ]);
  const bookmarkId = seeded.ids[title];

  let dialog = await openDetails(page, extensionId, seeded.sourceId, title);
  const tags = dialog.getByTestId('bookmark-metadata-tags');
  const summary = dialog.getByTestId('bookmark-metadata-summary');
  await expect(tags).toBeEnabled();
  await tags.fill('research, Research,  tools ');
  await summary.fill('A private summary.');
  await dialog.getByRole('button', { name: 'Save Metadata' }).click();
  await expect(dialog.getByText('Metadata saved.')).toBeVisible();
  await expect(tags).toHaveValue('research, tools');

  expect((await readMetadata(extensionWorker))[bookmarkId]).toEqual({
    tags: ['research', 'tools'],
    summary: 'A private summary.',
  });

  // Moving keeps the bookmark ID, so metadata follows the bookmark across folders and reloads.
  await extensionWorker.evaluate(
    async ({ id, parentId }) => {
      await chrome.bookmarks.move(id, { parentId });
    },
    { id: bookmarkId, parentId: seeded.targetId },
  );
  dialog = await openDetails(page, extensionId, seeded.targetId, title);
  await expect(dialog.getByTestId('bookmark-metadata-tags')).toHaveValue('research, tools');
  await expect(dialog.getByTestId('bookmark-metadata-summary')).toHaveValue('A private summary.');

  await dialog.getByTestId('bookmark-metadata-tags').fill('reading');
  await dialog.getByRole('button', { name: 'Save Metadata' }).click();
  await expect(dialog.getByText('Metadata saved.')).toBeVisible();
  expect((await readMetadata(extensionWorker))[bookmarkId]).toEqual({
    tags: ['reading'],
    summary: 'A private summary.',
  });

  await dialog.getByRole('button', { name: 'Clear Metadata' }).click();
  await expect(dialog.getByText('Metadata cleared.')).toBeVisible();
  await expect(dialog.getByTestId('bookmark-metadata-tags')).toHaveValue('');
  await expect(dialog.getByTestId('bookmark-metadata-summary')).toHaveValue('');
  expect(await readMetadata(extensionWorker)).not.toHaveProperty(bookmarkId);
});

test('removes stored metadata when its bookmark is deleted', async ({ extensionWorker }) => {
  const seeded = await seedFolders(extensionWorker, [
    { title: 'Deleted Bookmark', url: 'https://e2e.invalid/deleted' },
    { title: 'Kept Bookmark', url: 'https://e2e.invalid/kept' },
  ]);
  const deletedId = seeded.ids['Deleted Bookmark'];
  const keptId = seeded.ids['Kept Bookmark'];

  await extensionWorker.evaluate(
    async ({ key, value }) => {
      await chrome.storage.local.set({ [key]: value });
    },
    {
      key: METADATA_KEY,
      value: { [deletedId]: { tags: ['gone'] }, [keptId]: { summary: 'Still here' } },
    },
  );

  await extensionWorker.evaluate(async (id) => {
    await chrome.bookmarks.remove(id);
  }, deletedId);

  await expect
    .poll(async () => readMetadata(extensionWorker))
    .toEqual({
      [keptId]: { summary: 'Still here' },
    });
});
