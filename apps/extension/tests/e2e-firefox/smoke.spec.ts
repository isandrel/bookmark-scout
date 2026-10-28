import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { error, Key, until } from 'selenium-webdriver';
import { STORAGE_ITEMS, storageAreaKey } from '../../src/lib/storage/registry';
import { solidPng } from '../solid-png';
import { By, expect, type FirefoxExtension, test } from './fixtures';

/**
 * Firefox runtime smoke suite for the MV2 build. It covers one representative path per surface;
 * the full behavior matrix runs in Chromium and Edge. See apps/docs/content/docs/status.mdx for the
 * APIs that differ in Firefox.
 */

const SETTINGS_KEY = storageAreaKey(STORAGE_ITEMS.settings);
const DEVICE_SETTINGS_KEY = storageAreaKey(STORAGE_ITEMS.deviceSettings);

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

/** The changed settings kept on this device only (`DEVICE_SETTING_KEYS`). */
function readDeviceSettings(extension: FirefoxExtension) {
  return extension.call(async (browser, key) => {
    const stored = (await browser.storage.local.get(key))[key] as { data?: object } | undefined;
    return (stored?.data ?? {}) as Record<string, unknown>;
  }, DEVICE_SETTINGS_KEY);
}

async function openTools(extension: FirefoxExtension, folderId: string) {
  await extension.open(`bookmarks.html?id=${folderId}`);
  await (await extension.find('button[title="Show tools"]')).click();
  await extension.find('[data-testid="tools-sidebar"]');
  // The sidebar opens on one tab (Tools Sidebar Layout is Tabs); the first tab shows every tool.
  await (await extension.find('[data-testid="tools-tabs"] [role="radio"]')).click();
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

/**
 * Waits for a downloaded JSON file whose name matches and resolves to its name and text. Firefox
 * writes a .part file first, and can show the final name before it has written all of the file,
 * so the file counts only once its text parses.
 */
async function downloadedJson(extension: FirefoxExtension, name: RegExp) {
  let file = { name: '', raw: '' };
  await expect
    .poll(() => {
      const found = readdirSync(extension.downloadDirectory).find((entry) => name.test(entry));
      if (!found) return '';
      const raw = readFileSync(path.join(extension.downloadDirectory, found), 'utf8');
      try {
        JSON.parse(raw);
      } catch {
        return '';
      }
      file = { name: found, raw };
      return found;
    })
    .toMatch(name);
  return file;
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

  await (
    await extension.find('input[placeholder="Search titles, addresses, folders, and tags"]')
  ).sendKeys('alpha');
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

  // In the cards view too (Visual Cards V09): a separator card, with no address, link, or room
  // for a cover, between the two bookmark cards.
  await (await extension.find('button[aria-label="Cards"]')).click();
  const cards = '[data-testid="bookmark-cards"] [data-slot="bookmark-card"]';
  await expect.poll(() => extension.countVisible(cards)).toBe(3);
  const separator = await extension.findByText(cards, 'Separator');
  expect(await separator.findElements(By.css('a, [data-testid="bookmark-card-media"]'))).toEqual(
    [],
  );
  expect(await extension.countVisible(`${cards} [data-testid="bookmark-card-media"]`)).toBe(2);
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
  await (
    await extension.find('input[placeholder="Search titles, addresses, folders, and tags"]')
  ).sendKeys('Delta');
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

test('an operator query finds tagged bookmarks by site in the popup and the manager (U38)', async ({
  extension,
}) => {
  const folder = await seedFolder(extension, 'E2E Firefox Operators', [
    { title: 'Operator Keep', url: 'https://keep.e2e.invalid/a' },
    { title: 'Operator Other Site', url: 'https://skip.e2e.invalid/b' },
    { title: 'Operator Untagged', url: 'https://keep.e2e.invalid/c' },
  ]);
  const metadata = STORAGE_ITEMS.bookmarkMetadata;
  await extension.call(
    async (browser, { key, v, data }) => {
      await browser.storage.local.set({ [key]: { v, data } });
    },
    {
      key: storageAreaKey(metadata),
      v: metadata.v,
      data: {
        [folder.ids['Operator Keep'] as string]: { tags: ['Reading'] },
        [folder.ids['Operator Other Site'] as string]: { tags: ['reading'] },
      },
    },
  );
  const query = 'tag:reading -domain:skip.e2e.invalid';
  const texts = async (css: string) => {
    const found: string[] = [];
    for (const row of await extension.driver.findElements(By.css(css))) {
      if (await row.isDisplayed()) found.push(await row.getText());
    }
    return found;
  };

  await extension.open('popup.html');
  await (await extension.find('input.search-input')).sendKeys(query);
  await extension.findByText('.bookmark-item', 'Operator Keep');
  await expect
    .poll(() => texts('.bookmark-item'))
    .toEqual([expect.stringMatching(/^Operator Keep\b[\s\S]*tag: Reading/)]);

  await extension.open(`bookmarks.html?q=${encodeURIComponent(query)}`);
  await extension.findByText('tbody tr', 'Operator Keep');
  await expect.poll(() => texts('tbody tr')).toEqual([expect.stringContaining('Operator Keep')]);
  expect(
    await extension.driver.executeScript<string>(
      'return document.querySelector(\'input[placeholder="Search titles, addresses, folders, and tags"]\').value',
    ),
  ).toBe(query);
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

test('a password-protected settings backup saves and restores with Web Crypto in Firefox', async ({
  extension,
}, testInfo) => {
  await setSettings(extension, { language: 'en', theme: 'dark' });
  await extension.open('options.html');
  await extension.find('[role="tab"]');
  await extension.driver
    .findElement(By.xpath('//button[normalize-space()="Back up settings"]'))
    .click();
  await extension.find('[data-testid="backup-export-dialog"] [data-testid="backup-part-meta"]');
  await (await extension.find('[data-testid="backup-protection"] [role="checkbox"]')).click();
  const password = 'firefox backup password';
  for (const field of await extension.driver.findElements(
    By.css('[data-testid="backup-password-fields"] input'),
  )) {
    await field.sendKeys(password);
  }
  await extension.driver
    .findElement(By.xpath('//*[@role="dialog"]//button[normalize-space()="Save backup"]'))
    .click();
  const { raw } = await downloadedJson(
    extension,
    /^bookmark-scout-backup_\d{4}-\d{2}-\d{2}_.+_protected\.json$/,
  );
  expect(JSON.parse(raw).sections).toEqual({});
  expect(raw).not.toContain('dark');

  await setSettings(extension, { theme: 'light' });
  const file = testInfo.outputPath('protected-backup.json');
  writeFileSync(file, raw);
  await extension.driver
    .findElement(By.css('input[type="file"][aria-label="Restore settings"]'))
    .sendKeys(file);
  await (await extension.find('[data-testid="backup-unlock"] input')).sendKeys(password);
  await extension.driver
    .findElement(By.xpath('//*[@data-testid="backup-unlock"]//button[normalize-space()="Unlock"]'))
    .click();
  const importButton = await extension.driver.wait(
    async () => {
      if ((await extension.driver.findElements(By.css('[data-testid="backup-unlock"]'))).length) {
        return false;
      }
      const [button] = await extension.driver.findElements(
        By.xpath('//*[@role="dialog"]//button[starts-with(normalize-space(), "Import (")]'),
      );
      return button && (await button.isEnabled()) ? button : false;
    },
    20_000,
    'The protected parts did not unlock',
  );
  // A real click: the Backup exported notice keeps clear of the dialog's buttons.
  await importButton.click();
  await extension.find('[data-testid="backup-import-result"]');
  await expect.poll(async () => (await readSettings(extension)).theme).toBe('dark');
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

  const { raw } = await downloadedJson(
    extension,
    /^bookmarks_E2E_Firefox_Data_\d{4}-\d{2}-\d{2}\.json$/,
  );
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

/**
 * A local server whose pages ("Page /1", with a paragraph of readable text) answer only once the
 * test opens the gate.
 */
async function startHeldServer() {
  const requests: string[] = [];
  const waiting: ServerResponse[] = [];
  let gateOpen = false;
  const answer = (res: ServerResponse, path: string) => {
    if (res.writableEnded || res.destroyed) return;
    res.writeHead(200, { 'content-type': 'text/html' });
    // Only the page number goes into the HTML, never the raw request path.
    const page = Number(/^\/(\d+)$/.exec(path)?.[1] ?? 0);
    res.end(
      `<head><title>Page /${page}</title></head><body><article><h1>Page ${page}</h1>` +
        `<p>${'Field notes about a quokka under a peppermint tree. '.repeat(12)}</p></article></body>`,
    );
  };
  const paths = new Map<ServerResponse, string>();
  const server = createServer((req, res) => {
    const path = req.url ?? '/';
    requests.push(`${req.method} ${path}`);
    paths.set(res, path);
    if (gateOpen) answer(res, path);
    else waiting.push(res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    requests,
    open: () => {
      gateOpen = true;
      for (const res of waiting) answer(res, paths.get(res) ?? '/');
    },
    close: () => {
      server.close();
      server.closeAllConnections();
    },
  };
}

/** The stored jobs' kinds, states, and checked counts. */
function storedJobs(extension: FirefoxExtension) {
  return extension.call(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('bookmark-scout-jobs');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const jobs = await new Promise<{ kind: string; state: string; done: { succeeded: number } }[]>(
      (resolve, reject) => {
        const request = db.transaction('jobs').objectStore('jobs').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      },
    );
    db.close();
    return jobs.map((job) => ({ kind: job.kind, state: job.state, succeeded: job.done.succeeded }));
  }, null);
}

/** How many pages the page text index keeps, read from an extension page. */
function indexedPageTexts(extension: FirefoxExtension) {
  return extension.call(async () => {
    const names = (await indexedDB.databases()).map((db) => db.name);
    if (!names.includes('bookmark-scout-page-text')) return 0;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('bookmark-scout-page-text');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      if (!db.objectStoreNames.contains('pages')) return 0;
      return await new Promise<number>((resolve, reject) => {
        const request = db.transaction('pages').objectStore('pages').count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }, null);
}

/** Starts `tool` from the manager, grants the site, and closes the manager once a request held. */
async function startJobAndClosePage(
  extension: FirefoxExtension,
  server: Awaited<ReturnType<typeof startHeldServer>>,
  folderId: string,
  tool: string,
  button = 'Scan',
  /** The button that starts the run in the site choice, for a tool that asks for one first. */
  startWithSites?: string,
) {
  await openTools(extension, folderId);
  await clickToolButton(extension, tool, button);
  if (startWithSites) {
    const choice = await extension.findByText('[role="dialog"]', 'Choose sites to read');
    await choice.findElement(By.xpath(`.//button[normalize-space()="${startWithSites}"]`)).click();
  }
  const dialog = await extension.findByText('[role="dialog"]', 'Allow access to websites?');
  await dialog.findElement(By.xpath('.//button[normalize-space()="Allow access"]')).click();
  // Index Page Text reads several pages at a time; the others are set to one.
  await expect.poll(() => server.requests.length).toBeGreaterThan(0);
  // The manager closes; the background page carries on with the job.
  await extension.open('options.html');
  server.open();
}

test('Check Dead Links runs as a background job that goes on after its page closes (J01)', async ({
  extension,
}) => {
  const server = await startHeldServer();
  try {
    const folder = await seedFolder(extension, 'E2E Firefox Job', [
      { title: 'Job Link 1', url: `${server.origin}/1` },
      { title: 'Job Link 2', url: `${server.origin}/2` },
      { title: 'Job Link 3', url: `${server.origin}/3` },
    ]);
    await setSettings(extension, {
      deadLinksConcurrency: 1,
      deadLinksRetryCount: 0,
      deadLinksFollowRedirects: false,
      deadLinksDefaultScope: 'folder',
    });
    await startJobAndClosePage(extension, server, folder.folderId, 'Check Dead Links');
    await expect
      .poll(() => storedJobs(extension), { timeout: 15_000 })
      .toEqual([{ kind: 'deadLinks', state: 'succeeded', succeeded: 3 }]);
    expect(server.requests.sort()).toEqual(['HEAD /1', 'HEAD /2', 'HEAD /3']);

    // Any page shows the finished job and its results.
    await openTools(extension, folder.folderId);
    await clickToolButton(extension, 'Check Dead Links', 'Review results');
    const results = await extension.findByText('[role="dialog"]', 'Job Link 3');
    expect(await results.getText()).toContain('Reachable');
  } finally {
    server.close();
  }
});

test('Metadata Fetcher runs as a background job whose titles a later page applies (J01, J05)', async ({
  extension,
}) => {
  const server = await startHeldServer();
  try {
    const folder = await seedFolder(extension, 'E2E Firefox Metadata', [
      { title: 'Old 1', url: `${server.origin}/1` },
      { title: 'Old 2', url: `${server.origin}/2` },
    ]);
    await setSettings(extension, {
      metadataFetcherConcurrency: 1,
      metadataFetcherOverwriteTitles: true,
      metadataFetcherDefaultScope: 'folder',
    });
    await startJobAndClosePage(extension, server, folder.folderId, 'Metadata Fetcher');
    // Firefox's background page parses the page heads itself.
    await expect
      .poll(() => storedJobs(extension), { timeout: 15_000 })
      .toEqual([{ kind: 'metadataFetcher', state: 'succeeded', succeeded: 2 }]);

    await openTools(extension, folder.folderId);
    await clickToolButton(extension, 'Metadata Fetcher', 'Review results');
    const results = await extension.findByText('[role="dialog"]', 'Page /2');
    await results.findElement(By.xpath('.//button[normalize-space()="Apply 2 titles"]')).click();
    await expect
      .poll(() => childrenOf(extension, folder.folderId))
      .toEqual([
        { title: 'Page /1', url: `${server.origin}/1` },
        { title: 'Page /2', url: `${server.origin}/2` },
      ]);
  } finally {
    server.close();
  }
});

test('Index Page Text runs as a background job that reads the text in the background page frame, and taking back the site’s access deletes its text (S25, S46)', async ({
  extension,
}) => {
  const server = await startHeldServer();
  try {
    const folder = await seedFolder(extension, 'E2E Firefox Page Text', [
      { title: 'Notes 1', url: `${server.origin}/1` },
      { title: 'Notes 2', url: `${server.origin}/2` },
    ]);
    await setSettings(extension, {
      pageTextEnabled: true,
      pageTextDefaultScope: 'folder',
      // The test server is on this computer.
      readPageSkipPrivateHosts: false,
    });
    await startJobAndClosePage(
      extension,
      server,
      folder.folderId,
      'Index Page Text',
      'Index',
      'Start with 1 site',
    );
    await expect
      .poll(() => storedJobs(extension), { timeout: 15_000 })
      .toEqual([{ kind: 'pageText', state: 'succeeded', succeeded: 2 }]);

    await openTools(extension, folder.folderId);
    await clickToolButton(extension, 'Index Page Text', 'Review results');
    const results = await extension.findByText('[role="dialog"]', 'Notes 2');
    expect(await results.getText()).toContain('quokka');
    await results
      .findElement(By.xpath('.//button[normalize-space()="Save text of 2 pages"]'))
      .click();
    await expect.poll(() => indexedPageTexts(extension)).toBe(2);

    // S46: the background page hears the access taken back and deletes the site's text.
    await extension.call(
      (browser) =>
        browser.permissions.remove({ origins: ['http://127.0.0.1/*', 'https://127.0.0.1/*'] }),
      null,
    );
    await expect.poll(() => indexedPageTexts(extension)).toBe(0);
  } finally {
    server.close();
  }
});

/** A local OpenAI-compatible service that moves every bookmark it is sent into "<folder>/Sorted". */
async function startSortingProvider(folder: string) {
  const prompts: string[] = [];
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
  };
  const server = createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      res.end();
      return;
    }
    let body = '';
    for await (const chunk of req) body += chunk;
    const { messages } = JSON.parse(body) as { messages: { content: string }[] };
    const prompt = messages.at(-1)?.content ?? '{}';
    prompts.push(prompt);
    const { bookmarks } = JSON.parse(prompt) as { bookmarks: { id: string; title: string }[] };
    const answer = {
      operations: bookmarks.map((bookmark) => ({
        bookmarkId: bookmark.id,
        bookmarkTitle: bookmark.title,
        toFolderPath: `${folder}/Sorted`,
        confidence: 0.9,
        reason: 'Sorted',
      })),
      summary: 'Sorted',
    };
    res.writeHead(200, { ...cors, 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        id: 'chatcmpl_e2e',
        object: 'chat.completion',
        created: 0,
        model: 'e2e-model',
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: { role: 'assistant', content: JSON.stringify(answer) },
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    baseUrl: `http://localhost:${(server.address() as AddressInfo).port}/v1`,
    prompts,
    close: () => {
      server.close();
      server.closeAllConnections();
    },
  };
}

test('AI Folder Reorganization runs as a background job through the background page frame (J41, J61)', async ({
  extension,
}) => {
  const provider = await startSortingProvider('E2E Firefox Reorg');
  try {
    const folder = await seedFolder(extension, 'E2E Firefox Reorg', [
      { title: 'First', url: 'https://e2e.invalid/first' },
      { title: 'Second', url: 'https://e2e.invalid/second' },
      { title: 'Third', url: 'https://e2e.invalid/third' },
    ]);
    await extension.call(
      async (browser, { services, credentials, v, baseUrl }) => {
        await browser.storage.local.set({
          [services]: {
            v,
            data: {
              services: [
                {
                  id: 'custom',
                  name: 'custom',
                  provider: 'custom',
                  model: 'e2e-model',
                  enabled: true,
                },
              ],
              defaultServiceId: 'custom',
            },
          },
          [credentials]: { v, data: { custom: { apiKey: 'synthetic-e2e-key', baseUrl } } },
        });
      },
      {
        services: storageAreaKey(STORAGE_ITEMS.aiServices),
        credentials: storageAreaKey(STORAGE_ITEMS.aiCredentials),
        v: STORAGE_ITEMS.aiServices.v,
        baseUrl: provider.baseUrl,
      },
    );
    await setSettings(extension, {
      language: 'en',
      reorganizationEnabled: true,
      reorganizationMinConfidence: 0.5,
      reorganizationBatchSize: 2,
      reorganizationDefaultScope: 'folder',
    });
    // Firefox asks for data collection consent when AI is turned on; prompts are off here.
    await extension.open('options.html');
    await extension.find('[role="tab"]');
    await extension.driver
      .findElement(By.xpath('//button[@role="tab" and normalize-space()="AI"]'))
      .click();
    await (await extension.find('[data-setting="aiEnabled"] [role="switch"]')).click();
    const consent = await extension.find('[role="dialog"]');
    await consent.findElement(By.xpath('.//button[normalize-space()="Allow access"]')).click();
    await expect.poll(async () => (await readSettings(extension)).aiEnabled).toBe(true);

    await openTools(extension, folder.folderId);
    await clickToolButton(extension, 'AI Folder Reorganization', 'Analyze');
    // Two bookmarks a request: three make two requests, sent from the background page.
    await expect
      .poll(() => storedJobs(extension), { timeout: 15_000 })
      .toEqual([{ kind: 'reorganization', state: 'succeeded', succeeded: 2 }]);
    expect(provider.prompts).toHaveLength(2);
    expect((await childrenOf(extension, folder.folderId)).map((item) => item.title)).toEqual([
      'First',
      'Second',
      'Third',
    ]);

    const review = await extension.findByText('[role="dialog"]', 'New folders: 1');
    await review.findElement(By.xpath('.//button[normalize-space()="Apply Changes"]')).click();
    await expect
      .poll(async () => (await childrenOf(extension, folder.folderId)).map((item) => item.title))
      .toEqual(['Sorted']);
  } finally {
    provider.close();
  }
});

test('applying in the background moves a separator and leaves the browser folders alone (J63)', async ({
  extension,
}) => {
  const folder = await seedFolder(extension, 'E2E Firefox Apply', [
    { title: 'Target', children: [] },
    { title: 'First', url: 'https://e2e.invalid/first' },
    { title: 'Second', url: 'https://e2e.invalid/second' },
  ]);
  const ids = await extension.call(async (api, parentId: string) => {
    const separator = await api.bookmarks.create({ parentId, type: 'separator' });
    const [toolbar] = await api.bookmarks.get('toolbar_____');
    return { separator: separator.id, toolbar: toolbar?.id ?? '', toolbarTitle: toolbar?.title };
  }, folder.folderId);
  const response = await extension.call(
    (api, command) => api.runtime.sendMessage({ type: 'bookmark-scout:job-command', command }),
    {
      type: 'apply',
      commandId: crypto.randomUUID(),
      source: 'manager',
      tool: 'tools_aiReorganize',
      changes: [
        { kind: 'move', id: ids.separator, title: '', to: { parentId: folder.ids.Target } },
        // The browser refuses to move its own folders; the rest goes on.
        {
          kind: 'move',
          id: ids.toolbar,
          title: ids.toolbarTitle ?? '',
          to: { parentId: folder.ids.Target },
        },
        { kind: 'move', id: folder.ids.Second, title: 'Second', to: { parentId: folder.folderId } },
      ],
    },
  );
  expect((response as { ok: boolean }).ok).toBe(true);
  const job = () =>
    extension.call(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('bookmark-scout-jobs');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const jobs = await new Promise<{ kind: string; state: string; done: unknown }[]>(
        (resolve, reject) => {
          const request = db.transaction('jobs').objectStore('jobs').getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        },
      );
      db.close();
      const apply = jobs.find((stored) => stored.kind === 'applyChanges');
      return apply ? { state: apply.state, done: apply.done } : undefined;
    }, undefined);
  await expect.poll(job, { timeout: 15_000 }).toEqual({
    state: 'partial',
    done: { succeeded: 2, skipped: 0, failed: 1 },
  });
  const after = await extension.call(
    async (api, { target, toolbar }: { target: string; toolbar: string }) => ({
      inTarget: (await api.bookmarks.getChildren(target)).map((node) => node.type),
      toolbarParent: (await api.bookmarks.get(toolbar))[0]?.parentId,
    }),
    { target: folder.ids.Target, toolbar: ids.toolbar },
  );
  expect(after).toEqual({ inTarget: ['separator'], toolbarParent: 'root________' });
});

test('Fetch Covers keeps a copy Firefox drew of a page image, and the cards show it', async ({
  extension,
}) => {
  const server = createServer((req, res) => {
    if (req.url === '/cover.png') {
      res.writeHead(200, { 'content-type': 'image/png' });
      res.end(solidPng(1200, 630));
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<head><title>Story</title><meta property="og:image" content="/cover.png"></head>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const folder = await seedFolder(extension, 'E2E Firefox Covers', [
      { title: 'Story', url: `${origin}/story` },
    ]);
    // The test server is on this computer, which the setting otherwise skips.
    await setSettings(extension, {
      coversEnabled: true,
      coversDefaultScope: 'folder',
      readPageSkipPrivateHosts: false,
    });
    await openTools(extension, folder.folderId);
    await clickToolButton(extension, 'Fetch Covers', 'Fetch');
    const access = await extension.findByText('[role="dialog"]', 'Allow access to websites?');
    await access.findElement(By.xpath('.//button[normalize-space()="Allow access"]')).click();
    const review = await extension.findByText('[role="dialog"]', 'Save 1 cover');
    await review.findElement(By.xpath('.//button[normalize-space()="Save 1 cover"]')).click();
    const stored = () =>
      extension.call(
        () =>
          new Promise<string[]>((resolve) => {
            const open = indexedDB.open('bookmark-scout-covers');
            open.onsuccess = () => {
              const db = open.result;
              if (!db.objectStoreNames.contains('images')) return resolve([]);
              const all = db.transaction('images').objectStore('images').getAll();
              all.onsuccess = () =>
                resolve((all.result as { type: string }[]).map((image) => image.type));
            };
          }),
        undefined,
      );
    // Firefox writes WebP from a canvas, or PNG where it cannot; either is a picture it drew.
    await expect.poll(stored).toEqual([expect.stringMatching(/^image\/(webp|png)$/)]);

    await extension.open(`bookmarks.html?id=${folder.folderId}`);
    await (await extension.find('button[title="Cards"]')).click();
    const image = await extension.find('[data-testid="bookmark-cover"]');
    expect(await image.getAttribute('src')).toMatch(/^blob:/);
  } finally {
    server.close();
    server.closeAllConnections();
  }
});

/** The stored covers, as their info and image type, read from the covers database. */
function storedCovers(extension: FirefoxExtension) {
  return extension.call(
    async () =>
      // Opening a database that does not exist would create it empty, without its stores.
      !(await indexedDB.databases()).some((db) => db.name === 'bookmark-scout-covers')
        ? []
        : new Promise<{ bookmarkId: string; width: number; height: number; type: string }[]>(
            (resolve) => {
              const open = indexedDB.open('bookmark-scout-covers');
              open.onsuccess = () => {
                const db = open.result;
                if (!db.objectStoreNames.contains('info')) {
                  db.close();
                  return resolve([]);
                }
                const read = db.transaction(['info', 'images']);
                const infos = read.objectStore('info').getAll();
                const images = read.objectStore('images').getAll();
                read.oncomplete = () => {
                  db.close();
                  resolve(
                    (infos.result as { bookmarkId: string; width: number; height: number }[]).map(
                      ({ bookmarkId, width, height }, index) => ({
                        bookmarkId,
                        width,
                        height,
                        type: (images.result[index] as { type: string } | undefined)?.type ?? '',
                      }),
                    ),
                  );
                };
              };
            },
          ),
    undefined,
  );
}

test('Use this view as the cover: Firefox refuses a picture without activeTab, and keeps the one it drew only once saved (V30, V35)', async ({
  extension,
}) => {
  const url = 'https://e2e.invalid/captured-story';
  const folder = await seedFolder(extension, 'E2E Firefox Capture', [
    { title: 'Captured story', url },
  ]);
  await setSettings(extension, { coversEnabled: true, coversWidthPx: 320 });
  await extension.open('popup.html');
  await extension.find('input.search-input');
  // The popup opens as a tab here, so the current tab is stubbed to the bookmarked page as the
  // toolbar popup would see it, and the popup reads it again as it does when its window is focused.
  const stubTab = (picture: string | null) =>
    extension.driver.executeAsyncScript(
      `const [pageUrl, png, done] = arguments;
       browser.tabs.getCurrent().then((tab) => {
         browser.tabs.query = async () => [{
           id: tab.id, index: 0, windowId: tab.windowId, active: true, incognito: false,
           title: 'Captured story', url: pageUrl,
         }];
         if (png) browser.tabs.captureVisibleTab = async () => png;
         window.dispatchEvent(new Event('focus'));
         done();
       });`,
      url,
      picture,
    );
  const capture = '[data-testid="capture-cover"]';

  // Firefox's own captureVisibleTab: without the activeTab a toolbar click gives, it refuses.
  await stubTab(null);
  await clickCentered(extension, capture);
  await extension.findByText(
    '[role="status"]',
    'The browser did not allow a picture of this tab. Open the toolbar popup on the page and try again.',
  );
  expect(await storedCovers(extension)).toEqual([]);

  // A picture of the tab, which Firefox decodes, shrinks, and draws again.
  await stubTab(`data:image/png;base64,${solidPng(1280, 800).toString('base64')}`);
  await clickCentered(extension, capture);
  let dialog = await extension.findByText('[role="dialog"]', 'Use this view as the cover?');
  const preview = await dialog.findElement(By.css('[data-testid="capture-cover-preview"]'));
  expect(await preview.getAttribute('src')).toMatch(/^data:image\/(webp|png);base64,/);
  // Escape closes it from the keyboard, and nothing is kept.
  await extension.driver.actions().sendKeys(Key.ESCAPE).perform();
  await expect.poll(() => extension.countVisible('[role="dialog"]')).toBe(0);
  expect(await storedCovers(extension)).toEqual([]);

  await clickCentered(extension, capture);
  dialog = await extension.findByText('[role="dialog"]', 'Use this view as the cover?');
  await dialog.findElement(By.xpath('.//button[normalize-space()="Save cover"]')).click();
  await expect
    .poll(() => storedCovers(extension))
    .toEqual([
      {
        bookmarkId: folder.ids['Captured story'],
        width: 320,
        height: 200,
        type: expect.stringMatching(/^image\/(webp|png)$/),
      },
    ]);
});

test('the bookmark preview opens from a card with its key, steps with the arrows, and Escape gives focus back (V35)', async ({
  extension,
}) => {
  const folder = await seedFolder(extension, 'E2E Firefox Preview', [
    { title: 'Card One', url: 'https://one.e2e.invalid/a' },
    { title: 'Card Two', url: 'https://two.e2e.invalid/b' },
    { title: 'Card Three', url: 'https://three.e2e.invalid/c' },
  ]);
  const { driver } = extension;
  await extension.open(`bookmarks.html?id=${folder.folderId}`);
  await (await extension.find('button[title="Cards"]')).click();
  const card = (title: string) => `[data-slot="bookmark-card"][data-row-id="${folder.ids[title]}"]`;
  const focusedRow = () =>
    driver.executeScript<string | null>(
      'return document.activeElement?.getAttribute("data-row-id") ?? null',
    );
  /** The open preview's accessible name and whether keyboard focus is inside it. */
  const previewState = () =>
    driver.executeScript<{ role: string | null; name: string; focusInside: boolean } | null>(
      `const dialog = [...document.querySelectorAll('[data-testid="bookmark-preview"]')]
         .find((element) => element.checkVisibility());
       if (!dialog) return null;
       const label = document.getElementById(dialog.getAttribute('aria-labelledby') ?? '');
       return {
         role: dialog.getAttribute('role'),
         name: label?.textContent?.trim() ?? '',
         focusInside: dialog.contains(document.activeElement),
       };`,
    );

  await clickCentered(extension, card('Card One'));
  await driver.actions().sendKeys(Key.ARROW_RIGHT).perform();
  await expect.poll(focusedRow).toBe(folder.ids['Card Two']);
  await driver.actions().sendKeys('p').perform();
  await expect.poll(previewState).toEqual({ role: 'dialog', name: 'Card Two', focusInside: true });
  const dialog = await extension.find('[data-testid="bookmark-preview"]');
  expect(await dialog.getText()).toContain('https://two.e2e.invalid/b');

  // Tab keeps focus inside, and the arrow key steps to the next bookmark.
  for (let step = 0; step < 6; step += 1) {
    await driver.actions().sendKeys(Key.TAB).perform();
    await expect.poll(async () => (await previewState())?.focusInside).toBe(true);
  }
  await driver.actions().sendKeys(Key.ARROW_RIGHT).perform();
  await expect
    .poll(previewState)
    .toEqual({ role: 'dialog', name: 'Card Three', focusInside: true });

  // Escape closes it and gives focus to the card last shown.
  await driver.actions().sendKeys(Key.ESCAPE).perform();
  await expect.poll(previewState).toBeNull();
  await expect.poll(focusedRow).toBe(folder.ids['Card Three']);
});

test('a Smart Rule made in Settings is tested on a sample, then run from the Tools sidebar and applied (R40)', async ({
  extension,
}) => {
  const folder = await seedFolder(extension, 'E2E Firefox Rules', [
    { title: 'Rule Repo', url: 'https://github.com/org/repo' },
    { title: 'Rule Recipe', url: 'https://food.e2e.invalid/r' },
  ]);
  await setSettings(extension, { bookmarkRulesDefaultScope: 'folder' });

  await extension.open('options.html?category=maintenance');
  await clickCentered(extension, '[data-testid="rule-add"]');
  await (await extension.find('#rule-name')).sendKeys('GitHub');
  await (await extension.find('#rule-query')).sendKeys('domain:github.com');
  await (await extension.find('#rule-sample')).sendKeys('https://gist.github.com/x');
  await extension.findByText('[data-testid="rule-sample-result"]', 'Matches this search');
  await (await extension.find('#rule-tags')).sendKeys('code');
  await clickCentered(extension, '[data-testid="rule-save"]');
  await extension.findByText('[data-testid="bookmark-rule"]', 'GitHub');

  await openTools(extension, folder.folderId);
  await clickToolButton(extension, 'Smart Rules', 'Run');
  await extension.findByText('[data-testid="rule-item"]', 'Rule Repo');
  expect(await (await extension.find('[data-testid="review-confirm"]')).getText()).toBe(
    'Apply 1 change',
  );
  await clickCentered(extension, '[data-testid="review-confirm"]');
  const metadataKey = storageAreaKey(STORAGE_ITEMS.bookmarkMetadata);
  const tags = () =>
    extension.call(
      async (browser, { key, id }) => {
        const stored = (await browser.storage.local.get(key))[key] as
          | { data?: Record<string, { tags?: string[] }> }
          | undefined;
        return stored?.data?.[id]?.tags ?? [];
      },
      { key: metadataKey, id: folder.ids['Rule Repo'] as string },
    );
  await expect.poll(tags).toEqual(['code']);
  expect(
    await extension.call(
      async (browser, { key, id }) => {
        const stored = (await browser.storage.local.get(key))[key] as
          | { data?: Record<string, unknown> }
          | undefined;
        return stored?.data?.[id] ?? null;
      },
      { key: metadataKey, id: folder.ids['Rule Recipe'] as string },
    ),
  ).toBeNull();
  // The run is recorded for Settings: the rule's last run line.
  await extension.open('options.html?category=maintenance');
  await extension.findByText('[data-testid="rule-last-run"]', 'tagged 1, moved 0, left out 0');
});

test('Capture Covers While Browsing asks Firefox for all pages, then pictures a bookmarked page that loads', async ({
  extension,
}) => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<title>Browsed</title><body style="background:#2a6f97"><h1>Browsed</h1></body>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/story`;
  try {
    await seedFolder(extension, 'E2E Firefox Browse Covers', [{ title: 'Browsed', url }]);
    await setSettings(extension, { language: 'en', coversEnabled: true, coversWidthPx: 320 });
    await extension.open('options.html?category=metadataContent');
    const toggle = '[data-setting="coversBrowseCapture"] [role="switch"]';
    expect(await (await extension.find(toggle)).getAttribute('aria-checked')).toBe('false');
    // The click is real user input, and optional permission prompts are off in this profile
    // (fixtures.ts): Firefox grants `<all_urls>` from the explanation's button.
    await clickCentered(extension, toggle);
    const dialog = await extension.findByText(
      '[role="dialog"]',
      'Allow pictures of bookmarked pages',
    );
    await dialog.findElement(By.xpath('.//button[normalize-space()="Allow access"]')).click();
    await expect
      .poll(async () => (await extension.find(toggle)).getAttribute('aria-checked'))
      .toBe('true');
    expect(
      await extension.call(
        (browser) => browser.permissions.contains({ origins: ['<all_urls>'] }),
        null,
      ),
    ).toBe(true);

    // Options saves as it goes; the background follows once the setting is stored.
    await expect
      .poll(async () => (await readDeviceSettings(extension)).coversBrowseCapture)
      .toBe(true);
    // Browsing to the bookmarked page in this tab; the API tab stays in the back meanwhile.
    await extension.driver.get(url);
    await extension.driver.sleep(4_000);
    await expect
      .poll(() => storedCovers(extension), { timeout: 15_000 })
      .toEqual([expect.objectContaining({ width: 320 })]);
  } finally {
    server.close();
    server.closeAllConnections();
  }
});
