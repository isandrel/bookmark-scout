/**
 * Options panels that save a list as it is changed (popup layout, popup and manager menus, Ask AI
 * actions, manager view lists, page shortcuts) say so when the browser refuses the write, instead
 * of quietly showing the old value (`notifySettingNotSaved`).
 */
import type { Page } from '@playwright/test';
import { expect, test, toastRegion } from './fixtures';
import { openOptionsTab } from './options-helpers';
import { setSettings } from './storage';

/**
 * Makes the page's writes to `area` fail the way a full storage area does, until the returned
 * function puts the browser's write back. Other writes the page makes meanwhile fail too, so the
 * failure cannot be taken by one of them first.
 */
async function failWrites(page: Page, area: 'local' | 'sync', message: string) {
  await page.evaluate(
    ({ areaName, error }) => {
      const storageArea = chrome.storage[areaName] as { set: unknown };
      Object.assign(globalThis, { e2eRealSet: storageArea.set });
      storageArea.set = () => Promise.reject(new Error(error));
    },
    { areaName: area, error: message },
  );
  return () =>
    page.evaluate((areaName) => {
      (chrome.storage[areaName] as { set: unknown }).set = (
        globalThis as unknown as { e2eRealSet: unknown }
      ).e2eRealSet;
    }, area);
}

test('a list change the browser refuses to store says it was not saved, and why', async ({
  extensionWorker,
  extensionId,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en' });
  await openOptionsTab(page, extensionId, 'Appearance');

  // Popup parts are kept on this device.
  let restore = await failWrites(page, 'local', 'E2E local storage is full');
  const parts = page.getByTestId('popup-layout-popupSections');
  await parts.getByRole('checkbox', { name: 'Key hints' }).click();
  const toasts = toastRegion(page);
  await expect(toasts.getByText('× 1 setting not saved', { exact: true }).first()).toBeVisible();
  await expect(toasts.getByText('E2E local storage is full', { exact: true })).toBeVisible();
  // Nothing changed: the part is still shown.
  await expect(parts.getByRole('checkbox', { name: 'Key hints' })).toBeChecked();
  await restore();

  // The popup's row menus sync.
  await page.getByRole('tab', { name: 'Behavior', exact: true }).click();
  restore = await failWrites(page, 'sync', 'QUOTA_BYTES quota exceeded');
  await page
    .getByTestId('popup-menu-bookmark')
    .getByRole('checkbox', { name: 'Open in new window' })
    .click();
  await expect(toasts.getByText('QUOTA_BYTES quota exceeded', { exact: true })).toBeVisible();
  await expect(
    page.getByTestId('popup-menu-bookmark').getByRole('checkbox', { name: 'Open in new window' }),
  ).toBeChecked();
  await restore();
});
