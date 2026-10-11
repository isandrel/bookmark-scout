/**
 * Drag and drop and the clipboard keys in the bookmark manager, after Chrome's: rows reorder in
 * the browser's order and drop into folders in the table or the tree, closed tree folders open
 * while a drag hovers them, links dropped from elsewhere become bookmarks, a drag carries the
 * URLs out, and Ctrl/Cmd+C, X, and V copy, move, and paste.
 */
import type { Locator, Page } from '@playwright/test';
import { expect, test, toastRegion } from './fixtures';
import { childTitles, seedFolder, setSettings } from './popup-helpers';

function managerUrl(extensionId: string, folderId: string) {
  return `chrome-extension://${extensionId}/bookmarks.html?id=${folderId}`;
}

function row(page: Page, title: string) {
  return page.locator('tbody tr').filter({ hasText: title });
}

function treeFolder(page: Page, title: string) {
  return page.getByTestId('folder-tree').getByRole('button', { name: title, exact: true });
}

/** Drags `source` onto `target` at `fraction` of the target's height. */
async function dragOnto(source: Locator, target: Locator, fraction: number) {
  const box = await target.boundingBox();
  if (!box) throw new Error('Drop target is not visible');
  await source.dragTo(target, {
    sourcePosition: { x: 200, y: 10 },
    targetPosition: { x: Math.min(200, box.width / 2), y: box.height * fraction },
  });
}

/** Moves a mouse drag over `target` in small steps, so the page sees dragover events. */
async function dragOver(page: Page, target: Locator) {
  const box = await target.boundingBox();
  if (!box) throw new Error('Drag target is not visible');
  await page.mouse.move(box.x + 10, box.y + box.height / 2, { steps: 3 });
  await page.mouse.move(box.x + 20, box.y + box.height / 2, { steps: 3 });
}

/** Drops data from another page or app on `target`, as the browser's drag events would. */
async function dropExternal(target: Locator, data: Record<string, string>) {
  await target.evaluate((element, entries) => {
    const transfer = new DataTransfer();
    for (const [type, value] of Object.entries(entries)) transfer.setData(type, value);
    const box = element.getBoundingClientRect();
    const init = {
      bubbles: true,
      cancelable: true,
      dataTransfer: transfer,
      clientX: box.left + box.width / 2,
      clientY: box.top + box.height / 2,
    };
    element.dispatchEvent(new DragEvent('dragenter', init));
    element.dispatchEvent(new DragEvent('dragover', init));
    element.dispatchEvent(new DragEvent('drop', init));
  }, data);
}

test.use({ viewport: { width: 1400, height: 900 } });

test.beforeEach(async ({ extensionWorker }) => {
  await setSettings(extensionWorker, { confirmBeforeDelete: false, sortOrder: 'alphabetical' });
});

test('rows reorder in browser order, and drop into folder rows and tree folders', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Drag Rows', [
    { title: 'Drag Box', children: [] },
    { title: 'Drag One', url: 'https://e2e.invalid/1' },
    { title: 'Drag Two', url: 'https://e2e.invalid/2' },
    { title: 'Drag Three', url: 'https://e2e.invalid/3' },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  await page.getByRole('button', { name: 'Browser order' }).click();

  // The top half of a bookmark row drops before it.
  await dragOnto(row(page, 'Drag Three'), row(page, 'Drag One'), 0.2);
  await expect
    .poll(() => childTitles(extensionWorker, seeded.folderId))
    .toEqual(['Drag Box', 'Drag Three', 'Drag One', 'Drag Two']);
  await expect(page.locator('[data-drop-zone]')).toHaveCount(0);

  // A selection drags together; the middle of a folder row drops into it.
  await row(page, 'Drag Three').click({ position: { x: 200, y: 10 } });
  await row(page, 'Drag One').click({ position: { x: 200, y: 10 }, modifiers: ['Shift'] });
  await dragOnto(row(page, 'Drag One'), row(page, 'Drag Box'), 0.5);
  await expect
    .poll(() => childTitles(extensionWorker, seeded.ids['Drag Box']))
    .toEqual(['Drag Three', 'Drag One']);

  // One undo step puts both back.
  await page.locator('tbody tr').first().focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect
    .poll(() => childTitles(extensionWorker, seeded.folderId))
    .toEqual(['Drag Box', 'Drag Three', 'Drag One', 'Drag Two']);

  // A row dropped on a folder in the tree goes into it.
  await dragOnto(row(page, 'Drag Two'), treeFolder(page, 'Drag Box'), 0.5);
  await expect
    .poll(() => childTitles(extensionWorker, seeded.ids['Drag Box']))
    .toEqual(['Drag Two']);
});

test('in a sorted view, rows only drop into folders', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Drag Sorted', [
    { title: 'Sorted Folder', children: [] },
    { title: 'Sorted Alpha', url: 'https://e2e.invalid/a' },
    { title: 'Sorted Beta', url: 'https://e2e.invalid/b' },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));

  // Alphabetical order: a drop near a row's top edge does not reorder.
  await dragOnto(row(page, 'Sorted Beta'), row(page, 'Sorted Alpha'), 0.1);
  await page.waitForTimeout(300);
  expect(await childTitles(extensionWorker, seeded.folderId)).toEqual([
    'Sorted Folder',
    'Sorted Alpha',
    'Sorted Beta',
  ]);
  // The folder row still takes it, even at its edge.
  await dragOnto(row(page, 'Sorted Beta'), row(page, 'Sorted Folder'), 0.1);
  await expect
    .poll(() => childTitles(extensionWorker, seeded.ids['Sorted Folder']))
    .toEqual(['Sorted Beta']);
});

