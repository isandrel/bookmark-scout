/**
 * What a first-time user sees: the page the popup saves, the AI-off notice over greyed-out AI
 * settings, and the Options button that leads to the bookmark export.
 */
import { expect, test } from './fixtures';
import { openPopup } from './popup-helpers';
import { setSettings } from './storage';

test('the popup names the page it saves', async ({ extensionId, page }) => {
  // Pages open as tabs here, so the "current page" would be the popup itself.
  await page.addInitScript(() => {
    chrome.tabs.query = (async () => [
      {
        id: 99,
        index: 0,
        windowId: 1,
        active: true,
        title: 'E2E Banana bread recipe',
        url: 'https://e2e.invalid/banana-bread',
      },
    ]) as unknown as typeof chrome.tabs.query;
  });
  await openPopup(page, extensionId);
  await expect(page.getByTestId('current-page-line')).toHaveText(
    'Page to save: E2E Banana bread recipe',
  );
});

test('with AI off, AI settings are greyed out under one notice and keep their values', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en', autoTaggingEnabled: true });
  await page.goto(`chrome-extension://${extensionId}/options.html?category=aiTools`);

  const notice = page.getByTestId('settings-requirement-notice');
  await expect(notice).toHaveCount(1);
  await expect(notice).toHaveText('AI is off — nothing here runs until you turn on AI Features.');
  const autoTagging = page.locator('[data-settings-section="autoTagging"]');
  await expect(autoTagging).toHaveAttribute('data-requirement-off', 'aiEnabled');
  // Still on, and still editable, so it can be set up before AI is turned on.
  await expect(autoTagging.getByRole('switch').first()).toBeChecked();
  await expect(autoTagging.getByRole('switch').first()).toBeEnabled();
  // The context packer works without AI, so it is not greyed out.
  await expect(page.locator('[data-settings-section="contextPacker"]')).not.toHaveAttribute(
    'data-requirement-off',
  );

  await setSettings(extensionWorker, { aiEnabled: true });
  await expect(notice).toHaveCount(0);
  await expect(autoTagging).not.toHaveAttribute('data-requirement-off');
});

test('Export Bookmarks in Options opens the manager on the export card', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en' });
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  // The footer's backup buttons say what they hold: settings, not bookmarks.
  await expect(page.getByRole('button', { name: 'Back up settings' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restore settings' })).toBeVisible();

  const [manager] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('button', { name: 'Export Bookmarks' }).click(),
  ]);
  // The manager may add the folder it shows (`?id=<bookmarks bar>`) once it loads.
  await expect(manager).toHaveURL(
    new RegExp(
      `^chrome-extension://${extensionId}/bookmarks\\.html(\\?id=[^#]*)?#export-bookmarks$`,
    ),
  );
  await expect(manager.getByTestId('tools-sidebar')).toBeVisible();
  await expect(manager.locator('#export-bookmarks')).toBeInViewport();
  // Keyboard and screen reader users land on the card too: its heading has the focus.
  await expect(
    manager.locator('#export-bookmarks').getByRole('heading', { name: 'Export Bookmarks' }),
  ).toBeFocused();
});
