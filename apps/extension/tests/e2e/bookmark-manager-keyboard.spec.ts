/**
 * The manager's selection and keyboard model after Chrome's manager: click, Ctrl/Cmd+click, and
 * Shift+click selection, Ctrl+A across pages, Escape, the grid's arrow keys and roving tabindex,
 * Delete, rename, open (in tabs, background tabs, a window, with a confirmation for many), double
 * click, and undo and redo of every manager change, kept across a reload.
 */
import type { Page, Worker } from '@playwright/test';
import { expect, test, toastRegion } from './fixtures';
import { DELETE_KEY, OPEN_KEY, RENAME_KEY } from './manager-keys';
import { readStored, STORAGE_ITEMS, setSettings, writeStored } from './storage';

type SeedItem = { title: string; url?: string; children?: SeedItem[] };

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
      const folder = await chrome.bookmarks.create({
        parentId: writableRoot.id,
        title: folderTitle,
      });
      await create(folder.id, entries);
      return { folderId: folder.id, ids };
    },
    { folderTitle: title, entries: items },
  );
}

const links = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, index) => ({
    title: `${prefix} ${String(index + 1).padStart(2, '0')}`,
    url: `https://e2e.invalid/${prefix.toLowerCase()}-${index + 1}`,
  }));

function managerUrl(extensionId: string, folderId: string) {
  return `chrome-extension://${extensionId}/bookmarks.html?id=${folderId}`;
}

/** How many changes the stored history can undo and redo. */
async function historyDepths(page: Page) {
  const history = await readStored<{ undo: unknown[]; redo: unknown[] }>(
    page,
    STORAGE_ITEMS.bookmarkHistory,
  );
  return { undo: history?.undo.length ?? 0, redo: history?.redo.length ?? 0 };
}

function row(page: Page, title: string) {
  return page.locator('tbody tr').filter({ hasText: title });
}

function childTitles(worker: Worker, folderId: string) {
  return worker.evaluate(
    async (id) => (await chrome.bookmarks.getChildren(id)).map((child) => child.title),
    folderId,
  );
}

const selectedCount = (page: Page) => page.locator('tbody tr[aria-selected="true"]').count();

/** Which of `titles` are selected rows on the page shown, in the order given. */
async function selectedRowTitles(page: Page, titles: string[]) {
  const rows = await page.locator('tbody tr').evaluateAll((elements) =>
    elements.map((element) => ({
      text: element.textContent ?? '',
      selected: element.getAttribute('aria-selected') === 'true',
    })),
  );
  return titles.filter((title) =>
    rows.some((shown) => shown.selected && shown.text.includes(title)),
  );
}

/**
 * Shortcuts wait while a dialog or menu is in the page, and Base UI removes one a frame after it
 * closes (hidden by then, so role queries no longer see it).
 */
async function waitForNoOverlay(page: Page) {
  await expect(page.locator('[role="dialog"], [role="menu"], [role="listbox"]')).toHaveCount(0);
}

function tabCount(worker: Worker) {
  return worker.evaluate(async () => (await chrome.tabs.query({})).length);
}

test.use({ viewport: { width: 1400, height: 900 } });

test.beforeEach(async ({ extensionWorker }) => {
  await setSettings(extensionWorker, { confirmBeforeDelete: false, sortOrder: 'alphabetical' });
});

