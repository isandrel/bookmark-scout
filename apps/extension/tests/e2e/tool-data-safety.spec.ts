import { expect, test } from './fixtures';
import { childrenOf, openTools, seedFolder, setSettings, toolCard } from './tool-helpers';

test('duplicate cleaner keeps the newest item it labels Keep and ignores case, port, and query-order lookalikes', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'E2E Dup Rules', [
    { title: 'Old Copy', url: 'https://e2e.invalid/same' },
    { title: 'New Copy', url: 'https://e2e.invalid/same' },
    { title: 'Upper Path', url: 'https://e2e.invalid/Docs/Readme' },
    { title: 'Lower Path', url: 'https://e2e.invalid/docs/readme' },
    { title: 'Port 8080', url: 'http://localhost:8080/app' },
    { title: 'Port 3000', url: 'http://localhost:3000/app' },
  ]);
  await setSettings(extensionWorker, {
    duplicatesKeepRule: 'newest',
    duplicatesDefaultScope: 'all',
  });

  await openTools(page, extensionId, folder.folderId);
  await toolCard(page, 'Duplicate Cleaner').getByRole('button', { name: 'Scan' }).click();
  const dialog = page.getByRole('dialog', { name: 'Duplicate Cleaner' });
  await expect(dialog.getByText(/^1 duplicate groups? found/)).toBeVisible();
  const keptRow = dialog.getByText('Keep', { exact: true }).locator('..');
  const keptTitle = (await keptRow.locator('span.font-medium').textContent()) ?? '';
  await dialog.getByRole('button', { name: 'Remove duplicates' }).click();

  await expect
    .poll(async () => (await childrenOf(extensionWorker, folder.folderId)).length)
    .toBe(5);
  const titles = (await childrenOf(extensionWorker, folder.folderId)).map((item) => item.title);
  expect(titles).toContain(keptTitle);
  expect(titles).toEqual(
    expect.arrayContaining(['Upper Path', 'Lower Path', 'Port 8080', 'Port 3000']),
  );
  expect(titles.filter((title) => title.endsWith('Copy'))).toEqual([keptTitle]);
});

test('duplicate removal reports partial results, refreshes the dialog, and undo restores removed items', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'E2E Dup Partial', [
    { title: 'A1', url: 'https://e2e.invalid/a' },
    { title: 'A2', url: 'https://e2e.invalid/a' },
    { title: 'A3', url: 'https://e2e.invalid/a' },
    { title: 'B1', url: 'https://e2e.invalid/b' },
    { title: 'B2', url: 'https://e2e.invalid/b' },
  ]);
  await setSettings(extensionWorker, { duplicatesKeepRule: 'first' });

  await openTools(page, extensionId, folder.folderId);
  await toolCard(page, 'Duplicate Cleaner').getByRole('button', { name: 'Scan' }).click();
  const dialog = page.getByRole('dialog', { name: 'Duplicate Cleaner' });
  await expect(dialog).toContainText('A3');

  // Changes made elsewhere after the scan: one extra deleted, one extra edited.
  await extensionWorker.evaluate(
    async ({ removeId, editId }) => {
      await chrome.bookmarks.remove(removeId);
      await chrome.bookmarks.update(editId, { url: 'https://e2e.invalid/edited' });
    },
    { removeId: folder.ids.A2, editId: folder.ids.B2 },
  );
  await dialog.getByRole('button', { name: 'Remove duplicates' }).click();

  await expect(page.getByText('Some duplicates were not removed', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('status')).toContainText(/Removed: 1\. .*: 2\. Failed: 0\./);
  await expect
    .poll(async () => (await childrenOf(extensionWorker, folder.folderId)).length)
    .toBe(3);
  const remaining = (await childrenOf(extensionWorker, folder.folderId)).map((item) => item.title);
  expect(remaining.sort()).toEqual(['A1', 'B1', 'B2']);
  // The dialog was rescanned against the live tree and no longer lists removed items.
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('No duplicate bookmarks found.')).toBeVisible();

  await dialog.getByRole('button', { name: 'Undo' }).click();
  await expect
    .poll(async () => (await childrenOf(extensionWorker, folder.folderId)).length)
    .toBe(4);
  const restored = await childrenOf(extensionWorker, folder.folderId);
  expect(restored.map((item) => item.title)).toEqual(['A1', 'A3', 'B1', 'B2']);
});

