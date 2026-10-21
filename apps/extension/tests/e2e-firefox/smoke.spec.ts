import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { error, Key, until } from 'selenium-webdriver';
import { STORAGE_ITEMS, storageAreaKey } from '../../src/lib/storage/registry';
import { By, expect, type FirefoxExtension, test } from './fixtures';

/**
 * Firefox runtime smoke suite for the MV2 build. It covers one representative path per surface;
 * the full behavior matrix runs in Chromium and Edge. See apps/docs/content/docs/status.mdx for the
 * APIs that differ in Firefox.
 */

const SETTINGS_KEY = storageAreaKey(STORAGE_ITEMS.settings);

type SeedItem = { title: string; url?: string; children?: SeedItem[] };

/** Creates a folder of items under the first writable root (Bookmarks Menu in Firefox). */
function seedFolder(extension: FirefoxExtension, title: string, items: SeedItem[]) {
  return extension.call(
    async (browser, { folderTitle, entries }) => {
      const [root] = await browser.bookmarks.getTree();
      const writableRoot = root.children?.find((node) => node.children !== undefined);
      if (!writableRoot) throw new Error('No writable bookmark root found');
      const folder = await browser.bookmarks.create({
        parentId: writableRoot.id,
        title: folderTitle,
      });
      const ids: Record<string, string> = {};
      const createItems = async (parentId: string, nodes: typeof entries) => {
        for (const node of nodes) {
          const created = await browser.bookmarks.create({
            parentId,
            title: node.title,
            ...(node.url ? { url: node.url } : {}),
          });
          ids[node.title] = created.id;
          if (node.children) await createItems(created.id, node.children);
        }
      };
      await createItems(folder.id, entries);
      return { folderId: folder.id, rootTitle: writableRoot.title, ids };
    },
    { folderTitle: title, entries: items },
  );
}

function childrenOf(extension: FirefoxExtension, folderId: string) {
  return extension.call(async (browser, id) => {
    const children = await browser.bookmarks.getChildren(id);
    return children.map((item) => ({ title: item.title, url: item.url ?? null }));
  }, folderId);
}

function setSettings(extension: FirefoxExtension, values: Record<string, unknown>) {
  return extension.call(
    async (browser, { key, v, updates }) => {
      const stored = (await browser.storage.sync.get(key))[key] as { data?: object } | undefined;
      await browser.storage.sync.set({ [key]: { v, data: { ...stored?.data, ...updates } } });
    },
    { key: SETTINGS_KEY, v: STORAGE_ITEMS.settings.v, updates: values },
  );
}

function readSettings(extension: FirefoxExtension) {
  return extension.call(async (browser, key) => {
    const stored = (await browser.storage.sync.get(key))[key] as { data?: object } | undefined;
    return (stored?.data ?? {}) as Record<string, unknown>;
  }, SETTINGS_KEY);
}

async function openTools(extension: FirefoxExtension, folderId: string) {
  await extension.open(`bookmarks.html?id=${folderId}`);
  await (await extension.find('button[title="Show tools"]')).click();
  await extension.find('[data-testid="tools-sidebar"]');
}

async function clickToolButton(extension: FirefoxExtension, tool: string, button: string) {
  const xpath =
    `//*[@data-testid="tools-sidebar"]//h4[normalize-space()="${tool}"]` +
    `/ancestor::div[.//button][1]//button[normalize-space()="${button}"]`;
  const element = await extension.driver.findElement(By.xpath(xpath));
  await extension.driver.executeScript('arguments[0].scrollIntoView({ block: "center" })', element);
  await element.click();
}

/** Picks `scope` (a folder name or All Bookmarks) in a tool card's scope menu, its last select. */
async function chooseToolScope(extension: FirefoxExtension, tool: string, scope: string) {
  const xpath =
    `//*[@data-testid="tools-sidebar"]//h4[normalize-space()="${tool}"]` +
    `/ancestor::div[.//button][1]//button[@role="combobox"]`;
  const selects = await extension.driver.findElements(By.xpath(xpath));
  const select = selects.at(-1);
  if (!select) throw new Error(`${tool} has no scope menu`);
  await extension.driver.executeScript('arguments[0].scrollIntoView({ block: "center" })', select);
  await select.click();
  const option = await extension.driver.wait(
    until.elementLocated(By.xpath(`//*[@role="option"][normalize-space()="${scope}"]`)),
    5000,
  );
  await extension.driver.wait(until.elementIsVisible(option), 5000);
  await option.click();
}

const visibleRows = (extension: FirefoxExtension) => extension.countVisible('tbody tr');

