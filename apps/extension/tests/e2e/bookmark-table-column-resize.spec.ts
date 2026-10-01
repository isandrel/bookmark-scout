import type { Locator, Page, Worker } from '@playwright/test';
import { expect, test } from './fixtures';
import { seedFolder } from './tool-helpers';

const TABLE_VIEW_KEY = 'bookmark-scout-table-view';
const LONG_TITLE = 'Resizable Title That Is Long Enough To Need An Ellipsis When Narrow';

test.use({ viewport: { width: 1400, height: 900 } });

function managerUrl(extensionId: string, folderId: string) {
  return `chrome-extension://${extensionId}/bookmarks.html?id=${folderId}`;
}

function header(page: Page, name: string): Locator {
  return page.locator('thead th').filter({ hasText: name });
}

function resizeHandle(page: Page, column: string): Locator {
  return page.getByRole('separator', { name: `Resize ${column} column` });
}

async function width(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Element is not visible');
  return box.width;
}

async function savedColumnSizing(worker: Worker): Promise<Record<string, number>> {
  return worker.evaluate(async (key) => {
    const stored = await chrome.storage.sync.get(key);
    return stored[key]?.columnSizing ?? {};
  }, TABLE_VIEW_KEY);
}

async function savedSorting(worker: Worker): Promise<unknown[]> {
  return worker.evaluate(async (key) => {
    const stored = await chrome.storage.sync.get(key);
    return stored[key]?.sorting ?? [];
  }, TABLE_VIEW_KEY);
}

async function rowTitles(page: Page): Promise<string[]> {
  return page
    .locator('tbody tr')
    .evaluateAll((rows) =>
      rows.map((row) => row.querySelectorAll('td')[4]?.textContent?.trim() ?? ''),
    );
}

async function dragHandle(page: Page, handle: Locator, deltaX: number) {
  const box = await handle.boundingBox();
  if (!box) throw new Error('Resize handle is not visible');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + deltaX / 2, y, { steps: 5 });
  await page.mouse.move(x + deltaX, y, { steps: 5 });
  await page.mouse.up();
}

async function seedTable(worker: Worker, name: string) {
  return seedFolder(worker, name, [
    { title: 'Bravo Link', url: 'https://example.com/bravo' },
    { title: LONG_TITLE, url: 'https://example.com/a/rather/long/path/for/the/url/column' },
    { title: 'Alpha Folder', children: [] },
  ]);
}

test('dragging a header handle resizes the column without sorting, and the width persists', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedTable(extensionWorker, 'E2E Resize Drag');
  await page.goto(managerUrl(extensionId, seeded.folderId));
  await expect(page.locator('tbody tr')).toHaveCount(3);
  const urlHeader = header(page, 'URL');
  const titleHeader = header(page, 'Title');
  const urlHandle = resizeHandle(page, 'URL');
  await expect(urlHandle).toBeVisible();
  await expect(urlHandle).toHaveAttribute('aria-valuenow', '200');

  const urlBefore = await width(urlHeader);
  const titleBefore = await width(titleHeader);
  const tableBefore = await width(page.locator('table'));
  const orderBefore = await rowTitles(page);

  await dragHandle(page, urlHandle, 120);

  await expect.poll(() => width(urlHeader)).toBeCloseTo(urlBefore + 120, 0);
  await expect(urlHandle).toHaveAttribute('aria-valuenow', '320');
  // Title gives up the room while it fills the table, so the table does not overflow.
  expect(await width(titleHeader)).toBeCloseTo(titleBefore - 120, 0);
  expect(await width(page.locator('table'))).toBeCloseTo(tableBefore, 0);

  // The press on the handle neither opens the sort menu nor sorts the rows.
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(urlHeader.getByRole('button', { name: 'URL', exact: true })).toBeVisible();
  expect(await rowTitles(page)).toEqual(orderBefore);

  await expect.poll(() => savedColumnSizing(extensionWorker)).toEqual({ url: 320 });
  expect(await savedSorting(extensionWorker)).toEqual([]);

  await page.reload();
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await expect(resizeHandle(page, 'URL')).toHaveAttribute('aria-valuenow', '320');
  await expect.poll(() => width(header(page, 'URL'))).toBeCloseTo(urlBefore + 120, 0);

  // Double-click restores the default width and forgets the saved one.
  await resizeHandle(page, 'URL').dblclick();
  await expect.poll(() => width(header(page, 'URL'))).toBeCloseTo(urlBefore, 0);
  await expect(resizeHandle(page, 'URL')).toHaveAttribute('aria-valuenow', '200');
  await expect.poll(() => savedColumnSizing(extensionWorker)).toEqual({});
  expect(await rowTitles(page)).toEqual(orderBefore);
});