test('click, Ctrl/Cmd+click, and Shift+click select rows; Escape clears them', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Select Clicks', links('Pick', 5));
  const titles = links('Pick', 5).map((item) => item.title);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  await expect(page.locator('tbody tr')).toHaveCount(5);
  await expect(page.getByRole('grid', { name: 'E2E Select Clicks' })).toHaveAttribute(
    'aria-multiselectable',
    'true',
  );

  await row(page, 'Pick 02').click({ position: { x: 200, y: 10 } });
  expect(await selectedRowTitles(page, titles)).toEqual(['Pick 02']);
  await row(page, 'Pick 04').click({ position: { x: 200, y: 10 }, modifiers: ['ControlOrMeta'] });
  expect(await selectedRowTitles(page, titles)).toEqual(['Pick 02', 'Pick 04']);
  // Shift+click selects from the anchor (the row clicked last without Shift).
  await row(page, 'Pick 05').click({ position: { x: 200, y: 10 }, modifiers: ['Shift'] });
  expect(await selectedRowTitles(page, titles)).toEqual(['Pick 04', 'Pick 05']);
  await row(page, 'Pick 01').click({ position: { x: 200, y: 10 }, modifiers: ['Shift'] });
  expect(await selectedRowTitles(page, titles)).toEqual([
    'Pick 01',
    'Pick 02',
    'Pick 03',
    'Pick 04',
  ]);
  await expect(page.getByTestId('bulk-actions')).toContainText('4 selected');
  // Ctrl/Cmd+click removes one row again.
  await row(page, 'Pick 03').click({ position: { x: 200, y: 10 }, modifiers: ['ControlOrMeta'] });
  expect(await selectedRowTitles(page, titles)).toEqual(['Pick 01', 'Pick 02', 'Pick 04']);

  await page.keyboard.press('Escape');
  expect(await selectedCount(page)).toBe(0);
  await expect(page.getByTestId('bulk-actions')).toHaveCount(0);
});

test('Ctrl/Cmd+A selects every row the filters show, on every page', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await writeStored(extensionWorker, STORAGE_ITEMS.tableLayout, { pageSize: 10 });
  const seeded = await seedFolder(extensionWorker, 'E2E Select All', [
    ...links('All', 23),
    { title: 'Other Thing', url: 'https://e2e.invalid/other' },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  await expect(page.locator('tbody tr')).toHaveCount(10);

  await page.keyboard.press('ControlOrMeta+a');
  await expect(page.getByTestId('bulk-actions')).toContainText('24 selected');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('bulk-actions')).toHaveCount(0);

  // With a search, only the matches are selected.
  await page
    .getByRole('textbox', { name: 'Search titles, addresses, folders, and tags' })
    .fill('All ');
  await page.getByRole('checkbox', { name: 'Current folder only' }).check();
  await page
    .locator('tbody tr')
    .first()
    .click({ position: { x: 200, y: 10 } });
  await page.keyboard.press('ControlOrMeta+a');
  await expect(page.getByTestId('bulk-actions')).toContainText('23 selected');
  // In the title filter, Ctrl/Cmd+A selects its text instead.
  await page.getByRole('textbox', { name: 'Search titles, addresses, folders, and tags' }).focus();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('bulk-actions')).toContainText('23 selected');
});

test('the grid is one tab stop; arrows move and select, Shift extends, Space toggles', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await writeStored(extensionWorker, STORAGE_ITEMS.tableLayout, { pageSize: 10 });
  const items = links('Key', 12);
  const titles = items.map((item) => item.title);
  const seeded = await seedFolder(extensionWorker, 'E2E Grid Keys', items);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  await expect(page.locator('tbody tr[tabindex="0"]')).toHaveCount(1);
  await expect(page.locator('tbody tr[tabindex="-1"]')).toHaveCount(9);

  await row(page, 'Key 01').focus();
  await page.keyboard.press('ArrowDown');
  await expect(row(page, 'Key 02')).toBeFocused();
  expect(await selectedRowTitles(page, titles)).toEqual(['Key 02']);
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+ArrowDown');
  expect(await selectedRowTitles(page, titles)).toEqual(['Key 02', 'Key 03', 'Key 04']);
  await expect(row(page, 'Key 04')).toHaveAttribute('tabindex', '0');
  await page.keyboard.press('Space');
  expect(await selectedRowTitles(page, titles)).toEqual(['Key 02', 'Key 03']);

  // End goes to the last row, on the next page.
  await page.keyboard.press('End');
  await expect(row(page, 'Key 12')).toBeFocused();
  await expect(page.getByText('Page 2 of 2', { exact: true })).toBeVisible();
  await page.keyboard.press('Home');
  await expect(row(page, 'Key 01')).toBeFocused();
  await expect(page.getByText('Page 1 of 2', { exact: true })).toBeVisible();
});