test('popup search finds a bookmark and hides non-matching ones', async ({ extension }) => {
  await seedFolder(extension, 'E2E Firefox Popup', [
    { title: 'Popup Match', url: 'https://e2e.invalid/popup-match' },
    { title: 'Different Link', url: 'https://e2e.invalid/different' },
  ]);

  await extension.open('popup.html');
  const search = await extension.find('input.search-input');
  await search.sendKeys('Popup Match');

  await extension.findByText('.bookmark-item', 'Popup Match');
  await expect
    .poll(async () => {
      const titles: string[] = [];
      for (const row of await extension.driver.findElements(By.css('.bookmark-item'))) {
        titles.push(await row.getText());
      }
      return titles;
    })
    .toEqual([expect.stringContaining('Popup Match')]);
});

test('popup creates a folder inside a seeded folder', async ({ extension }) => {
  const folder = await seedFolder(extension, 'E2E Firefox Actions', [
    { title: 'Existing Link', url: 'https://e2e.invalid/existing' },
  ]);

  await extension.open('popup.html');
  await (await extension.findByText('.folder-item', folder.rootTitle)).click();
  const row = await extension.findByText('.folder-item', 'E2E Firefox Actions');
  await extension.driver.actions().move({ origin: row }).perform();
  await (await row.findElement(By.css('button[title="Add folder"]'))).click();
  const name = await extension.find('input[placeholder="Enter folder name..."]');
  await name.sendKeys('Created in Firefox', Key.ENTER);

  await expect
    .poll(() => childrenOf(extension, folder.folderId))
    .toContainEqual({ title: 'Created in Firefox', url: null });
});

test('side panel page renders the bookmark tree and searches', async ({ extension }) => {
  // Firefox shows this page through sidebar_action; automation cannot open the sidebar itself
  // (sidebarAction.open needs a user gesture), so the panel page is loaded in a tab.
  await seedFolder(extension, 'E2E Firefox Sidebar', [
    { title: 'Sidebar Match', url: 'https://e2e.invalid/sidebar' },
  ]);

  await extension.open('sidepanel.html');
  const search = await extension.find('input.search-input');
  await search.sendKeys('Sidebar Match');
  await extension.findByText('.bookmark-item', 'Sidebar Match');
});

test('popup and side panel open the bookmark manager in a new tab', async ({ extension }) => {
  // Firefox cannot replace its bookmarks page, so this button is the way into the manager.
  const { driver } = extension;
  for (const page of ['popup.html', 'sidepanel.html']) {
    await extension.open(page);
    const before = await driver.getAllWindowHandles();
    await (await extension.find('button[aria-label="Open bookmark manager"]')).click();

    let opened: string | undefined;
    await driver.wait(async () => {
      const handles = await driver.getAllWindowHandles();
      opened = handles.find((handle) => !before.includes(handle));
      return opened !== undefined;
    }, 10_000);
    const origin = await driver.getWindowHandle();
    await driver.switchTo().window(opened as string);
    // A manager opened without a folder shows the bookmarks toolbar and names it in the address.
    await driver.wait(
      async () =>
        (await driver.getCurrentUrl()) === `${extension.url('bookmarks.html')}?id=toolbar_____`,
      10_000,
    );
    await extension.find('button[title="Show tools"]');
    await driver.close();
    await driver.switchTo().window(origin);
  }
});

test('popup shows saved site icons and a generic icon instead of a broken browser icon', async ({
  extension,
}) => {
  // Firefox has no `_favicon` service, so only icons saved by Refresh Site Icons can show.
  const icon =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  await seedFolder(extension, 'E2E Firefox Icons', [
    { title: 'Icon Saved Link', url: 'https://icons-saved.e2e.invalid/page' },
    { title: 'Icon Missing Link', url: 'https://icons-missing.e2e.invalid/page' },
  ]);
  await extension.call(
    async (browser, { key, v, value }) => {
      await browser.storage.local.set({
        [key]: {
          v,
          data: { 'https://icons-saved.e2e.invalid': { icon: value, fetchedAt: Date.now() } },
        },
      });
    },
    { key: storageAreaKey(STORAGE_ITEMS.siteIcons), v: STORAGE_ITEMS.siteIcons.v, value: icon },
  );

  await extension.open('popup.html');
  await (await extension.find('input.search-input')).sendKeys('Icon ');
  // Saved icons load from storage after the first render, so re-read the row until they apply.
  const iconOf = async (title: string) => {
    const row = await extension.findByText('.bookmark-item', title);
    const element = await row.findElement(By.css('[data-icon-source]'));
    return {
      source: await element.getAttribute('data-icon-source'),
      src: await element.getAttribute('src'),
    };
  };
  await expect.poll(() => iconOf('Icon Saved Link')).toEqual({ source: 'saved', src: icon });
  expect((await iconOf('Icon Missing Link')).source).toBe('fallback');
});

