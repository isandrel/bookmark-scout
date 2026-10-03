import type { Page } from '@playwright/test';
import { expect, test, toastRegion } from './fixtures';
import { folderRow, openPopup, seedFolder, setSettings } from './popup-helpers';

const isFocused = (page: Page, selector: string) =>
  page.evaluate((query) => document.activeElement?.matches(query) ?? false, selector);

function folderTrigger(page: Page, folderId: string) {
  return page.locator(`[data-folder-trigger="${folderId}"]`);
}

function managerUrl(extensionId: string, folderId?: string) {
  const base = `chrome-extension://${extensionId}/bookmarks.html`;
  return folderId ? `${base}?id=${folderId}` : base;
}

/** Index of the table row that holds keyboard focus, or -1. */
function focusedRowIndex(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('main tbody tr')).findIndex((row) =>
      row.contains(document.activeElement),
    ),
  );
}

test.describe('popup keyboard shortcuts', () => {
  test('/ focuses search, Escape clears then leaves it, and the hint names the keys', async ({
    extensionId,
    page,
  }) => {
    await openPopup(page, extensionId);
    const search = page.getByRole('combobox', { name: 'Search bookmarks...' });
    await expect(search).toHaveAttribute('aria-keyshortcuts', '/');
    await expect(search).toHaveAttribute('title', /\/ search/);

    await search.fill('anything');
    await search.press('Escape');
    await expect(search).toHaveValue('');
    await expect(search).toBeFocused();
    await search.press('Escape');
    await expect(search).not.toBeFocused();

    await page.keyboard.press('/');
    await expect(search).toBeFocused();
    // Inside the search box `/` is text, not a shortcut.
    await page.keyboard.type('a/b');
    await expect(search).toHaveValue('a/b');

    // Ctrl and Cmd combinations are left to the browser.
    await search.press('Escape');
    await search.press('Escape');
    await page.keyboard.press('Control+/');
    await expect(search).not.toBeFocused();
    await page.keyboard.press('Meta+/');
    await expect(search).not.toBeFocused();
  });

  test('arrow keys move through folders and bookmarks and open or close folders', async ({
    extensionId,
    extensionWorker,
    page,
  }) => {
    const seeded = await seedFolder(extensionWorker, 'E2E Keys Folder', [
      { title: 'Key Alpha', url: 'https://e2e.invalid/key-alpha' },
    ]);

    await openPopup(page, extensionId);
    const search = page.getByRole('combobox', { name: 'Search bookmarks...' });
    const bar = folderTrigger(page, seeded.barId);
    const keysFolder = folderTrigger(page, seeded.folderId);
    const alpha = page.getByRole('link', { name: 'Key Alpha' });

    await expect(search).toBeFocused();
    await search.press('ArrowDown');
    await expect(bar).toBeFocused();
    await expect(bar).toHaveAttribute('aria-expanded', 'false');

    await page.keyboard.press('ArrowRight');
    await expect(bar).toHaveAttribute('aria-expanded', 'true');
    await expect(bar).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(keysFolder).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(keysFolder).toHaveAttribute('aria-expanded', 'true');

    // Bookmarks are rows too, not only folders.
    await page.keyboard.press('ArrowDown');
    await expect(alpha).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(keysFolder).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(keysFolder).toHaveAttribute('aria-expanded', 'false');
    await expect(alpha).toHaveCount(0);

    await page.keyboard.press('ArrowUp');
    await expect(bar).toBeFocused();
    await page.keyboard.press('End');
    await expect(bar).not.toBeFocused();
    expect(await isFocused(page, '[data-popup-tree-row]')).toBe(true);
    await page.keyboard.press('Home');
    await expect(bar).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(search).toBeFocused();
  });

  test('Enter on a folder saves the current page there, once, without toggling it', async ({
    extensionId,
    extensionWorker,
    page,
  }) => {
    const seeded = await seedFolder(extensionWorker, 'E2E Enter Folder', [
      { title: 'Existing Link', url: 'https://e2e.invalid/existing' },
    ]);
    const children = () =>
      extensionWorker.evaluate(
        async (id) => (await chrome.bookmarks.getChildren(id)).map((node) => node.url ?? ''),
        seeded.folderId,
      );

    await openPopup(page, extensionId);
    await folderRow(page, seeded.barTitle).click();
    const folder = folderTrigger(page, seeded.folderId);
    await folder.focus();
    await page.keyboard.press('Enter');

    await expect.poll(children).toHaveLength(2);
    expect(await children()).toContain(`chrome-extension://${extensionId}/popup.html`);
    await expect(folder).toHaveAttribute('aria-expanded', 'false');
    await expect(folder).toBeFocused();

    // A second Enter finds the page already saved, and Space still toggles the folder.
    await page.keyboard.press('Enter');
    await expect(toastRegion(page).getByText('Already saved', { exact: true })).toBeVisible();
    expect(await children()).toHaveLength(2);
    await page.keyboard.press(' ');
    await expect(folder).toHaveAttribute('aria-expanded', 'true');
  });

  test('shortcuts stay out of the new-folder input and open dialogs', async ({
    extensionId,
    extensionWorker,
    page,
  }) => {
    await setSettings(extensionWorker, { confirmBeforeDelete: true });
    const seeded = await seedFolder(extensionWorker, 'E2E Guard Folder', [
      { title: 'Guarded Link', url: 'https://e2e.invalid/guarded' },
    ]);

    await openPopup(page, extensionId);
    // An open modal hides the page from the accessibility tree, so find the search by attribute.
    const search = page.locator('input[aria-keyshortcuts="/"]');
    await folderRow(page, seeded.barTitle).click();
    const row = folderRow(page, 'E2E Guard Folder');
    await row.hover();
    await row.getByRole('button', { name: 'Add folder' }).click();
    const nameInput = page.getByPlaceholder('Enter folder name...');
    await expect(nameInput).toBeFocused();
    await page.keyboard.press('End');
    await page.keyboard.type('/x');
    await expect(nameInput).toBeFocused();
    await expect(nameInput).toHaveValue(/\/x$/);
    await page.keyboard.press('Escape');
    await expect(nameInput).toHaveCount(0);

    // Adding a subfolder opened the folder, so its bookmark is already shown.
    await expect(folderTrigger(page, seeded.folderId)).toHaveAttribute('aria-expanded', 'true');
    const link = page.locator('.bookmark-item').filter({ hasText: 'Guarded Link' });
    await link.hover();
    await link.getByRole('button', { name: 'Delete bookmark' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('/');
    await expect(search).not.toBeFocused();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(
      await extensionWorker.evaluate(
        async (id) => (await chrome.bookmarks.getChildren(id)).length,
        seeded.folderId,
      ),
    ).toBe(1);
  });

  for (const surface of ['popup', 'sidepanel'] as const) {
    test(`${surface}: Ctrl+B and Cmd+B reach the browser and leave no cookie`, async ({
      extensionId,
      page,
    }) => {
      await page.goto(`chrome-extension://${extensionId}/${surface}.html`);
      await expect(page.getByPlaceholder('Search bookmarks...')).toBeVisible();
      // Registered after the page's own listeners, so it sees whether any of them claimed the key.
      await page.evaluate(() => {
        const seen: boolean[] = [];
        (window as unknown as { seenPrevented: boolean[] }).seenPrevented = seen;
        window.addEventListener('keydown', (event) => {
          if (event.key === 'b') seen.push(event.defaultPrevented);
        });
      });

      await page.keyboard.press('Control+b');
      await page.keyboard.press('Meta+b');

      const prevented = await page.evaluate(
        () => (window as unknown as { seenPrevented: boolean[] }).seenPrevented,
      );
      expect(prevented).toEqual([false, false]);
      expect(await page.evaluate(() => document.cookie)).toBe('');
    });
  }
});

test.describe('manager keyboard shortcuts', () => {
  test('/ focuses the title filter, where typed keys stay text', async ({
    extensionId,
    extensionWorker,
    page,
  }) => {
    const seeded = await seedFolder(extensionWorker, 'E2E Filter Keys', [
      { title: 'Filter Link', url: 'https://e2e.invalid/filter' },
    ]);
    await page.goto(managerUrl(extensionId, seeded.folderId));
    const filter = page.getByRole('textbox', { name: 'Filter titles...' });
    await expect(filter).toBeVisible();

    await page.keyboard.press('/');
    await expect(filter).toBeFocused();
    await page.keyboard.type('a/?');
    await expect(filter).toHaveValue('a/?');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // Backspace edits the filter instead of leaving the folder.
    await page.keyboard.press('Backspace');
    await expect(filter).toHaveValue('a/');
    await expect(page).toHaveURL(new RegExp(`id=${seeded.folderId}$`));
  });

  test('? opens the shortcuts help, which pauses other shortcuts until it closes', async ({
    extensionId,
    extensionWorker,
    page,
  }) => {
    const seeded = await seedFolder(extensionWorker, 'E2E Help Keys', [
      { title: 'Help Link', url: 'https://e2e.invalid/help' },
    ]);
    await page.goto(managerUrl(extensionId, seeded.folderId));
    const helpButton = page.getByRole('button', { name: 'Keyboard shortcuts' });
    await expect(helpButton).toHaveAttribute('aria-keyshortcuts', '?');

    await page.keyboard.press('Shift+?');
    const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Focus the title filter');
    await expect(dialog).toContainText('Go to the parent folder');
    await expect(dialog).toContainText('Move to the next or previous row');

    await page.keyboard.press('/');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Alt+ArrowUp');
    // The modal hides the page from the accessibility tree, so find the filter by attribute.
    await expect(page.locator('input[aria-label="Filter titles..."]')).not.toBeFocused();
    await expect(page).toHaveURL(new RegExp(`id=${seeded.folderId}$`));

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await helpButton.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(helpButton).toBeFocused();
  });

  test('on Apple platforms the hints print ⌥ and ⌫, drawn as icons like the arrows', async ({
    extensionId,
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'MacIntel' });
      Object.defineProperty(Navigator.prototype, 'userAgentData', {
        get: () => ({ platform: 'macOS', brands: [], mobile: false }),
      });
    });
    await openPopup(page, extensionId);
    await expect(page.getByRole('combobox', { name: 'Search bookmarks...' })).toHaveAttribute(
      'title',
      /⌥\+↓ show recent searches/,
    );

    await page.goto(managerUrl(extensionId));
    await page.keyboard.press('Shift+?');
    const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    // The bundled fonts lack these symbols; as text they fell back to a smaller system glyph.
    for (const key of ['⌥', '↑', '⌫']) {
      const keyCap = dialog.locator('kbd', { hasText: key });
      await expect(keyCap.locator('[data-slot="kbd-icon"]'), key).toBeVisible();
    }
    await expect(dialog.locator('kbd', { hasText: 'j' }).locator('[data-slot="kbd-icon"]')).toHaveCount(0);
  });

  test('Backspace and Alt+ArrowUp go to the parent folder, then to the root', async ({
    extensionId,
    extensionWorker,
    page,
  }) => {
    const seeded = await seedFolder(extensionWorker, 'E2E Parent Keys', [
      { title: 'Child Folder', children: [{ title: 'Deep Link', url: 'https://e2e.invalid/d' }] },
    ]);
    await page.goto(managerUrl(extensionId, seeded.ids['Child Folder']));
    await expect(page.locator('tbody tr').filter({ hasText: 'Deep Link' })).toBeVisible();

    await page.keyboard.press('Backspace');
    await expect(page).toHaveURL(new RegExp(`id=${seeded.folderId}$`));
    await page.keyboard.press('Alt+ArrowUp');
    await expect(page).toHaveURL(new RegExp(`id=${seeded.barId}$`));
    await page.keyboard.press('Alt+ArrowUp');
    await expect(page).toHaveURL(managerUrl(extensionId));
    // At the root there is no parent, and Ctrl/Cmd combinations are never taken.
    await page.keyboard.press('Backspace');
    await expect(page).toHaveURL(managerUrl(extensionId));
    await page.goto(managerUrl(extensionId, seeded.folderId));
    await expect(page.locator('tbody tr').filter({ hasText: 'Child Folder' })).toBeVisible();
    await page.keyboard.press('Control+Backspace');
    await page.keyboard.press('Meta+ArrowUp');
    await expect(page).toHaveURL(new RegExp(`id=${seeded.folderId}$`));
  });

  test('j and k move row focus, and Enter opens the focused folder', async ({
    extensionId,
    extensionWorker,
    page,
  }) => {
    const seeded = await seedFolder(extensionWorker, 'E2E Row Keys', [
      { title: 'Row Folder', children: [] },
      { title: 'Row Link One', url: 'https://e2e.invalid/one' },
      { title: 'Row Link Two', url: 'https://e2e.invalid/two' },
    ]);
    await page.goto(managerUrl(extensionId, seeded.folderId));
    await expect(page.locator('tbody tr')).toHaveCount(3);

    await page.keyboard.press('j');
    expect(await focusedRowIndex(page)).toBe(0);
    await page.keyboard.press('j');
    expect(await focusedRowIndex(page)).toBe(1);
    await page.keyboard.press('j');
    await page.keyboard.press('j');
    expect(await focusedRowIndex(page)).toBe(2);
    await page.keyboard.press('k');
    expect(await focusedRowIndex(page)).toBe(1);
    // Shift+J is not j.
    await page.keyboard.press('Shift+J');
    expect(await focusedRowIndex(page)).toBe(1);

    // k stops at the first row; then walk down to the folder wherever the sort put it.
    const folderIndex = await page.evaluate(() =>
      Array.from(document.querySelectorAll('main tbody tr')).findIndex((row) =>
        row.textContent?.includes('Row Folder'),
      ),
    );
    await page.keyboard.press('k');
    await page.keyboard.press('k');
    expect(await focusedRowIndex(page)).toBe(0);
    for (let step = 0; step < folderIndex; step += 1) await page.keyboard.press('j');
    const folderRowLocator = page.locator('tbody tr').filter({ hasText: 'Row Folder' });
    await expect(folderRowLocator).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`id=${seeded.ids['Row Folder']}$`));
  });
});