test('duplicate removal never deletes the last copy when the kept item was moved to another URL', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'E2E Dup Keeper Changed', [
    { title: 'K1', url: 'https://e2e.invalid/keep' },
    { title: 'K2', url: 'https://e2e.invalid/keep' },
  ]);
  await setSettings(extensionWorker, { duplicatesKeepRule: 'first' });

  await openTools(page, extensionId, folder.folderId);
  await toolCard(page, 'Duplicate Cleaner').getByRole('button', { name: 'Scan' }).click();
  const dialog = page.getByRole('dialog', { name: 'Duplicate Cleaner' });
  await expect(dialog.getByText('Keep', { exact: true })).toBeVisible();

  await extensionWorker.evaluate(async (id) => {
    await chrome.bookmarks.update(id, { url: 'https://e2e.invalid/elsewhere' });
  }, folder.ids.K1);
  await dialog.getByRole('button', { name: 'Remove duplicates' }).click();

  await expect(page.getByText('Some duplicates were not removed', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('status')).toContainText(
    'Removed: 0. Skipped because they changed or were already removed: 1. Failed: 0. 1 group was left untouched because the kept bookmark was changed or removed after the scan.',
  );
  const remaining = await childrenOf(extensionWorker, folder.folderId);
  expect(remaining.map((item) => [item.title, item.url])).toEqual([
    ['K1', 'https://e2e.invalid/elsewhere'],
    ['K2', 'https://e2e.invalid/keep'],
  ]);
});

test('duplicate cleaner warns before title-only matching removes bookmarks with different URLs', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'E2E Dup Title Only', [
    { title: 'Home', url: 'https://e2e.invalid/home-a' },
    { title: 'home', url: 'https://e2e.invalid/home-b' },
    { title: 'Docs', url: 'https://e2e.invalid/docs' },
    { title: 'Docs', url: 'https://e2e.invalid/docs' },
  ]);
  await setSettings(extensionWorker, {
    duplicatesMatchStrategy: 'title_only',
    duplicatesDefaultScope: 'all',
  });

  await openTools(page, extensionId, folder.folderId);
  const scan = toolCard(page, 'Duplicate Cleaner').getByRole('button', { name: 'Scan' });
  await scan.click();
  const dialog = page.getByRole('dialog', { name: 'Duplicate Cleaner' });
  await expect(dialog.getByRole('alert')).toHaveText(
    "Title-only matching grouped bookmarks with different URLs in 1 group. Removing duplicates deletes those other pages' bookmarks; review them first.",
  );
  await expect(dialog.getByText('Different URLs', { exact: true })).toHaveCount(1);
  await page.keyboard.press('Escape');

  await setSettings(extensionWorker, { duplicatesMatchStrategy: 'normalized_url' });
  await scan.click();
  await expect(dialog.getByText('Keep', { exact: true })).toHaveCount(1);
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog.getByText('Different URLs', { exact: true })).toHaveCount(0);
  expect(await childrenOf(extensionWorker, folder.folderId)).toHaveLength(4);
});

test('URL cleaner keeps URL encoding, ignores pure reordering, and skips bookmarks edited after the preview', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'E2E Cleaner Safety', [
    { title: 'Encoded', url: 'https://e2e.invalid/p?q=a%20b&amp&utm_source=x' },
    { title: 'Reordered', url: 'https://e2e.invalid/r?b=2&a=1' },
    { title: 'Edited Later', url: 'https://e2e.invalid/e?utm_source=x' },
  ]);
  await setSettings(extensionWorker, {
    urlCleanerSortQueryParams: true,
    urlCleanerRemoveHash: false,
    urlCleanerDefaultScope: 'folder',
  });

  await openTools(page, extensionId, folder.folderId);
  await toolCard(page, 'URL Cleaner').getByRole('button', { name: 'Clean' }).click();
  const preview = page.getByRole('dialog', { name: 'URL Cleaner' });
  await expect(preview.getByText('2 bookmarks can be cleaned')).toBeVisible();
  await expect(preview).not.toContainText('Reordered');
  await expect(preview).toContainText('https://e2e.invalid/p?amp&q=a%20b');

  await extensionWorker.evaluate(async (id) => {
    await chrome.bookmarks.update(id, { url: 'https://e2e.invalid/e?utm_source=kept-by-user' });
  }, folder.ids['Edited Later']);
  await preview.getByRole('button', { name: 'Apply Changes' }).click();

  await expect(page.getByText('Some URLs were not cleaned', { exact: true })).toBeVisible();
  await expect
    .poll(async () =>
      Object.fromEntries(
        (await childrenOf(extensionWorker, folder.folderId)).map((item) => [item.title, item.url]),
      ),
    )
    .toEqual({
      Encoded: 'https://e2e.invalid/p?amp&q=a%20b',
      Reordered: 'https://e2e.invalid/r?b=2&a=1',
      'Edited Later': 'https://e2e.invalid/e?utm_source=kept-by-user',
    });
});