test('bookmark manager loads a folder, filters titles, and opens subfolders', async ({
  extension,
}) => {
  const folder = await seedFolder(extension, 'E2E Firefox Manager', [
    { title: 'Alpha Item', url: 'https://e2e.invalid/alpha' },
    { title: 'Beta Item', url: 'https://e2e.invalid/beta' },
    { title: 'Nested Folder', children: [{ title: 'Inside', url: 'https://e2e.invalid/inside' }] },
  ]);

  await extension.open(`bookmarks.html?id=${folder.folderId}`);
  await expect.poll(() => visibleRows(extension)).toBe(3);

  await (await extension.find('input[placeholder="Search titles and addresses"]')).sendKeys(
    'alpha',
  );
  await expect.poll(() => visibleRows(extension)).toBe(1);
  await extension.findByText('tbody tr', 'Alpha Item');

  await extension.open(`bookmarks.html?id=${folder.ids['Nested Folder']}`);
  await expect.poll(() => visibleRows(extension)).toBe(1);
  await extension.findByText('tbody tr', 'Inside');
});

test('a separator shows as a separator in the manager and the popup, never as a data: link', async ({
  extension,
}) => {
  const folder = await seedFolder(extension, 'E2E Firefox Separators', [
    { title: 'Above', url: 'https://e2e.invalid/above' },
  ]);
  await extension.call(async (browser, id) => {
    await browser.bookmarks.create({ parentId: id, type: 'separator' });
    await browser.bookmarks.create({
      parentId: id,
      title: 'Below',
      url: 'https://e2e.invalid/below',
    });
  }, folder.folderId);

  await extension.open(`bookmarks.html?id=${folder.folderId}`);
  await expect.poll(() => visibleRows(extension)).toBe(3);
  await extension.findByText('tbody tr', 'Separator');
  expect(await extension.countVisible('a[href^="data:"]')).toBe(0);

  await extension.open('popup.html');
  await (await extension.findByText('.folder-item', folder.rootTitle)).click();
  await (await extension.findByText('.folder-item', 'E2E Firefox Separators')).click();
  await extension.findByText('.bookmark-item', 'Below');
  await expect.poll(() => extension.countVisible('[data-slot="tree-separator"]')).toBe(1);
  expect(await extension.countVisible('a[href^="data:"]')).toBe(0);
});

test('bookmark manager keeps the search in the address and links to its own page', async ({
  extension,
}) => {
  const folder = await seedFolder(extension, 'E2E Firefox Address', [
    { title: 'Gamma Item', url: 'https://e2e.invalid/gamma' },
    { title: 'Delta Item', url: 'https://e2e.invalid/delta' },
  ]);
  const { driver } = extension;

  await extension.open('bookmarks.html?q=Gamma');
  await expect.poll(() => visibleRows(extension)).toBe(1);
  await extension.findByText('tbody tr', 'Gamma Item');

  await extension.open(`bookmarks.html?id=${folder.folderId}`);
  await expect.poll(() => visibleRows(extension)).toBe(2);
  await (await extension.find('input[placeholder="Search titles and addresses"]')).sendKeys(
    'Delta',
  );
  await expect
    .poll(async () => new URL(await driver.getCurrentUrl()).searchParams.get('q'))
    .toBe('Delta');

  // Firefox has no browser manager to replace, so the link opens the extension page itself.
  await driver.executeScript(`
    window.__copied = [];
    Object.defineProperty(navigator.clipboard, 'writeText', {
      value: async (text) => { window.__copied.push(text); },
    });
  `);
  await (await extension.find('button[aria-label="Copy link to this folder"]')).click();
  await expect
    .poll(() => driver.executeScript<string[]>('return window.__copied'))
    .toEqual([`${extension.url('bookmarks.html')}?id=${folder.folderId}`]);
});

test('manager Delete and Ctrl/Cmd+Z use the undo history in session storage', async ({
  extension,
}) => {
  await setSettings(extension, { confirmBeforeDelete: false });
  const folder = await seedFolder(extension, 'E2E Firefox Undo', [
    { title: 'Undo Keep', url: 'https://e2e.invalid/keep' },
    { title: 'Undo Gone', url: 'https://e2e.invalid/gone' },
  ]);
  await extension.open(`bookmarks.html?id=${folder.folderId}`);
  await expect.poll(() => visibleRows(extension)).toBe(2);

  // A click on a cell selects and focuses its row; keys then go to the focused row.
  await (await extension.findByText('tbody td', 'Undo Gone')).click();
  const { driver } = extension;
  await driver.actions().sendKeys(Key.DELETE).perform();
  await expect.poll(async () => (await childrenOf(extension, folder.folderId)).length).toBe(1);

  const mod = process.platform === 'darwin' ? Key.COMMAND : Key.CONTROL;
  await driver.actions().keyDown(mod).sendKeys('z').keyUp(mod).perform();
  await expect
    .poll(async () => (await childrenOf(extension, folder.folderId)).map((item) => item.title))
    .toEqual(['Undo Keep', 'Undo Gone']);
});

