/**
 * A search left open in the popup and the manager while bookmarks change elsewhere: a folder moved
 * or a title edited from the browser's API (U24), tags edited on another extension page (U25), and
 * a delete taken back with Undo, which recreates the bookmark under a new id (U26). Also: a search
 * sends no request to the network, and rows found across every folder cannot be reordered.
 */
import type { BrowserContext, Page } from '@playwright/test';
import { expect, test, toastRegion } from './fixtures';
import { dragOnto, managerRow, managerSearch, managerUrl } from './manager-helpers';
import { bookmarkRow, childTitles, openPopup, seedFolder } from './popup-helpers';
import { readStored, STORAGE_ITEMS, setSettings, writeStored } from './storage';

test.use({ viewport: { width: 1400, height: 900 } });

function popupSearch(page: Page) {
  return page.getByRole('combobox', { name: 'Search bookmarks, or type a folder name' });
}

/** The popup in a second tab of the same browser, searching `query`. */
async function popupSearching(context: BrowserContext, extensionId: string, query: string) {
  const popup = await context.newPage();
  await openPopup(popup, extensionId);
  await popupSearch(popup).fill(query);
  return popup;
}

/** The ids of the bookmarks the popup's tree shows, in order. */
async function popupBookmarkIds(popup: Page): Promise<string[]> {
  return popup
    .locator('[data-popup-tree-row="bookmark"]')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-tree-row-id') ?? ''));
}

/** The ids of the rows the manager's table shows. */
async function managerRowIds(page: Page): Promise<string[]> {
  return page
    .locator('tbody tr[data-row-id]')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-row-id') ?? ''));
}

async function openDetails(page: Page, title: string) {
  await managerRow(page, title).getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('menuitem', { name: 'View Details' }).click();
  const dialog = page.getByRole('dialog', { name: 'Bookmark Details' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('a folder moved or a title edited outside the extension updates open searches (U24)', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  const source = await seedFolder(extensionWorker, 'E2E Live Src', [
    { title: 'Live Inner', children: [{ title: 'Live Moved', url: 'https://e2e.invalid/moved' }] },
    { title: 'Live Stays', url: 'https://e2e.invalid/stays' },
  ]);
  const target = await seedFolder(extensionWorker, 'E2E Live Dst', []);
  const query = 'folder:"E2E Live Src"';

  await page.goto(managerUrl(extensionId));
  await managerSearch(page).fill(query);
  await expect(managerRow(page, 'Live Moved')).toHaveCount(1);
  await expect(managerRow(page, 'Live Stays')).toHaveCount(1);
  const popup = await popupSearching(context, extensionId, query);
  await expect(bookmarkRow(popup, 'Live Moved')).toBeVisible();
  await expect(bookmarkRow(popup, 'Live Stays')).toBeVisible();

  // Chrome's own manager (or sync) moves the subfolder out: its bookmark leaves both searches.
  await extensionWorker.evaluate(({ id, parentId }) => chrome.bookmarks.move(id, { parentId }), {
    id: source.ids['Live Inner'] as string,
    parentId: target.folderId,
  });
  await expect(managerRow(page, 'Live Moved')).toHaveCount(0);
  await expect(managerRow(page, 'Live Inner')).toHaveCount(0);
  await expect(managerRow(page, 'Live Stays')).toHaveCount(1);
  await expect.poll(() => popupBookmarkIds(popup)).toEqual([source.ids['Live Stays']]);

  // A search for the destination finds it there now.
  await managerSearch(page).fill('folder:"E2E Live Dst"');
  await expect(managerRow(page, 'Live Moved')).toHaveCount(1);

  // A title edited outside joins a plain-word search, and leaves it when edited back.
  await managerSearch(page).fill('zebra');
  await popupSearch(popup).fill('zebra');
  await expect(page.locator('tbody tr[data-row-id]')).toHaveCount(0);
  const staysId = source.ids['Live Stays'] as string;
  await extensionWorker.evaluate(
    (id) => chrome.bookmarks.update(id, { title: 'Live Zebra' }),
    staysId,
  );
  await expect.poll(() => managerRowIds(page)).toEqual([staysId]);
  await expect.poll(() => popupBookmarkIds(popup)).toEqual([staysId]);
  await expect(bookmarkRow(popup, 'Live Zebra')).toBeVisible();
  await extensionWorker.evaluate(
    (id) => chrome.bookmarks.update(id, { title: 'Live Stays' }),
    staysId,
  );
  await expect.poll(() => managerRowIds(page)).toEqual([]);
  await expect.poll(() => popupBookmarkIds(popup)).toEqual([]);
});

test('tags edited on another page update open searches in the manager and popup (U25)', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Live Tags', [
    { title: 'Tagged Later', url: 'https://e2e.invalid/tagged' },
    { title: 'Never Tagged', url: 'https://e2e.invalid/never' },
  ]);
  const taggedId = seeded.ids['Tagged Later'] as string;

  await page.goto(managerUrl(extensionId));
  await managerSearch(page).fill('tag:urgent');
  const popup = await popupSearching(context, extensionId, 'tag:urgent');
  await expect(popup.getByText('No bookmarks found')).toBeVisible();
  await expect(page.locator('tbody tr[data-row-id]')).toHaveCount(0);

  // A second manager tab edits the tags in Bookmark Details.
  const editor = await context.newPage();
  await editor.goto(managerUrl(extensionId, seeded.folderId));
  let dialog = await openDetails(editor, 'Tagged Later');
  await dialog.getByTestId('bookmark-metadata-tags').fill('Urgent, work');
  await dialog.getByRole('button', { name: 'Save Metadata' }).click();
  await expect(dialog.getByText('Metadata saved.')).toBeVisible();

  await expect.poll(() => managerRowIds(page)).toEqual([taggedId]);
  await expect.poll(() => popupBookmarkIds(popup)).toEqual([taggedId]);
  await expect(
    bookmarkRow(popup, 'Tagged Later').locator('[data-slot="search-reason"]'),
  ).toHaveText('tag: Urgent');

  // Taking the tag off drops it from both searches again.
  await editor.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  dialog = await openDetails(editor, 'Tagged Later');
  await dialog.getByRole('button', { name: 'Remove Urgent' }).click();
  await dialog.getByRole('button', { name: 'Save Metadata' }).click();
  await expect(dialog.getByText('Metadata saved.')).toBeVisible();
  await expect.poll(() => managerRowIds(page)).toEqual([]);
  await expect.poll(() => popupBookmarkIds(popup)).toEqual([]);
});

