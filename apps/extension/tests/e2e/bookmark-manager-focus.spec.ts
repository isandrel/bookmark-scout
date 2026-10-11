/**
 * Where keyboard focus and the menus go in the bookmark manager: shortcuts keep working after a
 * select closes, focus moves to the next row after a deletion, the selection bar never covers the
 * focused row, the empty space below the rows has its menu, a menu the user emptied says so, and
 * a folder in the tree answers the row keys and takes drops beside it.
 */
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { managerUrl, managerRow as row, treeFolder, waitForNoOverlay } from './manager-helpers';
import { DELETE_KEY, RENAME_KEY } from './manager-keys';
import { childTitles, seedFolder, setSettings } from './popup-helpers';

const links = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, index) => ({
    title: `${prefix} ${String(index + 1).padStart(2, '0')}`,
    url: `https://e2e.invalid/${prefix.toLowerCase().replaceAll(' ', '-')}-${index + 1}`,
  }));

const selectedRows = (page: Page) => page.locator('tbody tr[aria-selected="true"]');

/** Moves a mouse drag from `source` onto `target` at `fraction` of its height, in small steps. */
async function mouseDrag(page: Page, source: Locator, target: Locator, fraction: number) {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('Drag source or target is not visible');
  await page.mouse.move(from.x + 40, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + 40, to.y + to.height * fraction, { steps: 6 });
  await page.mouse.move(to.x + 42, to.y + to.height * fraction, { steps: 3 });
  await page.mouse.up();
}

test.use({ viewport: { width: 1400, height: 900 } });

test.beforeEach(async ({ extensionWorker }) => {
  await setSettings(extensionWorker, { confirmBeforeDelete: false, sortOrder: 'alphabetical' });
});

test('shortcuts and the clipboard keys still work after Rows per page changes', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Rows Per Page', links('Rows', 3));
  await page.goto(managerUrl(extensionId, seeded.folderId));

  // The select keeps its closed list in the page; it must not count as an open overlay.
  await page.getByText('Rows per page').locator('..').getByRole('combobox').click();
  await page.getByRole('listbox').getByRole('option', { name: '20', exact: true }).click();
  await expect(page.getByRole('listbox')).toBeHidden();

  await row(page, 'Rows 01').click({ position: { x: 200, y: 10 } });
  await page.keyboard.press('ControlOrMeta+a');
  await expect(selectedRows(page)).toHaveCount(3);
  await page.keyboard.press(DELETE_KEY);
  await expect.poll(() => childTitles(extensionWorker, seeded.folderId)).toEqual([]);
  await page.keyboard.press('ControlOrMeta+z');
  await expect
    .poll(() => childTitles(extensionWorker, seeded.folderId))
    .toEqual(['Rows 01', 'Rows 02', 'Rows 03']);
});

test('after a confirmed Delete, focus moves to the next row, else the previous one', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { confirmBeforeDelete: true });
  const seeded = await seedFolder(extensionWorker, 'E2E Delete Focus', links('Focus', 3));
  await page.goto(managerUrl(extensionId, seeded.folderId));
  const confirm = page.getByRole('dialog', { name: 'Delete bookmark' });

  await row(page, 'Focus 02').click({ position: { x: 200, y: 10 } });
  await page.keyboard.press(DELETE_KEY);
  await confirm.getByRole('button', { name: 'Delete bookmark' }).click();
  await expect
    .poll(() => childTitles(extensionWorker, seeded.folderId))
    .toEqual(['Focus 01', 'Focus 03']);
  await expect(row(page, 'Focus 03')).toBeFocused();

  // The last row has no next one: focus goes to the row before it, and the keys keep working.
  await page.keyboard.press(DELETE_KEY);
  await confirm.getByRole('button', { name: 'Delete bookmark' }).click();
  await expect.poll(() => childTitles(extensionWorker, seeded.folderId)).toEqual(['Focus 01']);
  await expect(row(page, 'Focus 01')).toBeFocused();
  await page.keyboard.press(DELETE_KEY);
  await expect(confirm).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(confirm).toBeHidden();
});

test('the selection bar never covers the focused row', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 560 });
  const seeded = await seedFolder(extensionWorker, 'E2E Sticky Bar', links('Sticky', 12));
  await page.goto(managerUrl(extensionId, seeded.folderId));
  await row(page, 'Sticky 01').click({ position: { x: 200, y: 10 } });
  const bar = page.getByText('1 selected').locator('..');
  await expect(bar).toBeVisible();

  for (let step = 0; step < 9; step += 1) await page.keyboard.press('ArrowDown');
  const focused = row(page, 'Sticky 10');
  await expect(focused).toBeFocused();
  await expect
    .poll(async () => {
      const rowBox = await focused.boundingBox();
      const barBox = await bar.boundingBox();
      return rowBox && barBox ? Math.round(rowBox.y + rowBox.height - barBox.y) : null;
    })
    .toBeLessThanOrEqual(0);
});