test('manager folder tree moves with the arrow keys and opens a folder with Enter (Space on a Mac)', async ({
  extension,
}) => {
  const folder = await seedFolder(extension, 'E2E Firefox Tree', [
    { title: 'Tree First', children: [] },
    { title: 'Tree Second', children: [] },
  ]);
  await extension.open(`bookmarks.html?id=${folder.folderId}`);
  const { driver } = extension;
  const focusedTitle = () =>
    driver.executeScript<string>(`return document.activeElement?.textContent?.trim() ?? ''`);
  // Firefox has no account storage, so there are no headings: the seeded folder is level 2.
  const current = await extension.find(`[role="treeitem"][data-folder-id="${folder.folderId}"]`);
  expect(await current.getAttribute('aria-level')).toBe('2');
  expect(await current.getAttribute('tabindex')).toBe('0');
  await driver.executeScript(
    `document.querySelector('[role="treeitem"][data-folder-id="${folder.folderId}"]').focus()`,
  );
  await driver.actions().sendKeys(Key.ARROW_DOWN, Key.ARROW_DOWN).perform();
  await expect.poll(focusedTitle).toBe('Tree Second');
  // On a Mac, Enter renames the folder, as on the table's rows; Space opens it everywhere.
  await driver
    .actions()
    .sendKeys(process.platform === 'darwin' ? Key.SPACE : Key.ENTER)
    .perform();
  await expect.poll(() => driver.getCurrentUrl()).toContain(`id=${folder.ids['Tree Second']}`);
});

test('manager right-click menu copies and pastes, without private windows unless allowed', async ({
  extension,
}) => {
  const folder = await seedFolder(extension, 'E2E Firefox Menu', [
    { title: 'Menu Target', children: [] },
    { title: 'Menu Link', url: 'https://e2e.invalid/menu' },
  ]);
  await extension.open(`bookmarks.html?id=${folder.folderId}`);
  await expect.poll(() => visibleRows(extension)).toBe(2);
  const { driver } = extension;
  const menuItems = () =>
    driver.executeScript<string[]>(
      `return [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((item) => item.textContent.trim())`,
    );

  await driver
    .actions()
    .contextClick(await extension.findByText('tbody td', 'Menu Link'))
    .perform();
  await expect.poll(menuItems).toContain('Copy');
  // A temporary add-on is not allowed in private windows, so Firefox offers none.
  expect(await menuItems()).toContain('Open in new window');
  expect(await menuItems()).not.toContain('Open in private window');
  await (await extension.findByText('[role="menuitem"]', 'Copy')).click();

  await driver
    .actions()
    .contextClick(await extension.findByText('tbody td', 'Menu Target'))
    .perform();
  await expect.poll(menuItems).toContain('Paste');
  await driver.executeScript(
    `[...document.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent.trim() === 'Paste').click()`,
  );
  // A row's Paste goes next to the row, in the folder shown, as in Chrome.
  await expect
    .poll(async () => (await childrenOf(extension, folder.folderId)).map((item) => item.title))
    .toEqual(['Menu Target', 'Menu Link', 'Menu Link']);
});

test('manager drag and drop reorders rows and turns dropped links into bookmarks', async ({
  extension,
}) => {
  const folder = await seedFolder(extension, 'E2E Firefox Drag', [
    { title: 'Drag Box', children: [] },
    { title: 'Drag First', url: 'https://e2e.invalid/first' },
    { title: 'Drag Last', url: 'https://e2e.invalid/last' },
  ]);
  await extension.open(`bookmarks.html?id=${folder.folderId}`);
  await expect.poll(() => visibleRows(extension)).toBe(3);
  // The default Sort Order is the browser's, so rows reorder without turning anything on.
  const titles = async (id: string) => (await childrenOf(extension, id)).map((item) => item.title);

  // The browser's drag events, with one DataTransfer from dragstart to drop as a real drag has.
  // Moving down within a folder is where Firefox's move index differs from Chrome's.
  await extension.driver.executeScript(`
    const row = (title) => [...document.querySelectorAll('tbody tr')].find((item) => item.textContent.includes(title));
    const source = row('Drag Box');
    const target = row('Drag Last');
    const transfer = new DataTransfer();
    const box = target.getBoundingClientRect();
    const at = { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: box.left + 200, clientY: box.bottom - 2 };
    source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    target.dispatchEvent(new DragEvent('dragover', at));
    target.dispatchEvent(new DragEvent('drop', at));
    source.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
  `);
  await expect.poll(() => titles(folder.folderId)).toEqual(['Drag First', 'Drag Last', 'Drag Box']);

  // A link dropped from another page on a folder in the tree goes into it.
  await extension.driver.executeScript(`
    const target = [...document.querySelectorAll('[data-testid="folder-tree"] [role="treeitem"]')].find((item) => item.textContent.trim() === 'Drag Box');
    const transfer = new DataTransfer();
    transfer.setData('text/x-moz-url', 'https://e2e.invalid/dropped\\nDropped Page');
    const at = { bubbles: true, cancelable: true, dataTransfer: transfer };
    target.dispatchEvent(new DragEvent('dragover', at));
    target.dispatchEvent(new DragEvent('drop', at));
  `);
  await expect.poll(() => titles(folder.ids['Drag Box'])).toEqual(['Dropped Page']);
});

