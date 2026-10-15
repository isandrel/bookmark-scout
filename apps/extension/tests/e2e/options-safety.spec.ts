import type { Page } from '@playwright/test';
import { expect, test, toastRegion } from './fixtures';
import { settingRow } from './options-helpers';
import { readSettings, readStored, STORAGE_ITEMS, setSettings } from './storage';

/** Opens Options on Saving & Search, which holds the number fields these checks edit. */
async function openOptions(page: Page, extensionId: string) {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByRole('tab', { name: 'Saving & Search', exact: true }).click();
}

test('the empty notification area takes no clicks, so the bottom edge of a footer button works', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en' });
  await page.setViewportSize({ width: 380, height: 800 });
  await openOptions(page, extensionId);

  // The notification area sits over the bottom of the page; empty, it is not there to click.
  const region = toastRegion(page);
  expect(await region.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe('none');
  expect(await region.evaluate((element) => element.getBoundingClientRect().height)).toBe(0);

  const reset = page.getByRole('button', { name: 'Reset All' });
  const box = await reset.boundingBox();
  if (!box) throw new Error('Reset All is not on the page');
  // 3px above the button's bottom edge, inside the strip the viewport's padding used to cover.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height - 3);
  await expect(page.getByRole('dialog', { name: 'Reset all settings?' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  // With a notification showing, only the notification itself takes clicks.
  await page.getByRole('button', { name: 'Reset All' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reset All' }).click();
  const notification = toastRegion(page).getByRole('status').first();
  await expect(notification).toBeVisible();
  expect(await region.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe('none');
  expect(await notification.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe(
    'auto',
  );
  // The area's own padding beside the notification hits the page under it, not the area.
  const regionBox = await region.boundingBox();
  const notificationBox = await notification.boundingBox();
  if (!regionBox || !notificationBox) throw new Error('No notification area');
  const hit = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.closest('[role="region"]') !== null,
    [regionBox.x + 2, notificationBox.y + notificationBox.height / 2],
  );
  expect(hit).toBe(false);
});

test('Reset All asks first, says what it resets, and Undo restores both scopes', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  // A synced setting and a setting kept on this device only.
  await setSettings(extensionWorker, {
    language: 'en',
    searchDebounceMs: 700,
    aiActivityRecording: true,
  });
  await openOptions(page, extensionId);

  await page.getByRole('button', { name: 'Reset All' }).click();
  const dialog = page.getByRole('dialog', { name: 'Reset all settings?' });
  await expect(dialog).toContainText(
    'Every setting on every tab goes back to its default: both the ones synced across your devices and the ones kept on this device only.',
  );
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  expect(await readSettings(extensionWorker)).toMatchObject({
    searchDebounceMs: 700,
    aiActivityRecording: true,
  });

  await page.getByRole('button', { name: 'Reset All' }).click();
  await dialog.getByRole('button', { name: 'Reset All' }).click();
  await expect.poll(() => readSettings(extensionWorker)).toEqual({});

  const toast = toastRegion(page).getByRole('status').filter({ hasText: 'Settings reset' });
  await toast.getByRole('button', { name: 'Undo' }).click();
  await expect
    .poll(() => readSettings(extensionWorker))
    .toEqual({ language: 'en', searchDebounceMs: 700, aiActivityRecording: true });
  // Each in its own scope again.
  expect(await readStored(extensionWorker, STORAGE_ITEMS.deviceSettings)).toEqual({
    aiActivityRecording: true,
  });
  await expect(
    toastRegion(page).getByText('✓ Your settings are back', { exact: true }),
  ).toBeVisible();
});

test('a number field left in another Options tab does not write its old text over a newer value', async ({
  context,
  extensionId,
  extensionWorker,
}) => {
  await setSettings(extensionWorker, { language: 'en' });
  const first = await context.newPage();
  const second = await context.newPage();
  await openOptions(first, extensionId);
  await openOptions(second, extensionId);
  const field = (page: Page) => settingRow(page, 'folderMatchesMax').getByRole('textbox');
  const stored = async () => (await readSettings(extensionWorker)).folderMatchesMax;

  // Typed in the first tab, which keeps the focus and its text.
  await field(first).fill('7');
  await expect.poll(stored).toBe(7);
  // A newer value from the second tab.
  await field(second).fill('9');
  await field(second).blur();
  await expect.poll(stored).toBe(9);
  await expect(field(first)).toHaveValue('7');

  // Leaving the first tab's field shows the newer value instead of saving its old text again.
  await field(first).press('Tab');
  await expect(field(first)).toHaveValue('9');
  await first.waitForTimeout(1_000);
  expect(await stored()).toBe(9);

  // Typing there again still saves.
  await field(first).fill('4');
  await field(first).blur();
  await expect.poll(stored).toBe(4);
  await expect(field(second)).toHaveValue('4');
});
