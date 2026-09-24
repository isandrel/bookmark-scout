import type { Page, Worker } from '@playwright/test';
import { expect, test } from './fixtures';

type SeedItem = { title: string; url?: string; children?: SeedItem[] };

const SETTINGS_KEY = 'bookmark-scout-settings';
const METADATA_KEY = 'bookmark-scout-bookmark-metadata';

/** Creates a folder under the first writable root and returns IDs keyed by title. */
async function seedFolder(worker: Worker, title: string, items: SeedItem[]) {
  return worker.evaluate(
    async ({ folderTitle, entries }) => {
      const [root] = await chrome.bookmarks.getTree();
      const writableRoot = root.children?.find((node) => node.children !== undefined);
      if (!writableRoot) throw new Error('No writable bookmark root found');

      const ids: Record<string, string> = {};
      const create = async (parentId: string, list: typeof entries) => {
        for (const entry of list) {
          const created = await chrome.bookmarks.create({
            parentId,
            title: entry.title,
            ...(entry.url ? { url: entry.url } : {}),
          });
          ids[entry.title] = created.id;
          if (entry.children) await create(created.id, entry.children);
        }
      };
      const folder = await chrome.bookmarks.create({ parentId: writableRoot.id, title: folderTitle });
      await create(folder.id, entries);
      return { folderId: folder.id, rootId: writableRoot.id, ids };
    },
    { folderTitle: title, entries: items },
  );
}

async function updateSettings(worker: Worker, patch: Record<string, unknown>) {
  await worker.evaluate(
    async ({ key, values }) => {
      const stored = await chrome.storage.sync.get(key);
      await chrome.storage.sync.set({ [key]: { ...(stored[key] ?? {}), ...values } });
    },
    { key: SETTINGS_KEY, values: patch },
  );
}

function managerUrl(extensionId: string, folderId?: string) {
  const base = `chrome-extension://${extensionId}/bookmarks.html`;
  return folderId ? `${base}?id=${folderId}` : base;
}

function row(page: Page, title: string) {
  return page.locator('tbody tr').filter({ hasText: title });
}

async function openRowMenu(page: Page, title: string) {
  await row(page, title).getByRole('button', { name: 'Open menu' }).click();
  await expect(page.getByRole('menu')).toBeVisible();
}

test.use({ viewport: { width: 1400, height: 900 } });

test('undo after delete restores tags and summaries for the whole subtree', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await updateSettings(extensionWorker, { confirmBeforeDelete: false });
  const seeded = await seedFolder(extensionWorker, 'E2E Metadata Restore', [
    {
      title: 'Tagged Folder',
      children: [{ title: 'Tagged Child', url: 'https://example.com/tagged-child' }],
    },
  ]);
  await extensionWorker.evaluate(
    async ({ key, childId }) => {
      await chrome.storage.local.set({
        [key]: { [childId]: { tags: ['keep-me'], summary: 'Survives undo' } },
      });
    },
    { key: METADATA_KEY, childId: seeded.ids['Tagged Child'] },
  );

  await page.goto(managerUrl(extensionId, seeded.folderId));
  await openRowMenu(page, 'Tagged Folder');
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(row(page, 'Tagged Folder')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(row(page, 'Tagged Folder')).toBeVisible();

  await expect
    .poll(() =>
      extensionWorker.evaluate(
        async ({ key, parentId }) => {
          const [folder] = await chrome.bookmarks.getChildren(parentId);
          const [child] = await chrome.bookmarks.getChildren(folder.id);
          const stored = (await chrome.storage.local.get(key))[key] ?? {};
          return { childTitle: child.title, metadata: stored[child.id] ?? null };
        },
        { key: METADATA_KEY, parentId: seeded.folderId },
      ),
    )
    .toEqual({
      childTitle: 'Tagged Child',
      metadata: { tags: ['keep-me'], summary: 'Survives undo' },
    });
});

function toolbar(page: Page) {
  return page.getByTestId('bookmark-table-toolbar');
}

function tree(page: Page) {
  return page.getByTestId('folder-tree');
}

function breadcrumbCurrent(page: Page) {
  return page.getByTestId('breadcrumb').locator('[aria-current="page"]');
}