test('extension pages share Web Locks, which serialize storage writes', async ({ extension }) => {
  // The MV2 background page cannot be scripted here; it shares the pages' origin, and so their
  // locks. Hold a lock in one extension page and look for it from another.
  await extension.call(async () => {
    void navigator.locks.request('sync:settings', () => new Promise(() => undefined));
  }, null);
  await extension.open('options.html');
  await extension.find('[role="tab"]');
  const held = await extension.driver.executeAsyncScript<string[]>(
    `const done = arguments[arguments.length - 1];
     navigator.locks.query().then((state) => done((state.held ?? []).map((lock) => lock.name)));`,
  );
  expect(held).toContain('sync:settings');
});

/**
 * Clicks `css` after scrolling it to the middle, clear of the sticky footer. Options sections
 * above can still be growing as they load. Visibility alone does not wait for smooth scrolling:
 * wait for a hit-tested target with stable bounds before asking WebDriver to click it.
 */
async function clickCentered(extension: FirefoxExtension, css: string) {
  let scrollRequested = false;
  let previousBounds: number[] | undefined;
  let stableSamples = 0;
  const resetScroll = () => {
    scrollRequested = false;
    previousBounds = undefined;
    stableSamples = 0;
  };
  await expect
    .poll(async () => {
      try {
        const element = await extension.find(css);
        if (!scrollRequested) {
          await extension.driver.executeScript(
            'arguments[0].scrollIntoView({ block: "center" })',
            element,
          );
          scrollRequested = true;
          return false;
        }
        const { bounds, ready } = await extension.driver.executeScript<{
          bounds: number[];
          ready: boolean;
        }>(
          `const element = arguments[0], rect = element.getBoundingClientRect();
           const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
           return {
             bounds: [rect.left, rect.top, rect.width, rect.height],
             ready: rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.top >= 0
               && rect.right <= innerWidth && rect.bottom <= innerHeight
               && element.contains(document.elementFromPoint(x, y)),
           };`,
          element,
        );
        const stable = previousBounds?.every((value, index) => value === bounds[index]);
        stableSamples = stable ? stableSamples + 1 : 0;
        previousBounds = bounds;
        if (stableSamples < 2) return false;
        if (!ready) {
          // A completed scroll can still leave the control covered after a section grows.
          resetScroll();
          return false;
        }
        await element.click();
        return true;
      } catch (interactionError) {
        if (
          interactionError instanceof error.ElementClickInterceptedError ||
          interactionError instanceof error.ElementNotInteractableError ||
          interactionError instanceof error.StaleElementReferenceError
        ) {
          // Layout or a re-render changed between the geometry sample and the native click.
          resetScroll();
          return false;
        }
        throw interactionError;
      }
    })
    .toBe(true);
}

/** The keys Firefox has for a command now (`''` for none). */
function shortcutOf(extension: FirefoxExtension, name: string) {
  return extension.call(
    async (browser, command) =>
      (await browser.commands.getAll()).find((entry) => entry.name === command)?.shortcut ?? null,
    name,
  );
}