test('a right click below the rows opens the folder menu; an emptied item menu says so', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Empty Space', links('Space', 2));
  await page.goto(managerUrl(extensionId, seeded.folderId));

  // The menu area reaches down to the pagination, well below the two rows.
  const area = page.getByTestId('bookmark-table-menu-area');
  const lastRow = await row(page, 'Space 02').boundingBox();
  const box = await area.boundingBox();
  if (!lastRow || !box) throw new Error('The table is not visible');
  expect(box.y + box.height).toBeGreaterThan(lastRow.y + lastRow.height + 200);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height - 20, { button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Add new bookmark' })).toBeVisible();
  await page.keyboard.press('Escape');
  await waitForNoOverlay(page);

  // Show in folder applies to search results only, so a row of the folder shown has nothing.
  await setSettings(extensionWorker, { managerMenuActions: ['showInFolder'] });
  await page.reload();
  await row(page, 'Space 01').click({ button: 'right', position: { x: 200, y: 10 } });
  const none = page.getByRole('menuitem', { name: 'No actions available' });
  await expect(none).toBeVisible();
  await expect(none).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('menuitem')).toHaveCount(1);
});

test('Options keeps one command that works on any item in the manager menus', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { managerMenuActions: ['viewDetails', 'delete'] });
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByRole('tab', { name: 'Behavior' }).click();
  const panel = page.getByTestId('manager-menus');
  await expect(panel).toContainText(
    'At least one of View Details and Copy Bookmark ID stays shown',
  );
  await expect(panel.getByRole('checkbox', { name: 'View Details' })).toBeDisabled();
  await expect(panel.getByRole('checkbox', { name: 'Delete', exact: true })).toBeEnabled();

  // With Copy Bookmark ID shown too, either one may go.
  await panel.getByRole('checkbox', { name: 'Copy Bookmark ID' }).click();
  await expect(panel.getByRole('checkbox', { name: 'View Details' })).toBeEnabled();
});

test('a folder in the tree answers Delete, rename, and the clipboard keys', async ({
  extensionId,
  extensionWorker,
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const seeded = await seedFolder(extensionWorker, 'E2E Tree Keys Commands', [
    { title: 'Tree Source', children: [{ title: 'Inside Source', url: 'https://e2e.invalid/s' }] },
    { title: 'Tree Target', children: [] },
    { title: 'Tree Doomed', children: [] },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));

  // Rename opens the edit dialog for the folder.
  await treeFolder(page, 'Tree Source').focus();
  await page.keyboard.press(RENAME_KEY);
  const edit = page.getByRole('dialog', { name: 'Edit folder' });
  await expect(edit).toBeVisible();
  await page.keyboard.press('Escape');
  await waitForNoOverlay(page);

  // Copy on a tree folder copies that folder, and paste on another goes into it.
  await treeFolder(page, 'Tree Source').focus();
  await page.keyboard.press('ControlOrMeta+c');
  await treeFolder(page, 'Tree Target').focus();
  await page.keyboard.press('ControlOrMeta+v');
  await expect
    .poll(() => childTitles(extensionWorker, seeded.ids['Tree Target']))
    .toEqual(['Tree Source']);
  // The table's selection was not what was copied.
  await expect
    .poll(() => childTitles(extensionWorker, seeded.folderId))
    .toEqual(['Tree Source', 'Tree Target', 'Tree Doomed']);

  // Delete removes the focused folder.
  await treeFolder(page, 'Tree Doomed').focus();
  await page.keyboard.press(DELETE_KEY);
  await expect
    .poll(() => childTitles(extensionWorker, seeded.folderId))
    .toEqual(['Tree Source', 'Tree Target']);
});

test('the top and bottom edges of a tree folder drop beside it', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Tree Edges', [
    { title: 'Edge A', children: [] },
    { title: 'Edge B', children: [] },
    { title: 'Edge C', children: [] },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  // The tree shows the change before the next drag measures where its folders are.
  const treeOrder = page.getByTestId('folder-tree').getByRole('treeitem', { name: /^Edge [ABC]$/ });
  await expect(treeOrder).toHaveText(['Edge A', 'Edge B', 'Edge C']);

  // Edge C onto the top edge of Edge A: before it, not into it.
  await mouseDrag(page, treeFolder(page, 'Edge C'), treeFolder(page, 'Edge A'), 0.1);
  await expect
    .poll(() => childTitles(extensionWorker, seeded.folderId))
    .toEqual(['Edge C', 'Edge A', 'Edge B']);
  await expect(treeOrder).toHaveText(['Edge C', 'Edge A', 'Edge B']);

  // Edge C onto the bottom edge of the closed Edge B: after it.
  await mouseDrag(page, treeFolder(page, 'Edge C'), treeFolder(page, 'Edge B'), 0.9);
  await expect
    .poll(() => childTitles(extensionWorker, seeded.folderId))
    .toEqual(['Edge A', 'Edge B', 'Edge C']);
  await expect(treeOrder).toHaveText(['Edge A', 'Edge B', 'Edge C']);

  // The middle still drops into the folder.
  await mouseDrag(page, treeFolder(page, 'Edge C'), treeFolder(page, 'Edge A'), 0.5);
  await expect.poll(() => childTitles(extensionWorker, seeded.ids['Edge A'])).toEqual(['Edge C']);
  await expect(page.locator('[data-drop-zone]')).toHaveCount(0);
});
