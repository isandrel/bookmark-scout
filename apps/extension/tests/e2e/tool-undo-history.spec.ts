/**
 * A Tools sidebar batch is one entry in the manager's undo history: Ctrl/Cmd+Z undoes it (after
 * a reload too) and Ctrl/Cmd+Shift+Z redoes it, and the outcome toast's Undo reverts the same
 * entry, so the two can never revert it twice.
 */
import type { Page } from '@playwright/test';
import { expect, test, toastRegion } from './fixtures';
import { childrenOf, openTools, seedFolder, setSettings, toolCard } from './tool-helpers';

/** Gives the manager's grid the keyboard focus its undo and redo keys act from. */
async function focusGrid(page: Page) {
  await page.locator('tbody tr').first().focus();
}

test('Ctrl/Cmd+Z undoes a Duplicate Cleaner batch after a reload, and redo removes it again', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'E2E Tool History', [
    { title: 'A1', url: 'https://e2e.invalid/a' },
    { title: 'A2', url: 'https://e2e.invalid/a' },
    { title: 'A3', url: 'https://e2e.invalid/a' },
    { title: 'B1', url: 'https://e2e.invalid/b' },
  ]);
  await setSettings(extensionWorker, { duplicatesKeepRule: 'first' });
  const titles = async () =>
    (await childrenOf(extensionWorker, folder.folderId)).map((item) => item.title);

  await openTools(page, extensionId, folder.folderId);
  await toolCard(page, 'Duplicate Cleaner').getByRole('button', { name: 'Scan' }).click();
  const dialog = page.getByRole('dialog', { name: 'Duplicate Cleaner' });
  await expect(dialog).toContainText('A3');
  await dialog.getByRole('button', { name: 'Remove duplicates' }).click();
  await expect.poll(titles).toEqual(['A1', 'B1']);
  // The outcome toast shows once the batch and its history entry are written.
  await expect(toastRegion(page).getByRole('button', { name: 'Undo', exact: true })).toBeVisible();

  await page.reload();
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await focusGrid(page);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(titles).toEqual(['A1', 'A2', 'A3', 'B1']);
  await expect(
    toastRegion(page).getByText('✓ Undone: Delete 2 items (Duplicate Cleaner)', { exact: true }),
  ).toBeVisible();

  await focusGrid(page);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(titles).toEqual(['A1', 'B1']);
});

test("a URL Cleaner toast's Undo and Ctrl/Cmd+Z share one history entry", async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'E2E Tool Toast History', [
    { title: 'Tracked', url: 'https://e2e.invalid/t?utm_source=x' },
  ]);
  await setSettings(extensionWorker, { urlCleanerDefaultScope: 'folder' });
  const urls = async () =>
    (await childrenOf(extensionWorker, folder.folderId)).map((item) => item.url);

  await openTools(page, extensionId, folder.folderId);
  await toolCard(page, 'URL Cleaner').getByRole('button', { name: 'Clean' }).click();
  const preview = page.getByRole('dialog', { name: 'URL Cleaner' });
  await expect(preview.getByText('1 bookmark can be cleaned')).toBeVisible();
  await preview.getByRole('button', { name: 'Apply Changes' }).click();
  await expect.poll(urls).toEqual(['https://e2e.invalid/t']);

  await toastRegion(page).getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(urls).toEqual(['https://e2e.invalid/t?utm_source=x']);

  // The toast's Undo used the history entry: nothing is left to undo, and redo cleans it again.
  await focusGrid(page);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(toastRegion(page).getByText('Nothing to undo', { exact: true })).toBeVisible();
  expect(await urls()).toEqual(['https://e2e.invalid/t?utm_source=x']);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(urls).toEqual(['https://e2e.invalid/t']);
});