test('a quick save command without keys shows the popup notice, and Options records and resets keys', async ({
  extension,
}) => {
  await setSettings(extension, { language: 'en' });
  // Firefox can clear a shortcut, as Chrome does when another extension already has the keys.
  await extension.call(async (browser) => {
    type Update = (detail: { name: string; shortcut: string }) => Promise<void>;
    await (browser.commands as unknown as { update: Update }).update({
      name: 'ai-quick-save',
      shortcut: '',
    });
  }, null);
  await extension.open('popup.html');
  await extension.findByText(
    '[data-testid="quick-save-shortcut-notice"]',
    'Quick save shortcut not set',
  );

  // The shortcut recorders are on Saving & Search, not on Essentials, where Options opens.
  await extension.open('options.html?category=search');
  const recorder = '[data-command="ai-quick-save"] [data-slot="shortcut-recorder"]';
  await clickCentered(extension, recorder);
  await extension.driver
    .actions()
    .keyDown(Key.ALT)
    .keyDown(Key.SHIFT)
    .sendKeys('k')
    .keyUp(Key.SHIFT)
    .keyUp(Key.ALT)
    .perform();
  await expect.poll(() => shortcutOf(extension, 'ai-quick-save')).toBe('Alt+Shift+K');

  // Firefox's own bookmark keys are refused: Firefox would still bookmark the page with them.
  // Chrome and Edge show how to give them to quick save instead; Firefox has no such hint.
  expect(await extension.countVisible('[data-testid="bookmark-key-hint"]')).toBe(0);
  const accel = process.platform === 'darwin' ? Key.META : Key.CONTROL;
  await clickCentered(extension, recorder);
  await extension.driver.actions().keyDown(accel).sendKeys('d').keyUp(accel).perform();
  await extension.findByText(
    '[data-command="ai-quick-save"]',
    `The browser uses ${process.platform === 'darwin' ? '⌘D' : 'Ctrl+D'} itself, so it would never reach Bookmark Scout.`,
  );
  expect(await shortcutOf(extension, 'ai-quick-save')).toBe('Alt+Shift+K');

  // A letter on its own is explained under the field and not saved.
  await clickCentered(extension, recorder);
  await extension.driver.actions().sendKeys('j').perform();
  await extension.find('[data-command="ai-quick-save"] [aria-invalid="true"]');
  expect(await shortcutOf(extension, 'ai-quick-save')).toBe('Alt+Shift+K');
  // Another row recording keys clears that explanation, which was about the keys before.
  await clickCentered(extension, '[data-command="quick-save"] [data-slot="shortcut-recorder"]');
  await extension.driver.actions().sendKeys(Key.F9).perform();
  await expect.poll(() => shortcutOf(extension, 'quick-save')).toBe('F9');
  await expect
    .poll(() =>
      extension.driver.executeScript<number>(
        'return document.querySelectorAll(\'[data-command="ai-quick-save"] [aria-invalid="true"]\').length',
      ),
    )
    .toBe(0);
  // Tab is not recorded: it moves on to the field's reset button.
  await clickCentered(extension, recorder);
  await extension.driver.actions().sendKeys(Key.TAB).perform();
  expect(
    await extension.driver.executeScript<string | null>(
      'return document.activeElement?.getAttribute("aria-label") ?? null',
    ),
  ).toBe('Reset Quick save the current page with AI to default');

  await clickCentered(extension, '[data-command="ai-quick-save"] button[aria-label^="Reset"]');
  await expect.poll(() => shortcutOf(extension, 'ai-quick-save')).toBe('Alt+Shift+D');
});

test('options saves a setting to sync storage and keeps it after reload', async ({ extension }) => {
  await setSettings(extension, { language: 'en', showFavicons: true });

  await extension.open('options.html');
  // Essentials opens first; wait for the tabs, then switch to Appearance.
  await extension.find('[role="tab"]');
  await extension.driver
    .findElement(By.xpath('//button[@role="tab" and normalize-space()="Appearance"]'))
    .click();
  const switchSelector = '[data-setting="showFavicons"] [role="switch"]';
  await (await extension.find(switchSelector)).click();

  await expect.poll(async () => (await readSettings(extension)).showFavicons).toBe(false);
  await expect
    // The status is empty and hidden after a successful save, so read it without a visibility wait.
    .poll(() =>
      extension.driver.executeScript<string>(
        "return document.querySelector('[data-testid=\"settings-save-status\"]')?.textContent ?? 'missing'",
      ),
    )
    .toBe('');

  await extension.driver.navigate().refresh();
  await extension.find('[role="tab"]');
  await extension.driver
    .findElement(By.xpath('//button[@role="tab" and normalize-space()="Appearance"]'))
    .click();
  await expect
    .poll(async () => (await extension.find(switchSelector)).getAttribute('aria-checked'))
    .toBe('false');
});