test('resize handles work from the keyboard and long text truncates within the column', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedTable(extensionWorker, 'E2E Resize Keyboard');
  await page.goto(managerUrl(extensionId, seeded.folderId));
  await expect(page.locator('tbody tr')).toHaveCount(3);

  const titleHandle = resizeHandle(page, 'Title');
  const titleHeader = header(page, 'Title');
  const titleStart = Number(await titleHandle.getAttribute('aria-valuenow'));
  expect(titleStart).toBeGreaterThan(200);

  await titleHandle.focus();
  await expect(titleHandle).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(titleHandle).toHaveAttribute('aria-valuenow', String(titleStart + 20));
  await expect.poll(() => width(titleHeader)).toBeCloseTo(titleStart + 20, 0);
  await page.keyboard.press('ArrowLeft');
  await expect(titleHandle).toHaveAttribute('aria-valuenow', String(titleStart + 10));
  await expect.poll(() => savedColumnSizing(extensionWorker)).toEqual({ title: titleStart + 10 });

  // Narrowing Title to its minimum truncates the long title with an ellipsis inside the cell.
  await dragHandle(page, titleHandle, -600);
  await expect(titleHandle).toHaveAttribute('aria-valuenow', '120');
  await expect.poll(() => width(titleHeader)).toBeCloseTo(120, 0);
  const titleText = page.locator('tbody td span', { hasText: LONG_TITLE });
  const layout = await titleText.evaluate((span) => {
    const cell = span.closest('td') as HTMLElement;
    return {
      overflow: getComputedStyle(span).textOverflow,
      clipped: span.scrollWidth > span.clientWidth,
      spanRight: span.getBoundingClientRect().right,
      cellRight: cell.getBoundingClientRect().right,
    };
  });
  expect(layout).toMatchObject({ overflow: 'ellipsis', clipped: true });
  expect(layout.spanRight).toBeLessThanOrEqual(layout.cellRight);
  await expect.poll(() => savedColumnSizing(extensionWorker)).toEqual({ title: 120 });
  await expect(page.getByRole('menu')).toHaveCount(0);
  expect(await savedSorting(extensionWorker)).toEqual([]);

  // The checkbox and row-menu columns stay fixed.
  await expect(page.getByRole('separator')).toHaveCount(5);
});

test('narrow tables still hide Folder Path and URL so Title stays visible', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedTable(extensionWorker, 'E2E Resize Narrow');
  await page.goto(managerUrl(extensionId, seeded.folderId));
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await dragHandle(page, resizeHandle(page, 'URL'), 80);
  await expect.poll(() => savedColumnSizing(extensionWorker)).toEqual({ url: 280 });

  await page.getByTitle('Show tools').click();
  await expect(page.getByTestId('tools-sidebar')).not.toHaveAttribute('inert', '');
  await expect(header(page, 'Folder Path')).toHaveCount(0);
  await expect(header(page, 'URL')).toHaveCount(0);
  const layout = await page.locator('table').evaluate((table) => {
    const frame = (table.parentElement as HTMLElement).getBoundingClientRect();
    const right = (name: string) =>
      [...table.querySelectorAll('thead th')]
        .find((th) => th.textContent?.includes(name))
        ?.getBoundingClientRect().right ?? Number.POSITIVE_INFINITY;
    return {
      frameRight: frame.right,
      title: right('Title'),
      dateAdded: right('Date Added'),
      overflows: table.scrollWidth > (table.parentElement as HTMLElement).clientWidth,
    };
  });
  expect(layout.title).toBeLessThanOrEqual(layout.frameRight);
  expect(layout.dateAdded).toBeLessThanOrEqual(layout.frameRight);
  expect(layout.overflows).toBe(false);

  // Closing the sidebar brings the columns back with the saved URL width.
  await page.getByTitle('Hide tools').click();
  await expect(header(page, 'URL')).toHaveCount(1);
  await expect(resizeHandle(page, 'URL')).toHaveAttribute('aria-valuenow', '280');
  await expect.poll(() => width(header(page, 'URL'))).toBeCloseTo(280, 0);

  // Reset view forgets the widths too.
  await page.getByRole('button', { name: 'Customize table view' }).click();
  await page.getByRole('button', { name: 'Reset view' }).click();
  await page.keyboard.press('Escape');
  await expect(resizeHandle(page, 'URL')).toHaveAttribute('aria-valuenow', '200');
  await expect.poll(() => savedColumnSizing(extensionWorker)).toEqual({});
});