test('hovering a closed tree folder during a drag opens it', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Drag Hover', [
    { title: 'Hover Outer', children: [{ title: 'Hover Inner', children: [] }] },
    { title: 'Hover Item', url: 'https://e2e.invalid/hover' },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  await expect(treeFolder(page, 'Hover Inner')).toHaveCount(0);

  await row(page, 'Hover Item').hover({ position: { x: 200, y: 10 } });
  await page.mouse.down();
  await dragOver(page, treeFolder(page, 'Hover Outer'));
  await expect(treeFolder(page, 'Hover Inner')).toBeVisible();
  await dragOver(page, treeFolder(page, 'Hover Inner'));
  await page.mouse.up();
  await expect
    .poll(() => childTitles(extensionWorker, seeded.ids['Hover Inner']))
    .toEqual(['Hover Item']);
});

test('links dropped from elsewhere become bookmarks, and drags carry URLs out', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Drag Links', [
    { title: 'Links Box', children: [] },
    { title: 'Links Item', url: 'https://e2e.invalid/item' },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));

  // Dropped on the table's empty space: the end of the folder shown, titled from the HTML.
  await dropExternal(page.getByTestId('bookmark-table-menu-area'), {
    'text/uri-list': 'https://e2e.invalid/dropped-a\r\nhttps://e2e.invalid/dropped-b',
    'text/html': '<a href="https://e2e.invalid/dropped-a">Dropped A</a>',
  });
  await expect(toastRegion(page).getByText('Added 2 bookmarks')).toBeVisible();
  await expect
    .poll(() => childTitles(extensionWorker, seeded.folderId))
    .toEqual(['Links Box', 'Links Item', 'Dropped A', 'https://e2e.invalid/dropped-b']);

  // Dropped on a folder in the tree: into it.
  await dropExternal(treeFolder(page, 'Links Box'), { 'text/plain': 'https://e2e.invalid/c' });
  await expect
    .poll(() => childTitles(extensionWorker, seeded.ids['Links Box']))
    .toEqual(['https://e2e.invalid/c']);

  // A drag out carries the URL as a link list, plain text, and HTML.
  const carried = await row(page, 'Links Item').evaluate((element) => {
    const transfer = new DataTransfer();
    element.dispatchEvent(
      new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: transfer }),
    );
    element.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
    return {
      uriList: transfer.getData('text/uri-list'),
      plain: transfer.getData('text/plain'),
      html: transfer.getData('text/html'),
    };
  });
  expect(carried.uriList).toBe('https://e2e.invalid/item');
  expect(carried.plain).toBe('https://e2e.invalid/item');
  expect(carried.html).toContain('href="https://e2e.invalid/item"');
});

test('Ctrl/Cmd+C, X, and V copy URLs, move items, and paste links', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const seeded = await seedFolder(extensionWorker, 'E2E Clip Keys', [
    { title: 'Keys Box', children: [] },
    { title: 'Keys One', url: 'https://e2e.invalid/k1' },
    { title: 'Keys Two', url: 'https://e2e.invalid/k2' },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));

  // Copy: the URLs go on the clipboard; paste puts copies after the selection.
  await row(page, 'Keys One').click({ position: { x: 200, y: 10 } });
  await row(page, 'Keys Two').click({ position: { x: 200, y: 10 }, modifiers: ['Shift'] });
  await page.keyboard.press('ControlOrMeta+c');
  await expect(toastRegion(page).getByText('Copied 2 items')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'https://e2e.invalid/k1\nhttps://e2e.invalid/k2',
  );
  await page.keyboard.press('ControlOrMeta+v');
  await expect
    .poll(() => childTitles(extensionWorker, seeded.folderId))
    .toEqual(['Keys Box', 'Keys One', 'Keys Two', 'Keys One', 'Keys Two']);

  // Cut one, open the box, paste: the item moves.
  await row(page, 'Keys One').first().click({ position: { x: 200, y: 10 } });
  await page.keyboard.press('ControlOrMeta+x');
  await expect(toastRegion(page).getByText('Cut Keys One')).toBeVisible();
  await treeFolder(page, 'Keys Box').click();
  await expect(page).toHaveURL(new RegExp(`id=${seeded.ids['Keys Box']}`));
  await page.keyboard.press('ControlOrMeta+v');
  await expect
    .poll(() => childTitles(extensionWorker, seeded.ids['Keys Box']))
    .toEqual(['Keys One']);
  expect((await childTitles(extensionWorker, seeded.folderId)).sort()).toEqual([
    'Keys Box',
    'Keys One',
    'Keys Two',
    'Keys Two',
  ]);

  // Links another app copied paste as new bookmarks.
  await page.evaluate(() => navigator.clipboard.writeText('https://e2e.invalid/from-app'));
  await page.keyboard.press('ControlOrMeta+v');
  await expect
    .poll(() => childTitles(extensionWorker, seeded.ids['Keys Box']))
    .toEqual(['Keys One', 'https://e2e.invalid/from-app']);
});