test('Delete removes the selection, and Ctrl/Cmd+Z and redo work after a reload', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Undo Delete', [
    { title: 'Undo Sub', children: [{ title: 'Undo Inside', url: 'https://e2e.invalid/inside' }] },
    ...links('Gone', 3),
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  await row(page, 'Gone 01').click({ position: { x: 200, y: 10 } });
  await row(page, 'Undo Sub').click({ position: { x: 200, y: 10 }, modifiers: ['ControlOrMeta'] });
  await page.keyboard.press(DELETE_KEY);
  await expect
    .poll(() => childTitles(extensionWorker, seeded.folderId))
    .toEqual(['Gone 02', 'Gone 03']);
  // The bookmarks change before the delete has stored its history entry; a reload in between
  // would drop the entry, so wait for it.
  await expect.poll(() => historyDepths(page)).toEqual({ undo: 1, redo: 0 });

  // The history outlives the page: reload, then undo.
  await page.reload();
  await expect(row(page, 'Gone 02')).toBeVisible();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(
    toastRegion(page).getByText('✓ Undone: Delete 2 items', { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => childTitles(extensionWorker, seeded.folderId))
    .toEqual(['Undo Sub', 'Gone 01', 'Gone 02', 'Gone 03']);
  // The folder came back with what was inside it.
  await row(page, 'Undo Sub').dblclick();
  await expect(row(page, 'Undo Inside')).toBeVisible();
  await page.goBack();
  await expect(row(page, 'Gone 02')).toBeVisible();

  // Each step finishes (the history is stored and the toast shown) before the next key: the page
  // runs one step at a time and drops a key pressed while one is still running, as a held key
  // would repeat. The bookmarks change before the step has stored the history, so they alone are
  // not enough to wait on.
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(
    toastRegion(page).getByText('✓ Redone: Delete 2 items', { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => childTitles(extensionWorker, seeded.folderId))
    .toEqual(['Gone 02', 'Gone 03']);
  await expect.poll(() => historyDepths(page)).toEqual({ undo: 1, redo: 0 });
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => childTitles(extensionWorker, seeded.folderId)).toHaveLength(4);
  await expect.poll(() => historyDepths(page)).toEqual({ undo: 0, redo: 1 });
  await page.keyboard.press('ControlOrMeta+z');
  await expect(toastRegion(page).getByText('Nothing to undo', { exact: true })).toBeVisible();
});

test('rename, bulk move, and reorder are undone and redone; changes made since are skipped', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Undo Edits', [
    { title: 'Target Box', children: [] },
    ...links('Edit', 3),
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));

  // Rename with the keyboard (F2, or Enter on a Mac), then undo and redo it.
  await row(page, 'Edit 01').click({ position: { x: 200, y: 10 } });
  await page.keyboard.press(RENAME_KEY);
  const dialog = page.getByRole('dialog', { name: 'Edit bookmark' });
  await dialog.getByLabel('Name').fill('Edit 01 renamed');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(row(page, 'Edit 01 renamed')).toBeVisible();
  // Shortcuts wait while a dialog is open, also while it closes.
  await waitForNoOverlay(page);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(
    toastRegion(page).getByText('✓ Undone: Edit "Edit 01"', { exact: true }),
  ).toBeVisible();
  await expect(row(page, 'Edit 01 renamed')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(row(page, 'Edit 01 renamed')).toBeVisible();

  // Move two bookmarks into a folder, then undo.
  await row(page, 'Edit 02').click({ position: { x: 200, y: 10 } });
  await row(page, 'Edit 03').click({ position: { x: 200, y: 10 }, modifiers: ['Shift'] });
  await page.getByTestId('bulk-actions').getByRole('button', { name: 'Move to folder' }).click();
  const moveDialog = page.getByRole('dialog', { name: 'Move 2 items' });
  await moveDialog.getByRole('combobox').click();
  await page.getByRole('option', { name: /Target Box$/ }).click();
  await moveDialog.getByRole('button', { name: 'Move to folder' }).click();
  await expect.poll(() => childTitles(extensionWorker, seeded.ids['Target Box'])).toHaveLength(2);
  await waitForNoOverlay(page);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => childTitles(extensionWorker, seeded.ids['Target Box'])).toEqual([]);
  await expect
    .poll(() => childTitles(extensionWorker, seeded.folderId))
    .toEqual(['Target Box', 'Edit 01 renamed', 'Edit 02', 'Edit 03']);

  // Reorder with the row buttons (browser order), then undo.
  await page.getByRole('button', { name: 'Browser order' }).click();
  await row(page, 'Edit 03').hover();
  await row(page, 'Edit 03').getByRole('button', { name: 'Move to top' }).click();
  await expect
    .poll(() => childTitles(extensionWorker, seeded.folderId))
    .toEqual(['Edit 03', 'Target Box', 'Edit 01 renamed', 'Edit 02']);
  await page
    .locator('tbody tr')
    .first()
    .click({ position: { x: 200, y: 10 } });
  await page.keyboard.press('ControlOrMeta+z');
  await expect
    .poll(() => childTitles(extensionWorker, seeded.folderId))
    .toEqual(['Target Box', 'Edit 01 renamed', 'Edit 02', 'Edit 03']);

  // A move made elsewhere since is never undone over.
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect
    .poll(() => childTitles(extensionWorker, seeded.folderId))
    .toEqual(['Edit 03', 'Target Box', 'Edit 01 renamed', 'Edit 02']);
  await extensionWorker.evaluate(({ id, parentId }) => chrome.bookmarks.move(id, { parentId }), {
    id: seeded.ids['Edit 03'],
    parentId: seeded.ids['Target Box'],
  });
  await page.keyboard.press('ControlOrMeta+z');
  await expect(
    toastRegion(page).getByText("× Can't undo: the bookmarks changed since.", { exact: true }),
  ).toBeVisible();
  expect(await childTitles(extensionWorker, seeded.ids['Target Box'])).toEqual(['Edit 03']);
});