test('manager, folder tree, and breadcrumb follow external bookmark changes', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Live', [
    { title: 'Live Child', children: [{ title: 'Deep Link', url: 'https://example.com/deep' }] },
    { title: 'Doomed Live Link', url: 'https://example.com/doomed-live' },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  await expect(page.locator('tbody tr')).toHaveCount(2);

  await extensionWorker.evaluate(async ({ parentId, rootId, doomedId }) => {
    await chrome.bookmarks.create({ parentId, title: 'External Link', url: 'https://example.com/ext' });
    await chrome.bookmarks.create({ parentId: rootId, title: 'E2E External Folder' });
    await chrome.bookmarks.remove(doomedId);
    await chrome.bookmarks.update(parentId, { title: 'E2E Live Renamed' });
  }, { parentId: seeded.folderId, rootId: seeded.rootId, doomedId: seeded.ids['Doomed Live Link'] });

  await expect(row(page, 'External Link')).toBeVisible();
  await expect(row(page, 'Doomed Live Link')).toHaveCount(0);
  await expect(breadcrumbCurrent(page)).toHaveText('E2E Live Renamed');
  await expect(tree(page).getByRole('button', { name: 'E2E Live Renamed', exact: true })).toBeVisible();
  await expect(tree(page).getByRole('button', { name: 'E2E External Folder', exact: true })).toBeVisible();

  // Deleting the open folder elsewhere falls back to its parent with a notice.
  await row(page, 'Live Child').click();
  await expect(breadcrumbCurrent(page)).toHaveText('Live Child');
  await extensionWorker.evaluate((id) => chrome.bookmarks.removeTree(id), seeded.ids['Live Child']);
  await expect(page.getByTestId('folder-notice')).toContainText("That folder doesn't exist anymore");
  await expect(page).toHaveURL(new RegExp(`id=${seeded.folderId}$`));
  await expect(breadcrumbCurrent(page)).toHaveText('E2E Live Renamed');
  await expect(tree(page).getByRole('button', { name: 'Live Child', exact: true })).toHaveCount(0);
});

test('in-page rename and delete refresh the folder tree', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await updateSettings(extensionWorker, { confirmBeforeDelete: false });
  const seeded = await seedFolder(extensionWorker, 'E2E Tree Sync', [
    { title: 'Dev', children: [] },
    { title: 'Scratch', children: [] },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  await expect(tree(page).getByRole('button', { name: 'Dev', exact: true })).toBeVisible();

  await openRowMenu(page, 'Dev');
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit folder' });
  await expect(dialog).toContainText('Change the name of this folder.');
  await dialog.getByLabel('Name').fill('  Development  ');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(tree(page).getByRole('button', { name: 'Development', exact: true })).toBeVisible();
  await expect(tree(page).getByRole('button', { name: 'Dev', exact: true })).toHaveCount(0);
  await expect
    .poll(() => extensionWorker.evaluate(async (id) => (await chrome.bookmarks.get(id))[0].title, seeded.ids.Dev))
    .toBe('Development');

  await openRowMenu(page, 'Scratch');
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(tree(page).getByRole('button', { name: 'Scratch', exact: true })).toHaveCount(0);
});

test('browser Back and Forward follow folder navigation only', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E History', [
    { title: 'History Child', children: [{ title: 'Child Link', url: 'https://example.com/c' }] },
    { title: 'History Link', url: 'https://example.com/h' },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  await expect(page.locator('tbody tr')).toHaveCount(2);
  const historyLength = () => page.evaluate(() => window.history.length);
  const start = await historyLength();

  await row(page, 'History Child').click();
  await expect(page).toHaveURL(new RegExp(`id=${seeded.ids['History Child']}$`));
  await expect(row(page, 'Child Link')).toBeVisible();
  expect(await historyLength()).toBe(start + 1);

  // Edits refresh the table without adding history entries.
  await openRowMenu(page, 'Child Link');
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Child Link Edited');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(row(page, 'Child Link Edited')).toBeVisible();
  expect(await historyLength()).toBe(start + 1);

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`id=${seeded.folderId}$`));
  await expect(row(page, 'History Link')).toBeVisible();
  await expect(breadcrumbCurrent(page)).toHaveText('E2E History');

  await page.goForward();
  await expect(row(page, 'Child Link Edited')).toBeVisible();
  await expect(breadcrumbCurrent(page)).toHaveText('History Child');
});

