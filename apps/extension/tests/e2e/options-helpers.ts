/**
 * Locators for the Options page, shared by specs that change settings through it.
 */
import type { Page } from '@playwright/test';

/** The row of one setting, by its settings key. */
export function settingRow(page: Page, key: string) {
  return page.locator(`[data-setting="${key}"]`);
}

/** Opens Options on the tab named `tab`, such as "Behavior" or "Saving & Search". */
export async function openOptionsTab(page: Page, extensionId: string, tab: string) {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByRole('tab', { name: tab, exact: true }).click();
}