test('opening asks first above the Ask Before Opening More Than setting', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { openConfirmAbove: 2 });
  const seeded = await seedFolder(extensionWorker, 'E2E Open Limit', links('Few', 3));
  await page.goto(managerUrl(extensionId, seeded.folderId));
  const start = await tabCount(extensionWorker);
  await row(page, 'Few 01').click({ position: { x: 200, y: 10 } });
  await row(page, 'Few 03').click({ position: { x: 200, y: 10 }, modifiers: ['Shift'] });
  await page.keyboard.press('ControlOrMeta+Enter');
  // Three is more than the setting's two, though far below the default.
  const confirm = page.getByRole('dialog', { name: 'Open 3 tabs?' });
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await waitForNoOverlay(page);
  expect(await tabCount(extensionWorker)).toBe(start);
});

test('Enter, Ctrl/Cmd+Enter, Shift+Enter, and double click open, asking first for many', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Open Keys', [
    { title: 'Many Links', children: links('Many', 16) },
    ...links('Open', 3),
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  const start = await tabCount(extensionWorker);

  // A folder of 16 bookmarks asks first; Cancel opens nothing.
  await row(page, 'Many Links').click({ position: { x: 200, y: 10 } });
  await page.keyboard.press('ControlOrMeta+Enter');
  const confirm = page.getByRole('dialog', { name: 'Open 16 tabs?' });
  await expect(confirm).toContainText('This opens 16 bookmarks at once.');
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await waitForNoOverlay(page);
  expect(await tabCount(extensionWorker)).toBe(start);
  await row(page, 'Many Links').focus();
  await page.keyboard.press('ControlOrMeta+Enter');
  await confirm.getByRole('button', { name: 'Open all' }).click();
  await expect.poll(() => tabCount(extensionWorker)).toBe(start + 16);

  // Ctrl/Cmd+Enter opens the selection in background tabs.
  await row(page, 'Open 02').click({ position: { x: 200, y: 10 } });
  await row(page, 'Open 03').click({ position: { x: 200, y: 10 }, modifiers: ['Shift'] });
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect.poll(() => tabCount(extensionWorker)).toBe(start + 18);

  // Enter (Cmd+O on a Mac) opens a bookmark in a tab in front.
  await row(page, 'Open 01').click({ position: { x: 200, y: 10 } });
  await page.keyboard.press(OPEN_KEY);
  await expect.poll(() => tabCount(extensionWorker)).toBe(start + 19);

  // Shift+Enter opens the selection in a new window.
  await page.bringToFront();
  const windows = () =>
    extensionWorker.evaluate(async () => (await chrome.windows.getAll()).length);
  const startWindows = await windows();
  await row(page, 'Open 02').click({ position: { x: 200, y: 10 } });
  await page.keyboard.press('Shift+Enter');
  await expect.poll(windows).toBe(startWindows + 1);

  // Double-clicking a folder opens it in the manager.
  await page.bringToFront();
  await row(page, 'Many Links').dblclick({ position: { x: 200, y: 10 } });
  await expect(page).toHaveURL(new RegExp(`id=${seeded.ids['Many Links']}$`));
});

