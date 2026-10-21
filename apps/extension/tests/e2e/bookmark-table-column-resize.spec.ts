import type { Locator, Page, Worker } from '@playwright/test';
import { expect, test } from './fixtures';
import { showTableColumns } from './manager-helpers';
import { readStored, STORAGE_ITEMS } from './storage';
import { seedFolder } from './tool-helpers';

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

/** Widths stay on this device, in the table layout; the sort syncs with the columns. */
async function savedColumnSizing(worker: Worker): Promise<Record<string, number>> {
  type Layout = { columnSizing?: Record<string, number> };
  const stored = await readStored<Layout>(worker, STORAGE_ITEMS.tableLayout);
  return stored?.columnSizing ?? {};
}

async function savedSorting(worker: Worker): Promise<unknown[]> {
  const stored = await readStored<{ sorting?: unknown[] }>(worker, STORAGE_ITEMS.tableView);
  return stored?.sorting ?? [];
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
  // URL shares the spare width with Title until it is sized, so it starts past its default.
  const urlStart = Number(await urlHandle.getAttribute('aria-valuenow'));
  expect(urlStart).toBeGreaterThan(200);
  expect(Number(await resizeHandle(page, 'Title').getAttribute('aria-valuenow'))).toBeGreaterThan(
    urlStart,
  );

  const urlBefore = await width(urlHeader);
  const titleBefore = await width(titleHeader);
  const tableBefore = await width(page.locator('table'));
  const orderBefore = await rowTitles(page);

  await dragHandle(page, urlHandle, 120);

  await expect.poll(() => width(urlHeader)).toBeCloseTo(urlBefore + 120, 0);
  await expect(urlHandle).toHaveAttribute('aria-valuenow', String(urlStart + 120));
  // Title gives up the room while it fills the table, so the table does not overflow.
  expect(await width(titleHeader)).toBeCloseTo(titleBefore - 120, 0);
  expect(await width(page.locator('table'))).toBeCloseTo(tableBefore, 0);

  // The press on the handle neither opens the sort menu nor sorts the rows.
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(urlHeader.getByRole('button', { name: 'URL', exact: true })).toBeVisible();
  expect(await rowTitles(page)).toEqual(orderBefore);

  await expect.poll(() => savedColumnSizing(extensionWorker)).toEqual({ url: urlStart + 120 });
  expect(await savedSorting(extensionWorker)).toEqual([]);

  await page.reload();
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await expect(resizeHandle(page, 'URL')).toHaveAttribute('aria-valuenow', String(urlStart + 120));
  await expect.poll(() => width(header(page, 'URL'))).toBeCloseTo(urlBefore + 120, 0);

  // Double-click goes back to sharing the spare width and forgets the saved one.
  await resizeHandle(page, 'URL').dblclick();
  await expect.poll(() => width(header(page, 'URL'))).toBeCloseTo(urlBefore, 0);
  await expect(resizeHandle(page, 'URL')).toHaveAttribute('aria-valuenow', String(urlStart));
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

  // Title, URL, and Date Added resize; the checkbox and row-menu columns stay fixed.
  await expect(page.getByRole('separator')).toHaveCount(3);
});

