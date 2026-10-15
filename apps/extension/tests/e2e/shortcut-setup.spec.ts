import type { Page } from '@playwright/test';
import { readConfigToml } from '../config-files';
import { type ExtensionBrowser, expect, test } from './fixtures';
import { openPopup } from './popup-helpers';
import { readStored, STORAGE_ITEMS, setSettings } from './storage';

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
const missingNotice = (page: Page) => page.locator('[data-notice="quick-save-shortcut"]');

/** The browser's bookmark keys as Chrome and the extension show them on this platform. */
const bookmarkKeys = process.platform === 'darwin' ? '⌘D' : 'Ctrl+D';
/** Quick save's suggested keys as the extension shows them on this platform. */
const quickSaveKeys = process.platform === 'darwin' ? '⌥⇧S' : 'Alt+Shift+S';

/** Makes `commands.getAll` on this page report quick save on the browser's bookmark keys. */
async function giveQuickSaveBookmarkKeys(page: Page) {
  await page.addInitScript((shortcut) => {
    const getAll = chrome.commands.getAll.bind(chrome.commands);
    Object.defineProperty(chrome.commands, 'getAll', {
      configurable: true,
      value: async () =>
        (await getAll()).map((command) =>
          command.name === 'quick-save' ? { ...command, shortcut } : command,
        ),
    });
  }, bookmarkKeys);
}

test('the browser assigns the suggested keys, not its own bookmark keys', async ({
  extensionWorker,
}) => {
  const commands = await extensionWorker.evaluate(() => chrome.commands.getAll());
  const shortcuts = Object.fromEntries(
    commands
      .filter((command) => command.name !== '_execute_action')
      .map((command) => [command.name, command.shortcut]),
  );
  expect(shortcuts).toEqual(
    process.platform === 'darwin'
      ? { 'quick-save': '⌥⇧S', 'ai-quick-save': '⌥⇧D' }
      : { 'quick-save': 'Alt+Shift+S', 'ai-quick-save': 'Alt+Shift+D' },
  );
});

test('with every command bound, the popup names the working keys and offers the bookmark keys', async ({
  context,
  extensionBrowser,
  extensionId,
  page,
}) => {
  await openPopup(page, extensionId);
  await expect(notice(page)).toBeVisible();
  await expect(notice(page)).toHaveAttribute('data-notice', 'quick-save-bookmark-key');
  // The shortcut that works now comes first; the bookmark keys need setting up, so they follow.
  await expect(notice(page)).toContainText(`Quick save: press ${quickSaveKeys} on any page`);
  await expect(missingNotice(page)).toHaveCount(0);

  // The steps need more room than the line, so the link opens them in Options.
  const [options] = await Promise.all([
    context.waitForEvent('page'),
    notice(page)
      .getByRole('button', { name: `Use ${bookmarkKeys} instead`, exact: true })
      .click(),
  ]);
  await expect(options).toHaveURL(
    `chrome-extension://${extensionId}/options.html?category=search#quick-save-shortcuts`,
  );
  const hint = options.getByTestId('bookmark-key-hint');
  await expect(hint).toContainText(
    `click the pencil next to “Quick save the current page”, and press ${bookmarkKeys}.`,
  );
  const [shortcutsPage] = await Promise.all([
    context.waitForEvent('page'),
    hint.getByRole('button', { name: `Use ${bookmarkKeys} for quick save` }).click(),
  ]);
  await expect(shortcutsPage).toHaveURL(shortcutPageUrl(extensionBrowser));
});

const { popup } = readConfigToml('settings/appearance.toml') as {
  popup: { width: { min: number } };
};

for (const language of ['ja', 'de'] as const) {
  for (const width of [popup.width.min, 400]) {
    test(`[${language}, ${width}px] the quick save tip always shows its keys whole`, async ({
      extensionId,
      extensionWorker,
      page,
    }) => {
      await setSettings(extensionWorker, { language, popupWidth: width });
      await page.setViewportSize({ width, height: 600 });
      await openPopup(page, extensionId);
      await expect(notice(page)).toHaveAttribute('data-notice', 'quick-save-bookmark-key');
      const keys = notice(page).locator('[data-slot="notice-keys"]');
      await expect(keys).toContainText(quickSaveKeys);
      const link = notice(page).getByRole('button').first();
      await expect(link).toContainText(bookmarkKeys);
      // The words before the keys may be cut short; the keys and the link never are.
      const boxes = await notice(page).evaluate((element) => {
        const box = (target: Element | null) => target?.getBoundingClientRect().toJSON();
        const keysSpan = element.querySelector('[data-slot="notice-keys"]');
        return {
          notice: box(element),
          message: box(keysSpan?.parentElement ?? null),
          keys: box(keysSpan),
          link: box(element.querySelector('button')),
        };
      });
      expect(boxes.keys.right).toBeLessThanOrEqual(boxes.message.right + 0.5);
      expect(boxes.keys.right).toBeLessThanOrEqual(boxes.notice.right);
      expect(boxes.link.right).toBeLessThanOrEqual(boxes.notice.right);
      expect(boxes.link.left).toBeGreaterThanOrEqual(boxes.notice.left);
    });
  }
}