test('AI waits for data collection consent, and there is no browser icon cache setting', async ({
  extension,
}) => {
  // Firefox 140+ reports built-in data collection consent; nothing is granted at install.
  const consent = await extension.call(async (browser) => {
    const permissions = browser.permissions as unknown as {
      getAll: () => Promise<{ data_collection?: string[] }>;
      contains: (request: { data_collection: string[] }) => Promise<boolean>;
    };
    return {
      granted: (await permissions.getAll()).data_collection ?? null,
      bookmarks: await permissions.contains({ data_collection: ['bookmarksInfo'] }),
    };
  }, null);
  expect(consent).toEqual({ granted: [], bookmarks: false });

  // A synced "AI on" without consent (for example from before consent existed) counts as off.
  await setSettings(extension, { language: 'en', aiEnabled: true });
  await extension.open('options.html');
  // Firefox has no icon cache for extensions, so that setting is absent from Appearance.
  // Essentials opens first; wait for the tabs, then switch to Appearance.
  await extension.find('[role="tab"]');
  await extension.driver
    .findElement(By.xpath('//button[@role="tab" and normalize-space()="Appearance"]'))
    .click();
  await extension.find('[data-setting="showFavicons"]');
  expect(
    await extension.driver.executeScript<boolean>(
      'return document.querySelector(\'[data-setting="browserIconCache"]\') !== null',
    ),
  ).toBe(false);

  await extension.driver
    .findElement(By.xpath('//button[@role="tab" and normalize-space()="AI"]'))
    .click();
  const aiSwitch = await extension.find('[data-setting="aiEnabled"] [role="switch"]');
  await expect.poll(() => aiSwitch.getAttribute('aria-checked')).toBe('false');
  expect((await readSettings(extension)).aiEnabled).toBe(true);

  // Turning AI on explains where the data goes before Firefox's own consent prompt, whose
  // wording ("the developer says the extension wants to collect") reads as if we receive it.
  await aiSwitch.click();
  const dialog = await extension.find('[role="dialog"]');
  const explanation = await dialog.getText();
  expect(explanation).toContain('Bookmark Scout has no server and never receives this data.');
  // Firefox's prompt names "the developer"; the dialog says that means the user's AI company.
  expect(explanation).toContain('Here that means the AI company you chose');
  await dialog.findElement(By.xpath('.//button[normalize-space()="Not now"]')).click();
  await extension.driver.wait(
    async () => (await extension.driver.findElements(By.css('[role="dialog"]'))).length === 0,
    5000,
  );
  expect(await aiSwitch.getAttribute('aria-checked')).toBe('false');
});

test('a tool run asks Firefox for its bookmarks’ site only, inside the declared website access', async ({
  extension,
}) => {
  const folder = await seedFolder(extension, 'E2E Firefox Site Access', [
    { title: 'Site Page', url: 'https://www.e2e.invalid/one' },
    { title: 'Same Site Page', url: 'http://e2e.invalid/two' },
  ]);
  // Tools start on all bookmarks by default; this run covers the folder's sites only.
  await setSettings(extension, { deadLinksDefaultScope: 'folder' });
  await openTools(extension, folder.folderId);
  await clickToolButton(extension, 'Check Dead Links', 'Scan');
  const dialog = await extension.findByText('[role="dialog"]', 'Allow access to websites?');
  expect(await dialog.getText()).toContain(
    'Your browser will ask for access to this site only: e2e.invalid.',
  );
  // The click is real user input. Optional permission prompts are off in this profile
  // (fixtures.ts), so Firefox grants what it accepts, and rejects origins outside the manifest.
  await dialog.findElement(By.xpath('.//button[normalize-space()="Allow access"]')).click();
  const origins = () =>
    extension.call(async (browser) => (await browser.permissions.getAll()).origins ?? [], null);
  await expect
    .poll(origins)
    .toEqual(expect.arrayContaining(['http://*.e2e.invalid/*', 'https://*.e2e.invalid/*']));
  expect(await origins()).not.toContain('https://*/*');
});

test('JSON export downloads the folder and importing it restores a deleted bookmark and separator', async ({
  extension,
}, testInfo) => {
  const folder = await seedFolder(extension, 'E2E Firefox Data', [
    { title: 'Round Trip Link', url: 'https://e2e.invalid/round-trip' },
  ]);
  // Firefox gives a separator the URL `data:`; it must stay a separator (L17).
  await extension.call(async (browser, id) => {
    await browser.bookmarks.create({ parentId: id, type: 'separator' });
  }, folder.folderId);
  await setSettings(extension, { dataDefaultExportFormat: 'json' });

  await openTools(extension, folder.folderId);
  // The export starts on all bookmarks; this one exports the open folder.
  await chooseToolScope(extension, 'Export Bookmarks', 'E2E Firefox Data');
  await clickToolButton(extension, 'Export Bookmarks', 'Export');

  let exportedName = '';
  await expect
    .poll(() => {
      // Firefox writes a .part file while downloading.
      exportedName =
        readdirSync(extension.downloadDirectory).find((name) => name.endsWith('.json')) ?? '';
      return exportedName;
    })
    .toMatch(/^bookmarks_E2E_Firefox_Data_\d{4}-\d{2}-\d{2}\.json$/);
  const raw = readFileSync(path.join(extension.downloadDirectory, exportedName), 'utf8');
  expect(raw).toContain('Round Trip Link');
  expect(raw).toContain('"type": "separator"');
  expect(raw).not.toContain('data:');

  await extension.call(async (browser, id) => {
    for (const child of await browser.bookmarks.getChildren(id)) {
      await browser.bookmarks.remove(child.id);
    }
  }, folder.folderId);
  await expect.poll(() => childrenOf(extension, folder.folderId)).toEqual([]);

  const importFile = testInfo.outputPath('round-trip.json');
  writeFileSync(importFile, raw);
  await extension.driver.findElement(By.css('#bookmark-import-input')).sendKeys(importFile);
  const importButton = await extension.driver.wait(
    async () => {
      const [button] = await extension.driver.findElements(
        By.xpath('//*[@role="dialog"]//button[normalize-space()="Import"]'),
      );
      return button && (await button.isDisplayed()) ? button : false;
    },
    10_000,
    'Import preview did not open',
  );
  await importButton.click();

  // A folder export keeps its folder, so the import recreates it inside the current folder.
  await expect
    .poll(() =>
      extension.call(async (browser, id) => {
        const [tree] = await browser.bookmarks.getSubTree(id);
        return (tree.children ?? []).map((child) => ({
          title: child.title,
          children: (child.children ?? []).map((item) => [item.title, item.url, item.type]),
        }));
      }, folder.folderId),
    )
    .toEqual([
      {
        title: 'E2E Firefox Data',
        children: [
          ['Round Trip Link', 'https://e2e.invalid/round-trip', 'bookmark'],
          ['', 'data:', 'separator'],
        ],
      },
    ]);
});