test('a bookmark deleted and restored with Undo during a search comes back once, under its new id (U26)', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { confirmBeforeDelete: false });
  const seeded = await seedFolder(extensionWorker, 'E2E Live Undo', [
    { title: 'Zombie One', url: 'https://e2e.invalid/zombie-1' },
    { title: 'Zombie Two', url: 'https://e2e.invalid/zombie-2' },
    { title: 'Bystander', url: 'https://e2e.invalid/bystander' },
  ]);
  const oldId = seeded.ids['Zombie One'] as string;
  const twoId = seeded.ids['Zombie Two'] as string;
  await writeStored(extensionWorker, STORAGE_ITEMS.bookmarkMetadata, {
    [oldId]: { tags: ['zombie'] },
    [twoId]: { tags: ['zombie'] },
  });

  await page.goto(managerUrl(extensionId));
  await managerSearch(page).fill('tag:zombie');
  await expect.poll(async () => (await managerRowIds(page)).sort()).toEqual([oldId, twoId].sort());
  const popup = await popupSearching(context, extensionId, 'tag:zombie');
  await expect.poll(() => popupBookmarkIds(popup)).toEqual([oldId, twoId]);

  await managerRow(page, 'Zombie One').click({ position: { x: 200, y: 10 } });
  await page.keyboard.press('Delete');
  const toasts = toastRegion(page);
  await expect(
    toasts.getByText('Deleted "Zombie One". Undo within 10 seconds.', { exact: true }),
  ).toBeVisible();
  await expect.poll(() => managerRowIds(page)).toEqual([twoId]);
  await expect.poll(() => popupBookmarkIds(popup)).toEqual([twoId]);

  await toasts.getByRole('button', { name: 'Undo', exact: true }).click();
  // The browser gives the restored bookmark a new id; its tags follow it.
  const restoredId = () =>
    extensionWorker.evaluate(
      async (id) =>
        (await chrome.bookmarks.getChildren(id)).find((child) => child.title === 'Zombie One')
          ?.id ?? '',
      seeded.folderId,
    );
  await expect.poll(restoredId).not.toBe('');
  const newId = await restoredId();
  expect(newId).not.toBe(oldId);
  await expect
    .poll(async () => {
      const metadata = await readStored<Record<string, { tags?: string[] }>>(
        extensionWorker,
        STORAGE_ITEMS.bookmarkMetadata,
      );
      return { restored: metadata?.[newId]?.tags, old: metadata?.[oldId] };
    })
    .toEqual({ restored: ['zombie'], old: undefined });

  // Found again once, under the new id; nothing is left of the old one.
  await expect.poll(async () => (await managerRowIds(page)).sort()).toEqual([newId, twoId].sort());
  await expect(page.locator(`tbody tr[data-row-id="${oldId}"]`)).toHaveCount(0);
  await expect.poll(() => popupBookmarkIds(popup)).toEqual([newId, twoId]);
  expect(await childTitles(extensionWorker, seeded.folderId)).toEqual([
    'Zombie One',
    'Zombie Two',
    'Bystander',
  ]);
});

