/**
 * The welcome page opened after install (`welcome.html`). Every other test starts with it closed
 * (the `context` fixture); here it stays open. A test profile cannot update the extension, so not
 * opening on an update is checked by dispatching the update event (`storage-registry.spec.ts`)
 * and unit-tested (`tests/unit/welcome-page.test.ts`).
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/** Quick save's suggested keys as key caps on this platform. */
const quickSaveCaps = process.platform === 'darwin' ? ['⌥', '⇧', 'S'] : ['Alt', 'Shift', 'S'];

const steps = (page: Page) => page.locator('[data-welcome-step]');

test.describe('right after install', () => {
  test.use({ keepWelcomePage: true });

  test('the welcome page opens once, with the steps, the working keys, and the Bookmarks page', async ({
    context,
    extensionId,
  }) => {
    const welcomeUrl = `chrome-extension://${extensionId}/welcome.html`;
    await expect
      .poll(() => context.pages().filter((page) => page.url() === welcomeUrl).length)
      .toBe(1);
    const page = context.pages().find((candidate) => candidate.url() === welcomeUrl) as Page;

    await expect(page).toHaveTitle('Welcome - Bookmark Scout');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bookmark Scout is ready');
    // A fresh profile keeps the button in the Extensions menu, not on the toolbar.
    await expect(steps(page)).toHaveCount(3);
    await expect(page.locator('[data-welcome-step="pin"]')).toContainText(
      'Pin Bookmark Scout to the toolbar',
    );
    await expect(page.locator('[data-welcome-step="save"]')).toContainText('Save a page');
    await expect(page.getByTestId('welcome-shortcut').locator('kbd')).toHaveText(quickSaveCaps);
    // Chrome never lets an extension take the browser's bookmark keys by default, so the step
    // offers them, opening the steps in Options.
    const bookmarkKeys = page.getByTestId('welcome-bookmark-keys');
    await expect(bookmarkKeys).toHaveText(
      `Use ${process.platform === 'darwin' ? '⌘D' : 'Ctrl+D'} instead`,
    );
    const [shortcutSetup] = await Promise.all([context.waitForEvent('page'), bookmarkKeys.click()]);
    await expect(shortcutSetup).toHaveURL(
      new RegExp(`^chrome-extension://${extensionId}/options\\.html.*#`),
    );
    await shortcutSetup.close();
    await expect(page.getByTestId('welcome-manager-note')).toHaveText(
      "Your browser's Bookmarks page now opens Bookmark Scout.",
    );
    await expect(page.getByRole('link', { name: 'Read the guide' })).toHaveAttribute(
      'href',
      /^https:\/\/[^/]+\/guides\/save-and-organize$/,
    );

    const [options] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('button', { name: 'Open settings' }).click(),
    ]);
    await expect(options).toHaveURL(
      new RegExp(`^chrome-extension://${extensionId}/options\\.html`),
    );
  });
});

test('leaves out the pin step once the button is on the toolbar', async ({ extensionId, page }) => {
  await page.addInitScript(() => {
    chrome.action.getUserSettings = (async () => ({
      isOnToolbar: true,
    })) as unknown as typeof chrome.action.getUserSettings;
  });
  await page.goto(`chrome-extension://${extensionId}/welcome.html`);
  await expect(page.getByTestId('welcome-shortcut')).toBeVisible();
  await expect(steps(page)).toHaveCount(2);
  await expect(page.locator('[data-welcome-step="pin"]')).toHaveCount(0);
});

test('offers to set up the shortcut when the browser left quick save without keys', async ({
  extensionId,
  page,
}) => {
  await page.addInitScript(() => {
    const getAll = chrome.commands.getAll.bind(chrome.commands);
    Object.defineProperty(chrome.commands, 'getAll', {
      configurable: true,
      value: async () =>
        (await getAll()).map((command) =>
          command.name === 'quick-save' ? { ...command, shortcut: '' } : command,
        ),
    });
  });
  await page.goto(`chrome-extension://${extensionId}/welcome.html`);
  const step = page.locator('[data-welcome-step="shortcut"]');
  await expect(step).toContainText('Quick save has no shortcut yet');
  await expect(step.getByRole('button', { name: 'Set it up' })).toBeVisible();
  await expect(page.getByTestId('welcome-shortcut')).toHaveCount(0);
});
