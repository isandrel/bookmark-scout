/**
 * What a new user sees in the bookmark manager before changing anything: it opens on the
 * bookmarks bar, shows Title, URL, and Date Added in the browser's order, 50 rows a page, one
 * search box with syntax help, every other filter in the Filters menu, and a
 * plain item count. Every other column and filter stays one click away.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  addressFilter,
  breadcrumbCurrent,
  filterChips,
  managerSearch,
  managerUrl,
  managerRow as row,
} from './manager-helpers';
import { bookmarksBar, otherBookmarksTitle, seedFolder, setSettings } from './popup-helpers';

test.use({ viewport: { width: 1400, height: 900 } });

function headers(page: Page) {
  return page
    .locator('thead th')
    .evaluateAll((cells) =>
      cells.map((cell) => cell.textContent?.trim() ?? '').filter((text) => text !== ''),
    );
}

function itemCount(page: Page) {
  return page.getByTestId('table-item-count');
}

test('opens on the bookmarks bar; Bookmarks in the path shows the top level and reloads there', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Bar Folder', [
    { title: 'Inside Bar Folder', url: 'https://e2e.invalid/inside' },
  ]);
  const bar = await bookmarksBar(extensionWorker);
  const other = await otherBookmarksTitle(extensionWorker);

  await page.goto(managerUrl(extensionId));
  await expect(breadcrumbCurrent(page)).toHaveText(bar.title);
  await expect(page).toHaveURL(managerUrl(extensionId, bar.id));
  await expect(row(page, 'E2E Bar Folder')).toBeVisible();
  await expect(row(page, other)).toHaveCount(0);

  // The top level is still one click away, and stays the top level on reload.
  await page
    .getByTestId('breadcrumb')
    .getByRole('button', { name: 'Bookmarks', exact: true })
    .click();
  await expect(row(page, other)).toBeVisible();
  await expect(row(page, bar.title)).toBeVisible();
  await expect(page).toHaveURL(managerUrl(extensionId));
  await page.reload();
  await expect(row(page, other)).toBeVisible();
  await expect(page).toHaveURL(managerUrl(extensionId));

  // Back returns to the bookmarks bar; a deep link still opens its own folder.
  await page.goBack();
  await expect(breadcrumbCurrent(page)).toHaveText(bar.title);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  await expect(breadcrumbCurrent(page)).toHaveText('E2E Bar Folder');
  await expect(row(page, 'Inside Bar Folder')).toBeVisible();
});

test('shows Title, URL, and Date Added; the other columns stay in the View menu', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Default Columns', [
    { title: 'Column Link', url: 'https://e2e.invalid/columns' },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  await expect(row(page, 'Column Link')).toBeVisible();
  await expect.poll(() => headers(page)).toEqual(['Title', 'URL', 'Date Added']);

  await page.getByRole('button', { name: 'Customize table view' }).click();
  for (const name of ['Type', 'Folder Path', 'Parent ID']) {
    await expect(page.getByRole('menuitemcheckbox', { name })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  }
  await page.getByRole('menuitemcheckbox', { name: 'Folder Path' }).click();
  await page.keyboard.press('Escape');
  await expect.poll(() => headers(page)).toEqual(['Title', 'URL', 'Date Added', 'Folder Path']);
});

test('pages 50 rows, keeps the browser order, and counts items in plain words', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  // Created in reverse name order, so neither date nor name order matches the browser's.
  const titles = Array.from(
    { length: 51 },
    (_, index) => `Item ${String(51 - index).padStart(2, '0')}`,
  );
  const seeded = await seedFolder(
    extensionWorker,
    'E2E Page Size',
    titles.map((title) => ({ title, url: `https://e2e.invalid/${title.replace(' ', '-')}` })),
  );
  await page.goto(managerUrl(extensionId, seeded.folderId));

  await expect(page.locator('tbody tr')).toHaveCount(50);
  await expect(page.locator('tbody tr').first()).toContainText('Item 51');
  await expect(page.getByText('Page 1 of 2', { exact: true })).toBeVisible();
  await expect(itemCount(page)).toHaveText('51 items');

  // The order control says the table is in the browser's order, with nothing to switch back to.
  const browserOrder = page.getByRole('button', { name: 'Browser order' });
  await expect(browserOrder).toHaveAttribute('aria-pressed', 'true');
  await expect(browserOrder).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByTestId('table-order-status')).toHaveCount(0);

  // A column sort is named in plain words, and Browser order goes back.
  await page.getByRole('button', { name: 'Title', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Asc' }).click();
  await expect(page.getByTestId('table-order-status')).toHaveText('Order: Title, sorted ascending');
  await expect(page.locator('tbody tr').first()).toContainText('Item 01');
  await expect(browserOrder).toHaveAttribute('aria-pressed', 'false');
  await browserOrder.click();
  await expect(page.locator('tbody tr').first()).toContainText('Item 51');
  await expect(page.getByTestId('table-order-status')).toHaveCount(0);

  await row(page, 'Item 51').click({ position: { x: 200, y: 10 } });
  await expect(itemCount(page)).toHaveText('1 of 51 selected');
  await page.keyboard.press('Escape');
  await expect(itemCount(page)).toHaveText('51 items');

  await managerSearch(page).fill('Item 51');
  await expect(itemCount(page)).toHaveText('1 item');
});

test('names another Sort Order beside the Browser order button', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { sortOrder: 'date' });
  const seeded = await seedFolder(extensionWorker, 'E2E Date Order', [
    { title: 'Date Link', url: 'https://e2e.invalid/date' },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  await expect(page.getByTestId('table-order-status')).toHaveText('Order: Date Added');
  const browserOrder = page.getByRole('button', { name: 'Browser order' });
  await expect(browserOrder).toHaveAttribute('aria-pressed', 'false');
  await browserOrder.click();
  await expect(browserOrder).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('table-order-status')).toHaveCount(0);
  await browserOrder.click();
  await expect(page.getByTestId('table-order-status')).toHaveText('Order: Date Added');
});

test('one search box with syntax help; every other filter waits in the Filters menu, shown as chips', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E One Search', [
    { title: 'Lasagne', url: 'https://recipes.e2e.invalid/pasta' },
    { title: 'Pasta notes', url: 'https://notes.e2e.invalid/1' },
    { title: 'Timetable', url: 'https://school.e2e.invalid/' },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  const toolbar = page.getByTestId('bookmark-table-toolbar');
  await expect(toolbar.getByPlaceholder('Filter URLs...')).toHaveCount(0);
  await expect(toolbar.getByRole('button', { name: 'Folder', exact: true })).toHaveCount(0);
  await expect(toolbar.getByRole('button', { name: 'Parent ID' })).toHaveCount(0);

  // "pasta" is in one title and in the other's address.
  await managerSearch(page).fill('pasta');
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await expect(row(page, 'Lasagne')).toBeVisible();
  await expect(row(page, 'Pasta notes')).toBeVisible();
  await expect(page).toHaveURL(/[?&]q=pasta/);
  await managerSearch(page).fill('');

  // The syntax help adds an operator to the query and gives the search box focus back.
  await page.getByTestId('search-syntax-help').click();
  await page.getByRole('button', { name: /^With a tag/ }).click();
  await expect(managerSearch(page)).toHaveValue('tag:');
  await expect(managerSearch(page)).toBeFocused();
  // A problem in the query is said under the toolbar; the rest of the query still runs.
  await managerSearch(page).fill('pasta after:2026-02-30');
  await expect(
    page.getByRole('status').filter({ hasText: '2026-02-30 is not a date' }),
  ).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await managerSearch(page).fill('');

  await (await addressFilter(page)).fill('school');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(row(page, 'Timetable')).toBeVisible();
  await page.keyboard.press('Escape');
  // A filter in use is never hidden: its chip stays under the toolbar while the menu is closed.
  await expect(filterChips(page)).toHaveText(['URL: school']);

  await toolbar.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(filterChips(page)).toHaveCount(0);
  await expect(page.locator('tbody tr')).toHaveCount(3);
});

test('the Dates and Times settings change how the manager shows dates', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Date Format', [
    { title: 'Dated', url: 'https://e2e.invalid/dated' },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  const cell = page.locator('tbody tr').first().locator('td').filter({ hasText: /\d{4}/ });
  // By default the language decides: English shows month/day/year with AM or PM.
  await expect(cell).toHaveText(/^\d{1,2}\/\d{1,2}\/\d{4}, \d{1,2}:\d{2}:\d{2} [AP]M$/);

  await setSettings(extensionWorker, { dateFormat: 'iso', timeFormat: 'hours24' });
  // The open page follows at once, like after a language change.
  await expect(cell).toHaveText(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

  // Options names each format with a sample.
  await page.goto(`chrome-extension://${extensionId}/options.html?category=appearance`);
  await expect(page.getByText('Year-month-day (2026-03-14)')).toHaveCount(1);
});