test("a deletion toast's Undo and Ctrl/Cmd+Z share one history", async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Toast History', links('Toast', 2));
  await page.goto(managerUrl(extensionId, seeded.folderId));
  await row(page, 'Toast 01').getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect.poll(() => childTitles(extensionWorker, seeded.folderId)).toEqual(['Toast 02']);
  await toastRegion(page).getByRole('button', { name: 'Undo', exact: true }).click();
  await expect
    .poll(() => childTitles(extensionWorker, seeded.folderId))
    .toEqual(['Toast 01', 'Toast 02']);
  // The toast's Undo used the history entry, so redo deletes it again and undo has nothing left.
  await page.locator('tbody tr').first().focus();
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(() => childTitles(extensionWorker, seeded.folderId)).toEqual(['Toast 02']);
  // Each step ends with its toast; a key pressed before that is ignored, like a held key.
  await expect(
    toastRegion(page).getByText('✓ Redone: Delete "Toast 01"', { exact: true }),
  ).toBeVisible();
  await page.keyboard.press('ControlOrMeta+z');
  await expect
    .poll(() => childTitles(extensionWorker, seeded.folderId))
    .toEqual(['Toast 01', 'Toast 02']);
  await expect(
    toastRegion(page).getByText('✓ Undone: Delete "Toast 01"', { exact: true }),
  ).toBeVisible();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(toastRegion(page).getByText('Nothing to undo', { exact: true })).toBeVisible();
  expect(await childTitles(extensionWorker, seeded.folderId)).toEqual(['Toast 01', 'Toast 02']);
});

test("a deletion toast's Undo after Ctrl/Cmd+Z says it was already undone (L30)", async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Toast Twice', links('Twice', 2));
  await page.goto(managerUrl(extensionId, seeded.folderId));
  await row(page, 'Twice 01').getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect.poll(() => childTitles(extensionWorker, seeded.folderId)).toEqual(['Twice 02']);

  await page.locator('tbody tr').first().focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(
    toastRegion(page).getByText('✓ Undone: Delete "Twice 01"', { exact: true }),
  ).toBeVisible();
  await toastRegion(page).getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(toastRegion(page).getByText('Already undone', { exact: true })).toBeVisible();
  // Restored once, not twice.
  expect(await childTitles(extensionWorker, seeded.folderId)).toEqual(['Twice 01', 'Twice 02']);
  await expect(toastRegion(page).getByText('Deletion undone', { exact: true })).toHaveCount(0);
});
