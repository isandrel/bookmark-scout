import type { Locator, Page, Worker } from '@playwright/test';
import { expect, test, toastRegion } from './fixtures';
import {
  bookmarkRow,
  childTitles,
  folderRow,
  openPopup,
  otherBookmarksTitle,
  seedFolder,
  setSettings,
} from './popup-helpers';

const RECENT_KEY = 'bookmark-scout-recent-folders';

async function childCount(worker: Worker, folderId: string) {
  return (await childTitles(worker, folderId)).length;
}

async function dropOnEdge(source: Locator, target: Locator, edge: 'top' | 'bottom') {
  const box = await target.boundingBox();
  if (!box) throw new Error('Drop target is not visible');
  await source.dragTo(target, {
    targetPosition: { x: box.width / 2, y: edge === 'top' ? 3 : box.height - 3 },
  });
}

/** The disclosure chevron inside a folder row's trigger (not the Expand all button's icon). */
function treeChevron(row: Locator) {
  return row.locator('[data-folder-trigger] svg[class*="lucide-chevron"]');
}

/** One snapshot of a folder row's layout, so all edges come from the same frame. */
async function folderGeometry(page: Page, title: string) {
  return folderRow(page, title).evaluate((row, rowTitle) => {
    const trigger = row.querySelector('[data-folder-trigger]');
    const chevron = trigger?.querySelector('svg[class*="lucide-chevron"]');
    const icon = row.querySelector('svg.text-amber-500');
    const label = icon?.parentElement?.querySelector('span.truncate');
    const actions = row.querySelector('[data-slot="folder-actions"]') ?? row.lastElementChild;
    const rect = (element: Element | null | undefined) => {
      if (!element) throw new Error(`Missing part of folder row "${rowTitle}"`);
      return element.getBoundingClientRect();
    };
    const content = icon?.parentElement?.lastElementChild;
    return {
      title: rowTitle,
      rowRight: rect(row).right,
      triggerRight: rect(trigger).right,
      chevronLeft: rect(chevron).left,
      chevronRight: rect(chevron).right,
      iconLeft: rect(icon).left,
      titleLeft: rect(label).left,
      contentRight: rect(content).right,
      titleTruncated: label ? label.scrollWidth > label.clientWidth : false,
      actionsLeft: rect(actions).left,
      actionsRight: rect(actions).right,
      actionsOpacity: actions ? getComputedStyle(actions).opacity : '',
    };
  }, title);
}

test.describe('saving the current page', () => {
  test('a double click or two clicks in one tick on "Add current page" save once', async ({
    extensionId,
    extensionWorker,
    page,
  }) => {
    const doubled = await seedFolder(extensionWorker, 'E2E Double Add', []);
    const sameTick = await seedFolder(extensionWorker, 'E2E Same Tick Add', []);

    await openPopup(page, extensionId);
    await folderRow(page, doubled.barTitle).click();

    const row = folderRow(page, 'E2E Double Add');
    await row.hover();
    const addButton = row.getByRole('button', { name: 'Add current page' });
    await addButton.dblclick();
    await expect.poll(() => childCount(extensionWorker, doubled.folderId)).toBe(1);
    await expect(addButton).not.toHaveAttribute('aria-disabled');
    // The repeated click is ignored silently, not reported as "Already saved".
    await expect(toastRegion(page).getByText(/Bookmark Added$/)).toHaveCount(1);
    await expect(toastRegion(page).getByText('Already saved', { exact: false })).toHaveCount(0);

    const sameTickRow = folderRow(page, 'E2E Same Tick Add');
    await sameTickRow.hover();
    await sameTickRow.getByRole('button', { name: 'Add current page' }).evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
    await expect.poll(() => childCount(extensionWorker, sameTick.folderId)).toBe(1);
    await expect(sameTickRow.getByRole('button', { name: 'Add current page' })).not.toHaveAttribute(
      'aria-disabled',
    );
    expect(await childCount(extensionWorker, sameTick.folderId)).toBe(1);
  });

  test('a double click or two clicks in one tick on a Recent Folders chip save once', async ({
    extensionId,
    extensionWorker,
    page,
  }) => {
    const doubled = await seedFolder(extensionWorker, 'E2E Recent Double', []);
    const sameTick = await seedFolder(extensionWorker, 'E2E Recent Tick', []);
    await extensionWorker.evaluate(
      async ({ key, recent }) => {
        await chrome.storage.local.set({ [key]: recent });
      },
      {
        key: RECENT_KEY,
        recent: [
          { id: doubled.folderId, title: 'E2E Recent Double', lastUsed: 2 },
          { id: sameTick.folderId, title: 'E2E Recent Tick', lastUsed: 1 },
        ],
      },
    );

    await openPopup(page, extensionId);
    const doubleChip = page.getByTitle('Add to "E2E Recent Double"');
    await doubleChip.dblclick();
    await expect.poll(() => childCount(extensionWorker, doubled.folderId)).toBe(1);
    await expect(doubleChip).not.toHaveAttribute('aria-disabled');

    const tickChip = page.getByTitle('Add to "E2E Recent Tick"');
    await tickChip.evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
    await expect.poll(() => childCount(extensionWorker, sameTick.folderId)).toBe(1);
    await expect(tickChip).not.toHaveAttribute('aria-disabled');
    expect(await childCount(extensionWorker, sameTick.folderId)).toBe(1);
    expect(await childCount(extensionWorker, doubled.folderId)).toBe(1);
    await expect(toastRegion(page).getByText('Already saved', { exact: false })).toHaveCount(0);
  });
});