test('unknown or non-folder ids show a notice and fall back', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Bad Id', [
    { title: 'Not A Folder', url: 'https://example.com/not-folder' },
  ]);
  await page.goto(managerUrl(extensionId, '999999'));
  await expect(page.getByTestId('folder-notice')).toContainText("That folder doesn't exist anymore");
  await expect(page).not.toHaveURL(/id=/);
  await expect(page.locator('tbody tr').first()).toBeVisible();

  await page.goto(managerUrl(extensionId, seeded.ids['Not A Folder']));
  await expect(page.getByTestId('folder-notice')).toContainText("That item isn't a folder");
  await expect(page).toHaveURL(new RegExp(`id=${seeded.folderId}$`));
  await expect(row(page, 'Not A Folder')).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.getByTestId('folder-notice')).toHaveCount(0);
});

test('date filter includes today and the calendar lays out and highlights days', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Dates', [
    { title: 'Dated One', url: 'https://example.com/d1' },
    { title: 'Dated Two', url: 'https://example.com/d2' },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  await page.getByRole('checkbox', { name: 'Current folder only' }).check();

  await toolbar(page).getByRole('button', { name: 'Date Added' }).click();
  const grid = page.getByRole('grid').first();
  const weekdays = grid.locator('thead th');
  await expect(weekdays).toHaveCount(7);
  const boxes = await weekdays.evaluateAll((cells) =>
    cells.map((cell) => cell.getBoundingClientRect()).map(({ x, y }) => ({ x, y })),
  );
  expect(new Set(boxes.map((box) => Math.round(box.y))).size).toBe(1);
  expect(boxes.every((box, index) => index === 0 || box.x > boxes[index - 1].x)).toBe(true);

  const today = page.getByRole('button', { name: /^Today/ }).first();
  await today.click();
  const selectedBackground = await today.evaluate((button) => getComputedStyle(button).backgroundColor);
  expect(selectedBackground).not.toBe('rgba(0, 0, 0, 0)');
  await page.keyboard.press('Escape');

  await expect(page.locator('tbody tr')).toHaveCount(2);
  await expect(page.getByText('Page 1 of 1')).toBeVisible();
});

test('filters, date picker, and fallbacks are localized in Japanese', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await updateSettings(extensionWorker, { language: 'ja' });
  const seeded = await seedFolder(extensionWorker, 'E2E Localized', [
    { title: '', url: 'https://example.com/untitled' },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  await expect(page.locator('tbody tr').first()).toContainText('無題');

  await toolbar(page).getByRole('button', { name: '種類' }).click();
  await page.getByRole('option', { name: /フォルダ/ }).click();
  await expect(page.getByRole('option', { name: 'フィルタを解除' })).toBeVisible();
  await page.getByPlaceholder('種類').fill('zzz-no-match');
  await expect(page.getByText('該当する項目がありません。')).toBeVisible();
  await page.keyboard.press('Escape');

  await toolbar(page).getByRole('button', { name: '追加日' }).click();
  const grid = page.getByRole('grid').first();
  await expect(grid.locator('thead th').first()).toHaveText('日');
  await expect(page.getByText(/\d{4}年\d{1,2}月/).first()).toBeVisible();
  await page.getByRole('button', { name: /今日/ }).first().click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /追加日: \d{4}\/\d{2}\/\d{2}/ })).toBeVisible();
});

