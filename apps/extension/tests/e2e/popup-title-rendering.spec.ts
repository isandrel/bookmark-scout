import type { Page, Worker } from '@playwright/test';
import { expect, test } from './fixtures';

const SETTINGS_KEY = 'bookmark-scout-settings';
const BOOKMARK_PAYLOAD = '<img src=x onerror=alert(1)><style>*{display:none}</style>';
const FOLDER_PAYLOAD = '<style>.accordion-container{display:none}</style>Harmless folder';

async function seed(worker: Worker) {
  return worker.evaluate(
    async ({ bookmarkTitle, folderTitle }) => {
      const [root] = await chrome.bookmarks.getTree();
      const bar = root.children?.find((node) => node.children !== undefined);
      if (!bar) throw new Error('No writable bookmark root found');
      const folder = await chrome.bookmarks.create({ parentId: bar.id, title: folderTitle });
      const bookmark = await chrome.bookmarks.create({
        parentId: folder.id,
        title: bookmarkTitle,
        url: 'https://e2e.invalid/payload',
      });
      await chrome.bookmarks.create({
        parentId: folder.id,
        title: 'Tom & Jerry <b>not bold</b>',
        url: 'https://e2e.invalid/amp',
      });
      return { barTitle: bar.title, folderId: folder.id, bookmarkId: bookmark.id };
    },
    { bookmarkTitle: BOOKMARK_PAYLOAD, folderTitle: FOLDER_PAYLOAD },
  );
}

async function openPopup(page: Page, extensionId: string) {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.getByPlaceholder('Search bookmarks...')).toBeVisible();
}

test('bookmark and folder titles containing markup render as literal text', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const dialogs: string[] = [];
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  const payloadRequests: string[] = [];
  page.on('request', (request) => {
    if (/\/x$/.test(request.url())) payloadRequests.push(request.url());
  });

  const seeded = await seed(extensionWorker);
  await openPopup(page, extensionId);

  await page.locator('.folder-item').filter({ hasText: seeded.barTitle }).first().click();
  const folderRow = page.locator('.folder-item').filter({ hasText: 'Harmless folder' }).first();
  await expect(folderRow).toBeVisible();
  await expect(folderRow.getByText(FOLDER_PAYLOAD, { exact: true })).toBeVisible();
  await expect(page.locator('.accordion-container')).toBeVisible();

  await folderRow.click();
  const bookmarkRow = page.locator('.bookmark-item').filter({ hasText: 'onerror' });
  await expect(bookmarkRow.getByText(BOOKMARK_PAYLOAD, { exact: true })).toBeVisible();
  await expect(bookmarkRow.getByText(BOOKMARK_PAYLOAD, { exact: true })).toHaveAttribute(
    'title',
    BOOKMARK_PAYLOAD,
  );
  await expect(page.locator('.accordion-container img[src="x"]')).toHaveCount(0);
  await expect(page.locator('.accordion-container style')).toHaveCount(0);
  await expect(page.getByText('Tom & Jerry <b>not bold</b>', { exact: true })).toBeVisible();

  // Highlighting wraps matches in <mark> without re-interpreting the rest of the title.
  const search = page.getByPlaceholder('Search bookmarks...');
  await search.fill('style');
  const match = page.locator('.bookmark-item').filter({ hasText: 'onerror' });
  await expect(match).toBeVisible();
  await expect(match.locator('mark')).toHaveText(['style', 'style']);
  await expect(match.locator('[title]').first()).toHaveText(BOOKMARK_PAYLOAD);

  await search.fill('&');
  await expect(
    page.locator('.bookmark-item').filter({ hasText: 'Tom & Jerry' }).locator('mark'),
  ).toHaveText('&');
  await search.fill('<b>');
  const angle = page.locator('.bookmark-item').filter({ hasText: 'Tom & Jerry' });
  await expect(angle.locator('mark')).toHaveText('<b>');
  await expect(angle.locator('b')).toHaveCount(0);

  // The delete confirmation shows the exact title instead of a stripped one.
  await extensionWorker.evaluate(async (key) => {
    const stored = await chrome.storage.sync.get(key);
    await chrome.storage.sync.set({ [key]: { ...(stored[key] ?? {}), confirmBeforeDelete: true } });
  }, SETTINGS_KEY);
  await search.fill('onerror');
  await match.hover();
  await match.getByTitle('Delete bookmark').click();
  const dialog = page.getByRole('dialog', { name: 'Delete bookmark' });
  await expect(dialog).toContainText(BOOKMARK_PAYLOAD);
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  expect(dialogs).toEqual([]);
  expect(payloadRequests).toEqual([]);
});
