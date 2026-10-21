/**
 * More about a setting, in a toggletip beside its label: opened by click or keyboard, read by its
 * text, closed with Escape with focus back on its button, and in the page's language.
 */
import { expect, test } from './fixtures';
import { setSettings } from './storage';

test("a setting's help opens on click and from the keyboard, and closes with Escape", async ({
  extensionId,
  page,
}) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByRole('tab', { name: 'Maintenance' }).click();
  const help = page.getByRole('button', { name: 'About Follow Redirects' });
  const text = page.getByTestId('setting-help-text');

  await help.click();
  await expect(text).toContainText('followed to its new address');
  await page.keyboard.press('Escape');
  await expect(text).toBeHidden();
  await expect(help).toBeFocused();

  // The keyboard alone opens it too.
  await page.keyboard.press('Enter');
  await expect(text).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(text).toBeHidden();

  // A setting with no help message has no button.
  await expect(page.getByRole('button', { name: 'About Default Scope' })).toHaveCount(0);
});

test("a setting's help follows the selected language", async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'ja' });
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByRole('tab', { name: 'メンテナンス' }).click();
  await page.getByRole('button', { name: 'リダイレクトをたどる について' }).click();
  await expect(page.getByTestId('setting-help-text')).toContainText('新しいアドレス');
});
