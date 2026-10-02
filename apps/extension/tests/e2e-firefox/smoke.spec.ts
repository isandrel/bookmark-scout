import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Key } from 'selenium-webdriver';
import { By, expect, type FirefoxExtension, test } from './fixtures';

/**
 * Firefox runtime smoke suite for the MV2 build. It covers one representative path per surface;
 * the full behavior matrix runs in Chromium and Edge. See apps/docs/content/docs/status.mdx for the
 * APIs that differ in Firefox.
 */

const SETTINGS_KEY = 'bookmark-scout-settings';

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
    async (browser, { key, updates }) => {
      const stored = await browser.storage.sync.get(key);
      await browser.storage.sync.set({ [key]: { ...(stored[key] ?? {}), ...updates } });
    },
    { key: SETTINGS_KEY, updates: values },
  );
}

function readSettings(extension: FirefoxExtension) {
  return extension.call(async (browser, key) => {
    const stored = await browser.storage.sync.get(key);
    return (stored[key] ?? {}) as Record<string, unknown>;
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

const visibleRows = (extension: FirefoxExtension) => extension.countVisible('tbody tr');

test('popup search finds a bookmark and hides non-matching ones', async ({ extension }) => {
  await seedFolder(extension, 'E2E Firefox Popup', [
    { title: 'Popup Match', url: 'https://e2e.invalid/popup-match' },
    { title: 'Different Link', url: 'https://e2e.invalid/different' },
  ]);

  await extension.open('popup.html');
  const search = await extension.find('input[placeholder="Search bookmarks..."]');
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
  const search = await extension.find('input[placeholder="Search bookmarks..."]');
  await search.sendKeys('Sidebar Match');
  await extension.findByText('.bookmark-item', 'Sidebar Match');
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

  await (await extension.find('input[placeholder="Filter titles..."]')).sendKeys('alpha');
  await expect.poll(() => visibleRows(extension)).toBe(1);
  await extension.findByText('tbody tr', 'Alpha Item');

  await extension.open(`bookmarks.html?id=${folder.ids['Nested Folder']}`);
  await expect.poll(() => visibleRows(extension)).toBe(1);
  await extension.findByText('tbody tr', 'Inside');
});

test('options saves a setting to sync storage and keeps it after reload', async ({ extension }) => {
  await setSettings(extension, { language: 'en', showFavicons: true });

  await extension.open('options.html');
  const switchSelector = '[data-setting="showFavicons"] [role="switch"]';
  await (await extension.find(switchSelector)).click();

  await expect.poll(async () => (await readSettings(extension)).showFavicons).toBe(false);
  await expect
    .poll(async () => (await extension.find('[data-testid="settings-save-status"]')).getText())
    .toBe('Settings saved');

  await extension.driver.navigate().refresh();
  await expect
    .poll(async () => (await extension.find(switchSelector)).getAttribute('aria-checked'))
    .toBe('false');
});

test('JSON export downloads the folder and importing it restores a deleted bookmark', async ({
  extension,
}, testInfo) => {
  const folder = await seedFolder(extension, 'E2E Firefox Data', [
    { title: 'Round Trip Link', url: 'https://e2e.invalid/round-trip' },
  ]);
  await setSettings(extension, { dataDefaultExportFormat: 'json' });

  await openTools(extension, folder.folderId);
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

  await extension.call(async (browser, id) => {
    await browser.bookmarks.remove(id);
  }, folder.ids['Round Trip Link']);
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
          children: (child.children ?? []).map((item) => [item.title, item.url]),
        }));
      }, folder.folderId),
    )
    .toEqual([
      {
        title: 'E2E Firefox Data',
        children: [['Round Trip Link', 'https://e2e.invalid/round-trip']],
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