test('held or repeated Enter in the new folder input creates one folder and returns focus', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Enter Guard', []);

  await openPopup(page, extensionId);
  await folderRow(page, seeded.barTitle).click();
  const row = folderRow(page, 'E2E Enter Guard');
  const addFolder = row.getByRole('button', { name: 'Add folder' });

  await row.hover();
  await addFolder.click();
  const input = page.getByRole('textbox', { name: 'New folder name' });
  await input.fill('Held Enter');
  // A held key sends repeated keydown events.
  await page.keyboard.down('Enter');
  await page.keyboard.down('Enter');
  await expect(input).toHaveCount(0);
  await expect(addFolder).toBeFocused();
  // Still held: repeats now reach the focused button and must not reopen the input.
  await page.keyboard.down('Enter');
  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  await expect(input).toHaveCount(0);
  await expect(addFolder).toBeFocused();
  expect(await childTitles(extensionWorker, seeded.folderId)).toEqual(['Held Enter']);

  await row.hover();
  await addFolder.click();
  await input.fill('Double Enter');
  // Two presses before the first save finishes.
  await input.evaluate((element) => {
    for (let press = 0; press < 2; press += 1) {
      element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    }
  });
  await expect(input).toHaveCount(0);

  await expect
    .poll(() => childTitles(extensionWorker, seeded.folderId))
    .toEqual(['Held Enter', 'Double Enter']);
});

test.describe('reorder toasts', () => {
  test.beforeEach(async ({ extensionWorker }) => {
    await setSettings(extensionWorker, { sortOrder: 'folders' });
  });

  test('dropping an item onto its own position changes nothing and says nothing', async ({
    extensionId,
    extensionWorker,
    page,
  }) => {
    const seeded = await seedFolder(extensionWorker, 'E2E Noop Drop', [
      { title: 'Noop A', url: 'https://e2e.invalid/noop-a' },
      { title: 'Noop B', url: 'https://e2e.invalid/noop-b' },
    ]);

    await openPopup(page, extensionId);
    await page.getByPlaceholder('Search bookmarks...').fill('Noop');
    // Just above B is exactly where A already is.
    await dropOnEdge(
      bookmarkRow(page, 'Noop A').locator('a'),
      bookmarkRow(page, 'Noop B').locator('a'),
      'top',
    );
    await page.waitForTimeout(750);

    expect(await childTitles(extensionWorker, seeded.folderId)).toEqual(['Noop A', 'Noop B']);
    await expect(toastRegion(page).locator('li')).toHaveCount(0);
  });

  test('moving an item down in its folder reports the position it landed at', async ({
    extensionId,
    extensionWorker,
    page,
  }) => {
    const seeded = await seedFolder(extensionWorker, 'E2E Position', [
      { title: 'Pos A', url: 'https://e2e.invalid/a' },
      { title: 'Pos B', url: 'https://e2e.invalid/b' },
      { title: 'Pos C', url: 'https://e2e.invalid/c' },
      { title: 'Pos D', url: 'https://e2e.invalid/d' },
    ]);

    await openPopup(page, extensionId);
    await page.getByPlaceholder('Search bookmarks...').fill('Pos ');
    await dropOnEdge(
      bookmarkRow(page, 'Pos A').locator('a'),
      bookmarkRow(page, 'Pos C').locator('a'),
      'bottom',
    );

    await expect
      .poll(() => childTitles(extensionWorker, seeded.folderId))
      .toEqual(['Pos B', 'Pos C', 'Pos A', 'Pos D']);
    await expect(
      toastRegion(page).getByText('"Pos A" reordered to position 3', { exact: true }),
    ).toHaveCount(1);
  });
});