test('statistics and privacy scanner run without website access', async ({ extension }) => {
  const folder = await seedFolder(extension, 'E2E Firefox Reports', [
    { title: 'Safe Link', url: 'https://e2e.invalid/safe' },
    { title: 'Privacy Link', url: 'https://e2e.invalid/private?token=fixture' },
  ]);

  await openTools(extension, folder.folderId);
  await clickToolButton(extension, 'Bookmark Statistics', 'View');
  const statistics = await extension.findByText('[role="dialog"]', 'Bookmark Statistics');
  expect(await statistics.getText()).toContain('2');
  await statistics.sendKeys(Key.ESCAPE);
  await extension.driver.wait(async () => (await extension.countVisible('[role="dialog"]')) === 0);

  await clickToolButton(extension, 'Privacy Scanner', 'Scan');
  const privacy = await extension.findByText('[role="dialog"]', 'Privacy Link');
  await expect.poll(() => privacy.getText()).toContain('Sensitive query parameter: token');
});

test('Check Dead Links runs as a background job that goes on after its page closes (J01)', async ({
  extension,
}) => {
  // A local server that holds each request until the test lets them all through.
  const requests: string[] = [];
  const waiting: ServerResponse[] = [];
  let gateOpen = false;
  const answer = (res: ServerResponse) => {
    if (res.writableEnded || res.destroyed) return;
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<title>Held</title>');
  };
  const server = createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`);
    if (gateOpen) answer(res);
    else waiting.push(res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const folder = await seedFolder(extension, 'E2E Firefox Job', [
      { title: 'Job Link 1', url: `${origin}/1` },
      { title: 'Job Link 2', url: `${origin}/2` },
      { title: 'Job Link 3', url: `${origin}/3` },
    ]);
    await setSettings(extension, {
      deadLinksConcurrency: 1,
      deadLinksRetryCount: 0,
      deadLinksFollowRedirects: false,
      deadLinksDefaultScope: 'folder',
    });
    await openTools(extension, folder.folderId);
    await clickToolButton(extension, 'Check Dead Links', 'Scan');
    const dialog = await extension.findByText('[role="dialog"]', 'Allow access to websites?');
    await dialog.findElement(By.xpath('.//button[normalize-space()="Allow access"]')).click();
    await expect.poll(() => requests.length).toBe(1);

    // The manager closes; the background page carries on with the job.
    await extension.open('options.html');
    gateOpen = true;
    for (const res of waiting) answer(res);
    const storedJob = () =>
      extension.call(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('bookmark-scout-jobs');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const jobs = await new Promise<{ state: string; done: { succeeded: number } }[]>(
          (resolve, reject) => {
            const request = db.transaction('jobs').objectStore('jobs').getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          },
        );
        db.close();
        return jobs.map((job) => ({ state: job.state, succeeded: job.done.succeeded }));
      }, null);
    await expect
      .poll(storedJob, { timeout: 15_000 })
      .toEqual([{ state: 'succeeded', succeeded: 3 }]);
    expect(requests.sort()).toEqual(['HEAD /1', 'HEAD /2', 'HEAD /3']);

    // Any page shows the finished job and its results.
    await openTools(extension, folder.folderId);
    await clickToolButton(extension, 'Check Dead Links', 'Review results');
    const results = await extension.findByText('[role="dialog"]', 'Job Link 3');
    expect(await results.getText()).toContain('Reachable');
  } finally {
    server.close();
    server.closeAllConnections();
  }
});