test('narrow tables still hide Folder Path and URL so Title stays visible', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await showTableColumns(extensionWorker, ['folderPath']);
  const seeded = await seedTable(extensionWorker, 'E2E Resize Narrow');
  await page.goto(managerUrl(extensionId, seeded.folderId));
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await expect(header(page, 'Folder Path')).toHaveCount(1);
  const urlStart = Number(await resizeHandle(page, 'URL').getAttribute('aria-valuenow'));
  await dragHandle(page, resizeHandle(page, 'URL'), 80);
  await expect.poll(() => savedColumnSizing(extensionWorker)).toEqual({ url: urlStart + 80 });

  await page.getByTitle('Show tools').click();
  await expect(page.getByTestId('tools-sidebar')).not.toHaveAttribute('inert', '');
  await expect(header(page, 'Folder Path')).toHaveCount(0);
  await expect(header(page, 'URL')).toHaveCount(0);
  // The sidebar opens with a transition, so measure until the table settles.
  const measure = () =>
    page.locator('table').evaluate((table) => {
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
  await expect
    .poll(async () => {
      const layout = await measure();
      return {
        titleFits: layout.title <= layout.frameRight,
        dateAddedFits: layout.dateAdded <= layout.frameRight,
        overflows: layout.overflows,
      };
    })
    .toEqual({ titleFits: true, dateAddedFits: true, overflows: false });

  // Closing the sidebar brings the columns back with the saved URL width.
  await page.getByTitle('Hide tools').click();
  await expect(header(page, 'URL')).toHaveCount(1);
  await expect(resizeHandle(page, 'URL')).toHaveAttribute('aria-valuenow', String(urlStart + 80));
  await expect.poll(() => width(header(page, 'URL'))).toBeCloseTo(urlStart + 80, 0);

  // Reset view forgets the widths too: Folder Path goes back to the View menu, and URL shares
  // the room it leaves with Title again (wider than it started next to Folder Path).
  await page.getByRole('button', { name: 'Customize table view' }).click();
  await page.getByRole('button', { name: 'Reset view' }).click();
  await page.keyboard.press('Escape');
  await expect(header(page, 'Folder Path')).toHaveCount(0);
  await expect.poll(() => savedColumnSizing(extensionWorker)).toEqual({});
  const urlReset = Number(await resizeHandle(page, 'URL').getAttribute('aria-valuenow'));
  expect(urlReset).toBeGreaterThan(urlStart);
  expect(urlReset).not.toBe(urlStart + 80);
});

test('the View menu reorders columns by dragging a column by its grip', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const { folderId } = await seedFolder(extensionWorker, 'E2E Column Order', [
    { title: 'Ordered Row', url: 'https://order.e2e.invalid/' },
  ]);
  await page.goto(managerUrl(extensionId, folderId));
  await page.getByRole('button', { name: 'Customize table view' }).click();
  const list = page.getByRole('list', { name: 'Customize columns' });
  await expect(list).toBeVisible();
  const order = () =>
    list
      .locator('li')
      .evaluateAll((items) => items.map((item) => item.getAttribute('data-sortable-id')));
  const before = await order();
  const [first, second] = before;
  const grip = list.locator(`li[data-sortable-id="${second}"] .sortable-grip`);
  const target = list.locator(`li[data-sortable-id="${first}"]`);
  const from = await grip.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('Column rows are not visible');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 4, from.y + from.height / 2 - 4, { steps: 3 });
  await page.mouse.move(to.x + to.width / 2, to.y + 3, { steps: 12 });
  await expect(target).toHaveAttribute('data-drop-edge', 'top');
  await page.mouse.up();
  await expect.poll(order).toEqual([second, first, ...before.slice(2)]);
  // The order is the table view's, which syncs.
  await expect
    .poll(async () => {
      const view = await readStored<{ columnOrder?: string[] }>(
        extensionWorker,
        STORAGE_ITEMS.tableView,
      );
      const columnOrder = view?.columnOrder ?? [];
      return columnOrder.indexOf(second ?? '') < columnOrder.indexOf(first ?? '');
    })
    .toBe(true);
});

test('a column moves by dragging its header, or from the header menu', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const { folderId } = await seedFolder(extensionWorker, 'E2E Header Order', [
    { title: 'Header Row', url: 'https://header.e2e.invalid/' },
  ]);
  await page.goto(managerUrl(extensionId, folderId));
  const grid = page.getByTestId('bookmark-grid');
  const headerOrder = () =>
    grid
      .locator('thead th.column-drag-head')
      .evaluateAll((cells) => cells.map((cell) => cell.getAttribute('data-column-id')));
  const before = await headerOrder();
  const [first, second] = before;
  const firstHead = grid.locator(`thead th[data-column-id="${first}"]`);
  const secondButton = grid.locator(
    `thead th[data-column-id="${second}"] [data-column-drag-handle]`,
  );

  // Measure once the table is drawn and the headers can be dragged: a press before then starts
  // no drag, and the column widths settle after the first rows.
  await expect(grid.getByText('Header Row')).toBeVisible();
  await expect(grid.locator(`thead th[data-column-id="${second}"]`)).toHaveAttribute(
    'draggable',
    'true',
  );
  // Drag the second header onto the left edge of the first.
  const from = await secondButton.boundingBox();
  const to = await firstHead.boundingBox();
  if (!from || !to) throw new Error('Headers are not visible');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 - 4, from.y + from.height / 2 + 2, { steps: 3 });
  await page.mouse.move(to.x + 6, to.y + to.height / 2, { steps: 12 });
  await expect(grid.locator(`thead th[data-column-id="${second}"]`)).toHaveAttribute(
    'data-dragging',
  );
  await page.mouse.up();
  await expect.poll(headerOrder).toEqual([second, first, ...before.slice(2)]);
  await expect(page.locator('body > div[role="status"]')).toHaveText(/moved to position 1 of/);
  // The order is the table view's, which syncs.
  await expect
    .poll(async () => {
      const view = await readStored<{ columnOrder?: string[] }>(
        extensionWorker,
        STORAGE_ITEMS.tableView,
      );
      const columnOrder = view?.columnOrder ?? [];
      return columnOrder.indexOf(second ?? '') < columnOrder.indexOf(first ?? '');
    })
    .toBe(true);

  // A click still opens the header's menu, which moves the column back.
  await secondButton.click();
  await page.getByRole('menuitem', { name: /right$/ }).click();
  await expect.poll(headerOrder).toEqual(before);
});