test('moves are explained until browser order is on, and keep the current page', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await updateSettings(extensionWorker, { sortOrder: 'date' });
  const items = Array.from({ length: 12 }, (_, index) => ({
    title: `Paged Item ${String(index + 1).padStart(2, '0')}`,
    url: `https://example.com/paged/${index + 1}`,
  }));
  const seeded = await seedFolder(extensionWorker, 'E2E Paged Moves', items);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  await expect(page.locator('tbody tr')).toHaveCount(10);

  const anyMove = page.getByRole('button', { name: 'Move up' }).first();
  await expect(anyMove).toBeDisabled();
  await expect(anyMove).toHaveAttribute('title', 'Turn on "Browser order" to move items');

  await page.getByRole('button', { name: 'Browser order' }).click();
  await expect(page.getByRole('button', { name: 'Browser order' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Go to next page' }).click();
  await expect(page.getByText('Page 2 of 2')).toBeVisible();
  await expect(page.locator('tbody tr').nth(0)).toContainText('Paged Item 11');

  const last = row(page, 'Paged Item 12');
  await last.hover();
  await last.getByRole('button', { name: 'Move up' }).click();
  await expect(page.locator('tbody tr').nth(0)).toContainText('Paged Item 12');
  await expect(page.getByText('Page 2 of 2')).toBeVisible();

  // Column sorting hides browser order again, so moves are disabled with a reason.
  await page.getByRole('button', { name: 'Title', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Asc' }).click();
  await expect(anyMove).toHaveAttribute('title', 'Clear column sorting to move items');
});

test('parent and domain facets list folders by path and group by registrable domain', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Facets', [
    { title: 'Same', children: [] },
    { title: 'Same', children: [] },
    { title: 'BBC News', url: 'https://news.bbc.co.uk/story' },
    { title: 'BBC Sport', url: 'https://www.bbc.co.uk/sport' },
    { title: 'NHK', url: 'https://www3.nhk.or.jp/news/' },
    { title: 'Tricky Query', url: 'https://example.com/?q=bbc.co.uk' },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));

  await toolbar(page).getByRole('button', { name: 'Parent ID' }).click();
  const parentOptions = page.getByRole('option');
  await expect(parentOptions.filter({ hasText: /E2E Facets \/ Same \(#\d+\)$/ })).toHaveCount(2);
  await expect(parentOptions.filter({ hasText: 'BBC News' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await toolbar(page).getByRole('button', { name: 'Domain' }).click();
  const bbc = page.getByRole('option', { name: /^bbc\.co\.uk/ });
  await expect(bbc).toContainText('2');
  await expect(page.getByRole('option', { name: /^nhk\.or\.jp/ })).toBeVisible();
  await expect(page.getByRole('option', { name: /^co\.uk/ })).toHaveCount(0);
  await expect(page.getByRole('option', { name: /^favicon/ })).toHaveCount(0);
  await bbc.click();
  await page.keyboard.press('Escape');
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await expect(row(page, 'Tricky Query')).toHaveCount(0);

  // The URL text filter narrows further without replacing the domain chip.
  await page.getByPlaceholder('Filter URLs...').fill('sport');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(row(page, 'BBC Sport')).toBeVisible();
  await expect(toolbar(page).getByRole('button', { name: 'Domain' })).toContainText('bbc.co.uk');
});

test('narrow windows keep view options and page jumps; collapsed sidebars leave tab order', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 800 });
  const seeded = await seedFolder(extensionWorker, 'E2E Narrow', [
    { title: 'Narrow Folder', children: [] },
    { title: 'Narrow Link', url: 'https://example.com/narrow' },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  await expect(page.getByRole('button', { name: 'Customize table view' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Go to first page' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Go to last page' })).toBeVisible();

  await expect(page.getByTestId('tools-sidebar')).toHaveAttribute('inert', '');
  await page.getByTitle('Hide folders').click();
  await expect(page.getByTestId('folder-sidebar')).toHaveAttribute('inert', '');
  await page.getByTitle('Show tools').click();
  await expect(page.getByTestId('tools-sidebar')).not.toHaveAttribute('inert', '');

  // Folder rows open from the keyboard, and the tree has no nested buttons.
  await expect(page.locator('button button')).toHaveCount(0);
  await row(page, 'Narrow Folder').focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`id=${seeded.ids['Narrow Folder']}$`));
});

test('selection supports bulk delete with undo and bulk move, keyed by bookmark', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await updateSettings(extensionWorker, { confirmBeforeDelete: false });
  const seeded = await seedFolder(extensionWorker, 'E2E Bulk', [
    { title: 'Bulk Target', children: [] },
    { title: 'Bulk A', url: 'https://example.com/a' },
    { title: 'Bulk B', url: 'https://example.com/b' },
    { title: 'Bulk C', url: 'https://example.com/c' },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  const childTitles = () =>
    extensionWorker.evaluate(
      async (id) => (await chrome.bookmarks.getChildren(id)).map((child) => child.title),
      seeded.folderId,
    );

  await page.getByRole('checkbox', { name: 'Select "Bulk B"' }).check();
  // A new item shifts row positions; the selection must stay on the same bookmark.
  await extensionWorker.evaluate(
    (parentId) => chrome.bookmarks.create({ parentId, index: 0, title: 'Bulk New', url: 'https://example.com/n' }),
    seeded.folderId,
  );
  await expect(row(page, 'Bulk New')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Select "Bulk B"' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Select "Bulk New"' })).not.toBeChecked();

  await page.getByRole('checkbox', { name: 'Select "Bulk C"' }).check();
  const bulk = page.getByTestId('bulk-actions');
  await expect(bulk).toContainText('2 selected');
  await bulk.getByRole('button', { name: 'Delete' }).click();
  await expect(
    page.getByText('Deleted 2 items. Undo within 10 seconds.', { exact: true }),
  ).toBeVisible();
  await expect.poll(childTitles).toEqual(['Bulk New', 'Bulk Target', 'Bulk A']);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(childTitles).toEqual(['Bulk New', 'Bulk Target', 'Bulk A', 'Bulk B', 'Bulk C']);

  await page.getByRole('checkbox', { name: 'Select "Bulk A"' }).check();
  await bulk.getByRole('button', { name: 'Move to folder' }).click();
  const dialog = page.getByRole('dialog', { name: 'Move 1 items' });
  await dialog.getByRole('combobox').click();
  await page.getByRole('option', { name: /E2E Bulk \/ Bulk Target$/ }).click();
  await dialog.getByRole('button', { name: 'Move to folder' }).click();
  await expect
    .poll(() =>
      extensionWorker.evaluate(
        async (id) => (await chrome.bookmarks.getChildren(id)).map((child) => child.title),
        seeded.ids['Bulk Target'],
      ),
    )
    .toEqual(['Bulk A']);
  await expect(row(page, 'Bulk A')).toHaveCount(0);
});

test('edits trim titles and reject script URLs; untitled items and trimmed filters', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Edit Rules', [
    { title: 'GitHub Home', url: 'https://github.com/' },
    { title: '', url: 'https://example.com/blank' },
    { title: 'Bookmarklet', url: 'javascript:void(0)' },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  await page.getByRole('checkbox', { name: 'Current folder only' }).check();

  await expect(row(page, 'Untitled')).toBeVisible();
  await openRowMenu(page, 'Bookmarklet');
  await expect(page.getByRole('menuitem', { name: 'Open in new tab' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await openRowMenu(page, 'GitHub Home');
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit bookmark' });
  await dialog.getByLabel('Name').fill('  GitHub Spaced  ');
  await dialog.getByLabel('URL').fill('javascript:alert(1)');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toContainText('JavaScript URLs (bookmarklets) cannot be saved here.');
  await dialog.getByLabel('URL').fill('https://github.com/');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(() =>
      extensionWorker.evaluate(async (id) => (await chrome.bookmarks.get(id))[0].title, seeded.ids['GitHub Home']),
    )
    .toBe('GitHub Spaced');

  await page.getByPlaceholder('Filter titles...').fill('  github  ');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(row(page, 'GitHub Spaced')).toBeVisible();
});

test('title and id headers show sort state and can be unsorted', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Header Sort', [
    { title: 'Sort B', url: 'https://example.com/b' },
    { title: 'Sort A', url: 'https://example.com/a' },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));

  await page.getByRole('button', { name: 'Title', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Desc' }).click();
  await expect(page.getByRole('button', { name: 'Title, sorted descending' })).toBeVisible();
  await page.getByRole('button', { name: 'Title, sorted descending' }).click();
  await page.getByRole('menuitem', { name: 'Clear sort' }).click();
  await expect(page.getByRole('button', { name: 'Title', exact: true })).toBeVisible();

  // Pinned actions cells stay opaque and follow the folder row tint.
  const stickyBackgrounds = await page
    .locator('tbody tr td:last-child')
    .evaluateAll((cells) => cells.map((cell) => getComputedStyle(cell).backgroundColor));
  expect(stickyBackgrounds.every((color) => !color.startsWith('rgba') || color.endsWith(', 1)'))).toBe(true);
});