test('Expand all and Collapse all work during a search that auto-expands folders', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await seedFolder(extensionWorker, 'E2E Collapse Search', [
    {
      title: 'Collapse Sub',
      children: [{ title: 'Collapse Needle', url: 'https://e2e.invalid/needle' }],
    },
  ]);
  await setSettings(extensionWorker, { expandFoldersOnSearch: true });

  await openPopup(page, extensionId);
  await page.getByPlaceholder('Search bookmarks...').fill('Collapse Needle');
  await expect(bookmarkRow(page, 'Collapse Needle')).toBeVisible();

  await page.getByRole('button', { name: 'Collapse all', exact: true }).click();
  await expect(bookmarkRow(page, 'Collapse Needle')).toHaveCount(0);
  await expect(folderRow(page, 'E2E Collapse Search')).toHaveCount(0);

  await page.getByRole('button', { name: 'Expand all', exact: true }).click();
  await expect(bookmarkRow(page, 'Collapse Needle')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Collapse all', exact: true })).toBeVisible();
});

test('blank titles read "Untitled" and focus returns to the row after the delete dialog', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Untitled', [
    { title: '', url: 'https://e2e.invalid/untitled' },
  ]);
  await setSettings(extensionWorker, { confirmBeforeDelete: true });

  await openPopup(page, extensionId);
  await folderRow(page, seeded.barTitle).click();
  await folderRow(page, 'E2E Untitled').click();
  const row = bookmarkRow(page, 'Untitled');
  await expect(row).toBeVisible();

  const deleteButton = row.getByRole('button', { name: 'Delete bookmark' });
  await row.hover();
  await deleteButton.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Delete "Untitled"? This bookmark will be removed.');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(deleteButton).toBeFocused();

  await deleteButton.click();
  await dialog.getByRole('button', { name: 'Delete bookmark' }).click();
  await expect.poll(() => childCount(extensionWorker, seeded.folderId)).toBe(0);
  await expect(page.locator(`[data-folder-trigger="${seeded.folderId}"]`)).toBeFocused();
});

test('regex search treats Unicode escapes the same with or without Whole Word', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await seedFolder(extensionWorker, 'E2E Regex Mode', [
    { title: 'Émile Notes', url: 'https://e2e.invalid/emile' },
  ]);

  await openPopup(page, extensionId);
  const search = page.getByPlaceholder('Search bookmarks...');
  await page.getByRole('button', { name: 'Use Regular Expression' }).click();
  await search.fill('^\\p{Lu}mile');
  await expect(bookmarkRow(page, 'Émile Notes')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);

  await search.fill('mile\\-');
  await expect(page.getByRole('alert')).toHaveText(
    'Invalid regular expression. Searching as plain text instead.',
  );
});

