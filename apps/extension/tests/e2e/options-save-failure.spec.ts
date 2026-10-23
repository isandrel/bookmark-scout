/**
 * Options panels that save a list as it is changed (popup layout, popup and manager menus, Ask AI
 * actions, manager view lists, page shortcuts) say so when the browser refuses the write, instead
 * of quietly showing the old value (`notifySettingNotSaved`).
 */
import type { Page } from '@playwright/test';
import { expect, test, toastRegion } from './fixtures';
import { openOptionsTab } from './options-helpers';
import { setSettings } from './storage';

/** Makes the page's next write to `area` fail the way a full storage area does. */
async function failNextWrite(page: Page, area: 'local' | 'sync', message: string) {
  await page.evaluate(
    ({ areaName, error }) => {
      const storageArea = chrome.storage[areaName];
      const set = storageArea.set.bind(storageArea);
      let failed = false;
      storageArea.set = ((items: Record<string, unknown>) => {
        if (failed) return set(items);
        failed = true;
        return Promise.reject(new Error(error));
      }) as typeof storageArea.set;
    },
    { areaName: area, error: message },
  );
}

test('a list change the browser refuses to store says it was not saved, and why', async ({
  extensionWorker,
  extensionId,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en' });
  await openOptionsTab(page, extensionId, 'Appearance');

  // Popup parts are kept on this device.
  await failNextWrite(page, 'local', 'E2E local storage is full');
  const parts = page.getByTestId('popup-layout-popupSections');
  await parts.getByRole('checkbox', { name: 'Key hints' }).click();
  const toasts = toastRegion(page);
  await expect(toasts.getByText('1 setting not saved', { exact: true })).toBeVisible();
  await expect(toasts.getByText('E2E local storage is full', { exact: true })).toBeVisible();
  // Nothing changed: the part is still shown.
  await expect(parts.getByRole('checkbox', { name: 'Key hints' })).toBeChecked();

  // The popup's row menus sync.
  await page.getByRole('tab', { name: 'Behavior', exact: true }).click();
  await failNextWrite(page, 'sync', 'QUOTA_BYTES quota exceeded');
  await page
    .getByTestId('popup-menu-bookmark')
    .getByRole('checkbox', { name: 'Open in new window' })
    .click();
  await expect(toasts.getByText('QUOTA_BYTES quota exceeded', { exact: true })).toBeVisible();
  await expect(
    page.getByTestId('popup-menu-bookmark').getByRole('checkbox', { name: 'Open in new window' }),
  ).toBeChecked();
});