test('the bookmark key offer gives way in a short popup, and a missing key does not', async ({
  extensionId,
  page,
}) => {
  await page.setViewportSize({ width: 400, height: 350 });
  await openPopup(page, extensionId);
  await expect(page.getByTestId('popup-hint-bar')).toBeVisible();
  await expect(notice(page)).toHaveAttribute('data-notice', 'quick-save-bookmark-key');
  await expect(notice(page)).toBeHidden();

  await leaveAIQuickSaveUnset(page);
  await page.reload();
  await expect(missingNotice(page)).toBeVisible();
});

test('once quick save has the bookmark keys, the popup is quiet and Options says how to undo it', async ({
  extensionId,
  page,
}) => {
  await giveQuickSaveBookmarkKeys(page);
  await openPopup(page, extensionId);
  await expect(page.getByTestId('popup-hint-bar')).toBeVisible();
  // The notice would appear right after the first read of the keys; give it that chance.
  await page.evaluate(() => chrome.commands.getAll());
  await expect(notice(page)).toHaveCount(0);

  await page.goto(`chrome-extension://${extensionId}/options.html?category=search`);
  await expect(page.getByTestId('bookmark-key-hint')).toHaveText(
    `${bookmarkKeys} now runs quick save instead of the browser’s bookmark dialog. To get the dialog back, clear this shortcut on the browser’s shortcut page.`,
  );
  await expect(page.getByTestId('bookmark-key-hint').getByRole('button')).toHaveCount(0);
});

test('setting the bookmark keys on the browser shortcut page reaches quick save', async ({
  context,
  extensionBrowser,
  extensionId,
  extensionWorker,
  page,
}) => {
  // Edge draws its own shortcut page; this records into Chrome's.
  test.skip(extensionBrowser === 'msedge', "Chrome's shortcut page only");
  const shortcuts = await context.newPage();
  await shortcuts.goto('chrome://extensions/shortcuts');
  // One row per command, named by its description, as the hint tells the user to look for.
  const quickSaveRow = shortcuts
    .locator('extensions-keyboard-shortcuts .command-entry')
    .filter({ hasText: 'Quick save the current page' })
    .filter({ hasNotText: 'with AI' });
  await quickSaveRow.locator('#edit').click();
  await shortcuts.keyboard.press('ControlOrMeta+KeyD');

  // Chrome takes a key the user records although it never assigns it as a suggested key.
  await expect
    .poll(async () =>
      (await extensionWorker.evaluate(() => chrome.commands.getAll())).find(
        (command) => command.name === 'quick-save',
      ),
    )
    .toMatchObject({ shortcut: bookmarkKeys });

  await openPopup(page, extensionId);
  await expect(page.getByTestId('popup-hint-bar')).toBeVisible();
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
  await expect(missingNotice(page)).toHaveCount(0);
  await expect
    .poll(() => readStored<string[]>(extensionWorker, STORAGE_ITEMS.dismissedNotices))
    .toEqual(['quick-save-shortcut']);

  // The next notice takes its place, and is dismissed on its own.
  await expect(notice(page)).toHaveAttribute('data-notice', 'quick-save-bookmark-key');
  await notice(page).getByRole('button', { name: 'Dismiss' }).click();
  await expect(notice(page)).toHaveCount(0);
  await expect
    .poll(() => readStored<string[]>(extensionWorker, STORAGE_ITEMS.dismissedNotices))
    .toEqual(['quick-save-shortcut', 'quick-save-bookmark-key']);

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
  // Unset at first, then the user sets the bookmark keys on the browser's page and comes back.
  await page.addInitScript((keys) => {
    const getAll = chrome.commands.getAll.bind(chrome.commands);
    const state = window as unknown as { shortcutUnset: boolean };
    state.shortcutUnset = true;
    Object.defineProperty(chrome.commands, 'getAll', {
      configurable: true,
      value: async () =>
        (await getAll()).map((command) =>
          command.name === 'quick-save'
            ? { ...command, shortcut: state.shortcutUnset ? '' : keys }
            : command,
        ),
    });
  }, bookmarkKeys);
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
  await page.goto(`chrome-extension://${extensionId}/options.html?category=search`);
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