test('folder rows use a leading tree chevron that lines up per depth and rotates open, with no blank gap', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const full = await seedFolder(extensionWorker, 'E2E Chevron Full', [
    { title: 'Chevron Sub', children: [{ title: 'Chevron Link', url: 'https://e2e.invalid/ch' }] },
    { title: 'Chevron Empty Sub', children: [] },
    { title: 'Chevron Top Link', url: 'https://e2e.invalid/top' },
  ]);
  await seedFolder(extensionWorker, 'E2E Chevron Empty', []);
  await seedFolder(
    extensionWorker,
    'E2E Chevron Long folder title that keeps going well past the width of a narrow popup',
    [{ title: 'Long Child', url: 'https://e2e.invalid/long' }],
  );
  await setSettings(extensionWorker, { popupHeight: 250 });

  await openPopup(page, extensionId);
  await folderRow(page, full.barTitle).click();
  await folderRow(page, 'E2E Chevron Full').click();
  const rowsByDepth = [
    [full.barTitle, await otherBookmarksTitle(extensionWorker)],
    ['E2E Chevron Full', 'E2E Chevron Empty', 'E2E Chevron Long folder title'],
    ['Chevron Sub', 'Chevron Empty Sub'],
  ];
  await expect(folderRow(page, 'Chevron Empty Sub')).toBeAttached();

  // Measure at rest: no pointer over the tree and no row holding focus.
  await page.mouse.move(0, 0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

  await expect
    .poll(async () => {
      const rows = await Promise.all(
        rowsByDepth.flat().map((title) => folderGeometry(page, title)),
      );
      const problems: string[] = [];
      for (const row of rows) {
        if (row.chevronRight > row.iconLeft) problems.push(`${row.title}: chevron after icon`);
        if (Math.abs(row.rowRight - row.triggerRight) > 1) {
          problems.push(`${row.title}: blank gap of ${row.rowRight - row.triggerRight}px`);
        }
        if (row.actionsOpacity !== '0') problems.push(`${row.title}: actions shown at rest`);
      }
      let offset = 0;
      let previousColumn = Number.NEGATIVE_INFINITY;
      for (const titles of rowsByDepth) {
        const depthRows = rows.slice(offset, offset + titles.length);
        offset += titles.length;
        const columns = depthRows.map((row) => row.chevronLeft);
        if (Math.max(...columns) - Math.min(...columns) > 1) {
          problems.push(`chevrons at one depth differ: ${columns.join(', ')}`);
        }
        if (columns[0] <= previousColumn) problems.push('child chevrons are not indented');
        previousColumn = columns[0];
      }
      return problems;
    })
    .toEqual([]);

  // The long title and its count run to the row end, not to a reserved actions column.
  const long = await folderGeometry(page, 'E2E Chevron Long folder title');
  expect(long.contentRight).toBeGreaterThan(long.rowRight - 16);
  expect(long.titleTruncated).toBe(true);

  // Empty folders keep an invisible chevron slot; folders with children show it.
  for (const title of ['E2E Chevron Empty', 'Chevron Empty Sub']) {
    await expect(treeChevron(folderRow(page, title))).toHaveCSS('visibility', 'hidden');
  }
  await expect(treeChevron(folderRow(page, 'E2E Chevron Full'))).toHaveCSS('visibility', 'visible');

  // Closed folders point right; open folders turn the chevron down.
  await expect(treeChevron(folderRow(page, 'Chevron Sub')).locator('..')).toHaveCSS(
    'rotate',
    'none',
  );
  await expect(treeChevron(folderRow(page, 'E2E Chevron Full')).locator('..')).toHaveCSS(
    'rotate',
    '90deg',
  );

  // A bookmark's icon and title line up with the folder icon and title beside it.
  const sub = await folderGeometry(page, 'Chevron Sub');
  const link = await bookmarkRow(page, 'Chevron Top Link').evaluate((row) => {
    const favicon = row.querySelector('img')?.getBoundingClientRect();
    const title = row.querySelector('a > span.truncate')?.getBoundingClientRect();
    return { iconLeft: favicon?.left ?? Number.NaN, titleLeft: title?.left ?? Number.NaN };
  });
  expect(Math.abs(link.iconLeft - sub.iconLeft)).toBeLessThanOrEqual(1);
  expect(Math.abs(link.titleLeft - sub.titleLeft)).toBeLessThanOrEqual(1);

  // Hovering shows the actions over the row's end without moving or scaling the row.
  const fullRow = folderRow(page, 'E2E Chevron Full');
  const before = await folderGeometry(page, 'E2E Chevron Full');
  await fullRow.hover();
  await expect(fullRow.locator('[data-slot="folder-actions"]')).toHaveCSS('opacity', '1');
  await expect(fullRow).toHaveCSS('scale', 'none');
  const hovered = await folderGeometry(page, 'E2E Chevron Full');
  expect(Math.abs(hovered.chevronLeft - before.chevronLeft)).toBeLessThanOrEqual(0.5);
  expect(hovered.actionsRight).toBeLessThanOrEqual(hovered.rowRight + 0.5);
  expect(hovered.actionsLeft).toBeGreaterThan(hovered.iconLeft);

  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).height))
    .toBe('300px');
});
