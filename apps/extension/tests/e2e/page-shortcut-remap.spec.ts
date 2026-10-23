/**
 * Options > Behavior > Manager and popup shortcuts: changing an in-page shortcut's keys, which the
 * manager and the popup then answer and name, refusing keys another shortcut has, and Reset.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openOptionsTab } from './options-helpers';
import { openPopup, seedFolder } from './popup-helpers';
import { readSettings } from './storage';

function managerUrl(extensionId: string, folderId: string) {
  return `chrome-extension://${extensionId}/bookmarks.html?id=${folderId}`;
}

/** Index of the table row that holds keyboard focus, or -1. */
function focusedRowIndex(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('main tbody tr')).findIndex((row) =>
      row.contains(document.activeElement),
    ),
  );
}

function shortcutRow(page: Page, id: string) {
  return page.locator(`[data-shortcut="${id}"]`);
}

/** Records `keys` as the new keys of the shortcut `id` with its Change button. */
async function changeShortcut(page: Page, id: string, keys: string) {
  const row = shortcutRow(page, id);
  await row.getByRole('button', { name: /^Change the keys for / }).click();
  await expect(row.locator('[data-slot="page-shortcut-recorder"]')).toBeFocused();
  await page.keyboard.press(keys);
}

const keysOf = (page: Page, id: string) =>
  shortcutRow(page, id).locator('[data-slot="page-shortcut-keys"]');

const storedOverrides = async (worker: Parameters<typeof readSettings>[0]) =>
  (await readSettings(worker)).pageShortcutOverrides;

test.describe('changing in-page shortcuts in Options', () => {
  test('a manager shortcut changed in Options works with its new key, the old one no longer does, and the help names it', async ({
    extensionId,
    extensionWorker,
    page,
  }) => {
    const seeded = await seedFolder(extensionWorker, 'E2E Remap Keys', [
      { title: 'Remap Link One', url: 'https://e2e.invalid/remap-one' },
      { title: 'Remap Link Two', url: 'https://e2e.invalid/remap-two' },
    ]);
    await openOptionsTab(page, extensionId, 'Behavior');
    await expect(keysOf(page, 'manager.next_row')).toHaveText('j');
    await changeShortcut(page, 'manager.next_row', 'n');
    await expect(keysOf(page, 'manager.next_row')).toHaveText('n');
    await expect
      .poll(() => storedOverrides(extensionWorker))
      .toEqual({ 'manager.next_row': [{ key: 'n' }] });

    await page.goto(managerUrl(extensionId, seeded.folderId));
    await expect(page.locator('tbody tr')).toHaveCount(2);
    await page.keyboard.press('j');
    expect(await focusedRowIndex(page)).toBe(-1);
    await page.keyboard.press('n');
    await expect.poll(() => focusedRowIndex(page)).toBe(0);
    await page.keyboard.press('n');
    await expect.poll(() => focusedRowIndex(page)).toBe(1);
    await page.keyboard.press('k');
    await expect.poll(() => focusedRowIndex(page)).toBe(0);

    await page.keyboard.press('Shift+?');
    const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(dialog).toBeVisible();
    const rowKeys = await dialog.evaluate((element) => {
      const term = Array.from(element.querySelectorAll('dd')).find(
        (definition) => definition.textContent === 'Move to the next or previous row',
      )?.previousElementSibling;
      return Array.from(term?.querySelectorAll('kbd') ?? []).map((key) => key.textContent);
    });
    expect(rowKeys).toEqual(['n', 'k']);
  });

  test('Options refuses keys another shortcut has, and Reset gives the configured keys back', async ({
    extensionId,
    extensionWorker,
    page,
  }) => {
    await openOptionsTab(page, extensionId, 'Behavior');
    const panel = page.getByTestId('page-shortcuts');
    const resetAll = panel.getByRole('button', { name: 'Reset all shortcuts' });
    await expect(resetAll).toBeDisabled();

    // k is Move to the previous row's.
    await changeShortcut(page, 'manager.preview', 'k');
    const preview = shortcutRow(page, 'manager.preview');
    await expect(preview.getByRole('alert')).toHaveText(
      'Already used by “Move to the previous row”.',
    );
    // Keys the lists and trees answer are refused too.
    await page.keyboard.press('Home');
    await expect(preview.getByRole('alert')).toContainText('Home belongs to the browser');
    await page.keyboard.press('Escape');
    await expect(preview.locator('[data-slot="page-shortcut-recorder"]')).toHaveCount(0);
    await expect(keysOf(page, 'manager.preview')).toHaveText('p');
    expect(await storedOverrides(extensionWorker)).toBeUndefined();

    // Moving Next row off j frees it for Preview; then Next row cannot get j back.
    await changeShortcut(page, 'manager.next_row', 'n');
    await expect(keysOf(page, 'manager.next_row')).toHaveText('n');
    await changeShortcut(page, 'manager.preview', 'j');
    await expect(keysOf(page, 'manager.preview')).toHaveText('j');
    const nextRow = shortcutRow(page, 'manager.next_row');
    await nextRow.getByRole('button', { name: 'Reset Move to the next row to default' }).click();
    await expect(nextRow.getByRole('alert')).toHaveText(
      'Already used by “Preview the focused bookmark”.',
    );
    await expect(keysOf(page, 'manager.next_row')).toHaveText('n');

    await preview
      .getByRole('button', { name: 'Reset Preview the focused bookmark to default' })
      .click();
    await expect(keysOf(page, 'manager.preview')).toHaveText('p');
    await nextRow.getByRole('button', { name: 'Reset Move to the next row to default' }).click();
    await expect(keysOf(page, 'manager.next_row')).toHaveText('j');
    await expect.poll(() => storedOverrides(extensionWorker)).toBeUndefined();

    // Reset all brings every shortcut back at once.
    await changeShortcut(page, 'manager.show_help', 'h');
    await changeShortcut(page, 'popup.focus_search', 'F2');
    await expect(keysOf(page, 'popup.focus_search')).toHaveText('F2');
    await resetAll.click();
    await expect(keysOf(page, 'manager.show_help')).toHaveText('?');
    await expect(keysOf(page, 'popup.focus_search')).toHaveText('/');
    await expect.poll(() => storedOverrides(extensionWorker)).toBeUndefined();
  });

  test('a popup shortcut changed in Options focuses the search box with its new key', async ({
    extensionId,
    extensionWorker,
    page,
  }) => {
    await openOptionsTab(page, extensionId, 'Behavior');
    // The popup leaves Ctrl and Cmd to the browser.
    await changeShortcut(page, 'popup.focus_search', 'ControlOrMeta+e');
    await expect(shortcutRow(page, 'popup.focus_search').getByRole('alert')).toContainText(
      'shortcuts to the browser',
    );
    await page.keyboard.press('F2');
    await expect(keysOf(page, 'popup.focus_search')).toHaveText('F2');
    await expect
      .poll(() => storedOverrides(extensionWorker))
      .toEqual({ 'popup.focus_search': [{ key: 'F2' }] });

    await openPopup(page, extensionId);
    const search = page.getByRole('combobox', { name: 'Search bookmarks, or type a folder name' });
    await expect(search).toHaveAttribute('aria-keyshortcuts', 'F2');
    await expect(search).toHaveAttribute('title', /F2 search/);
    await expect(page.getByTestId('popup-hint-bar')).toContainText('F2');
    await expect(search).toBeFocused();
    await search.press('Escape');
    await expect(search).not.toBeFocused();
    await page.keyboard.press('/');
    await expect(search).not.toBeFocused();
    await page.keyboard.press('F2');
    await expect(search).toBeFocused();
  });
});
