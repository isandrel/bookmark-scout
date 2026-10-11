import type { Page } from '@playwright/test';
import { type ExtensionBrowser, expect, test } from './fixtures';
import { openPopup } from './popup-helpers';
import { readStored, STORAGE_ITEMS } from './storage';

/**
 * Setting up the quick save shortcuts in Chrome and Edge. A test cannot clear a browser shortcut,
 * so "Chrome left the key unset" is simulated by stubbing `chrome.commands.getAll` in the page.
 */

/** Makes `commands.getAll` on this page report `ai-quick-save` without keys. */
async function leaveAIQuickSaveUnset(page: Page) {
  await page.addInitScript(() => {
    const getAll = chrome.commands.getAll.bind(chrome.commands);
    Object.defineProperty(chrome.commands, 'getAll', {
      configurable: true,
      value: async () =>
        (await getAll()).map((command) =>
          command.name === 'ai-quick-save' ? { ...command, shortcut: '' } : command,
        ),
    });
  });
}

/** The browser's own shortcut page, which lists every extension. */
const shortcutPageUrl = (browser: ExtensionBrowser) =>
  browser === 'msedge' ? 'edge://extensions/shortcuts' : 'chrome://extensions/shortcuts';

const notice = (page: Page) => page.getByTestId('quick-save-shortcut-notice');

test('the popup says nothing about shortcuts while every quick save command has keys', async ({
  extensionId,
  page,
}) => {
  await openPopup(page, extensionId);
  await expect(page.getByTestId('popup-hint-bar')).toBeVisible();
  // The notice would appear right after the first read of the keys; give it that chance.
  await page.evaluate(() => chrome.commands.getAll());
  await expect(notice(page)).toHaveCount(0);
});

for (const surface of ['popup', 'sidepanel'] as const) {
  test(`${surface}: a quick save command without keys shows a notice that opens the shortcut page`, async ({
    context,
    extensionBrowser,
    extensionId,
    page,
  }) => {
    await leaveAIQuickSaveUnset(page);
    await page.goto(`chrome-extension://${extensionId}/${surface}.html`);

    await expect(notice(page)).toBeVisible();
    await expect(notice(page)).toContainText('Quick save shortcut not set');
    // One line: as tall as the hint bar under it, and nothing in it clipped or wrapped.
    await expect
      .poll(() => notice(page).evaluate((element) => element.getBoundingClientRect().height))
      .toBe(28);
    await expect(notice(page).getByRole('button', { name: 'Dismiss' })).toBeVisible();

    const [shortcutsPage] = await Promise.all([
      context.waitForEvent('page'),
      notice(page).getByRole('button', { name: 'Set it up', exact: true }).click(),
    ]);
    await expect(shortcutsPage).toHaveURL(shortcutPageUrl(extensionBrowser));
  });
}

test('where the browser lets the extension set keys, Set it up opens the Options recorder', async ({
  context,
  extensionId,
  page,
}) => {
  await leaveAIQuickSaveUnset(page);
  // Firefox's commands.update and commands.reset, detected by their presence.
  await page.addInitScript(() => {
    for (const name of ['update', 'reset']) {
      Object.defineProperty(chrome.commands, name, {
        configurable: true,
        value: () => Promise.resolve(),
      });
    }
  });
  await openPopup(page, extensionId);

  const [options] = await Promise.all([
    context.waitForEvent('page'),
    notice(page).getByRole('button', { name: 'Set it up', exact: true }).click(),
  ]);
  await expect(options).toHaveURL(
    `chrome-extension://${extensionId}/options.html?category=search#quick-save-shortcuts`,
  );
  await expect(options.getByTestId('quick-save-shortcuts')).toBeInViewport();
});

test('dismissing the notice hides it for good on this device', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await leaveAIQuickSaveUnset(page);
  await openPopup(page, extensionId);
  await notice(page).getByRole('button', { name: 'Dismiss' }).click();
  await expect(notice(page)).toHaveCount(0);
  await expect
    .poll(() => readStored<string[]>(extensionWorker, STORAGE_ITEMS.dismissedNotices))
    .toEqual(['quick-save-shortcut']);

  // Still unset after a reopen, and still dismissed.
  await openPopup(page, extensionId);
  await expect(page.getByTestId('popup-hint-bar')).toBeVisible();
  await page.evaluate(() => chrome.commands.getAll());
  await expect(notice(page)).toHaveCount(0);
});

test('a key set while the popup was open shows on its return to view', async ({
  extensionId,
  page,
}) => {
  // Unset at first, then the user sets the key on the browser's page and comes back.
  await page.addInitScript(() => {
    const getAll = chrome.commands.getAll.bind(chrome.commands);
    const state = window as unknown as { shortcutUnset: boolean };
    state.shortcutUnset = true;
    Object.defineProperty(chrome.commands, 'getAll', {
      configurable: true,
      value: async () =>
        (await getAll()).map((command) =>
          state.shortcutUnset && command.name === 'quick-save'
            ? { ...command, shortcut: '' }
            : command,
        ),
    });
  });
  await openPopup(page, extensionId);
  await expect(notice(page)).toBeVisible();

  await page.evaluate(() => {
    (window as unknown as { shortcutUnset: boolean }).shortcutUnset = false;
    window.dispatchEvent(new Event('focus'));
  });
  await expect(notice(page)).toHaveCount(0);
});

test('Options points Chrome and Edge users to their extension on the browser shortcut page', async ({
  context,
  extensionBrowser,
  extensionId,
  page,
}) => {
  await leaveAIQuickSaveUnset(page);
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  const shortcuts = page.getByTestId('quick-save-shortcuts');
  await expect(shortcuts.getByTestId('shortcuts-page-hint')).toHaveText(
    'Find Bookmark Scout on that page.',
  );
  await expect(shortcuts.locator('[data-command="ai-quick-save"]')).toContainText('Not set');
  await expect(shortcuts.locator('[data-command="quick-save"] kbd').last()).toHaveText('S');
  // Chrome cannot set shortcuts from code, so there is nothing to record into.
  await expect(shortcuts.locator('[data-slot="shortcut-recorder"]')).toHaveCount(0);

  const [shortcutsPage] = await Promise.all([
    context.waitForEvent('page'),
    shortcuts.getByRole('button', { name: 'Change shortcuts' }).click(),
  ]);
  await expect(shortcutsPage).toHaveURL(shortcutPageUrl(extensionBrowser));
});