test('searching in the popup and the manager sends no network request', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Offline Search', [
    { title: 'Offline Guide', url: 'https://docs.e2e.invalid/guide' },
    { title: 'Offline Notes', url: 'https://notes.e2e.invalid/notes' },
  ]);
  await writeStored(extensionWorker, STORAGE_ITEMS.bookmarkMetadata, {
    [seeded.ids['Offline Notes'] as string]: { tags: ['reading'], summary: 'Weekly notes' },
  });
  // Pages open first, so only what the searches do is counted.
  await page.goto(managerUrl(extensionId));
  const popup = await context.newPage();
  await openPopup(popup, extensionId);

  const requests: string[] = [];
  context.on('request', (request) => {
    if (/^https?:/i.test(request.url())) requests.push(request.url());
  });
  await context.route(/^https?:\/\//i, (route) => {
    requests.push(route.request().url());
    return route.abort();
  });

  const ids = (titles: string[]) => titles.map((title) => seeded.ids[title]);
  const queries: { query: string; titles: string[] }[] = [
    { query: 'offline', titles: ['Offline Guide', 'Offline Notes'] },
    { query: 'tag:reading', titles: ['Offline Notes'] },
    { query: 'domain:docs.e2e.invalid', titles: ['Offline Guide'] },
    { query: 'weekly', titles: ['Offline Notes'] },
    {
      query: 'folder:"E2E Offline Search" (guide OR notes)',
      titles: ['Offline Guide', 'Offline Notes'],
    },
  ];
  for (const { query, titles } of queries) {
    await popupSearch(popup).fill(query);
    await expect.poll(() => popupBookmarkIds(popup), { message: query }).toEqual(ids(titles));
    await managerSearch(page).fill(query);
    for (const title of titles) await expect(managerRow(page, title)).toHaveCount(1);
  }
  expect(requests).toEqual([]);
});

test('rows found across every folder cannot be reordered, only dropped into a folder', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Search Drag', [
    { title: 'Reorder Box', children: [] },
    { title: 'Reorder One', url: 'https://e2e.invalid/1' },
    { title: 'Reorder Two', url: 'https://e2e.invalid/2' },
    { title: 'Reorder Three', url: 'https://e2e.invalid/3' },
  ]);
  const order = ['Reorder Box', 'Reorder One', 'Reorder Two', 'Reorder Three'];
  await page.goto(managerUrl(extensionId, seeded.folderId));
  await expect(page.getByRole('button', { name: 'Browser order' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await managerSearch(page).fill('reorder');
  await expect(managerRow(page, 'Reorder Three')).toHaveCount(1);

  // The top edge of a row reorders in a folder; in search results it does nothing.
  await dragOnto(managerRow(page, 'Reorder Three'), managerRow(page, 'Reorder One'), 0.1);
  await page.waitForTimeout(300);
  expect(await childTitles(extensionWorker, seeded.folderId)).toEqual(order);
  await dragOnto(managerRow(page, 'Reorder One'), managerRow(page, 'Reorder Three'), 0.9);
  await page.waitForTimeout(300);
  expect(await childTitles(extensionWorker, seeded.folderId)).toEqual(order);

  // The same gesture still moves a row into a folder row, so the drags above were real.
  await dragOnto(managerRow(page, 'Reorder Two'), managerRow(page, 'Reorder Box'), 0.5);
  await expect
    .poll(() => childTitles(extensionWorker, seeded.ids['Reorder Box'] as string))
    .toEqual(['Reorder Two']);
  expect(await childTitles(extensionWorker, seeded.folderId)).toEqual([
    'Reorder Box',
    'Reorder One',
    'Reorder Three',
  ]);
});
