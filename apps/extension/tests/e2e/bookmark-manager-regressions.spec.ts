/**
 * Manager regressions found by exploratory QA: page scrolling, selection order, stale delete
 * confirmations, pagination text, the select-all dash, focus after navigation, breadcrumbs,
 * columns hidden for space, and edit validation.
 */
import type { Page, Worker } from '@playwright/test';
import { expect, test, toastRegion } from './fixtures';

type SeedItem = { title: string; url?: string; children?: SeedItem[] };

const SETTINGS_KEY = 'bookmark-scout-settings';
const TABLE_VIEW_KEY = 'bookmark-scout-table-view';

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
      const folder = await chrome.bookmarks.create({
        parentId: writableRoot.id,
        title: folderTitle,
      });
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

function childTitles(worker: Worker, folderId: string) {
  return worker.evaluate(
    async (id) => (await chrome.bookmarks.getChildren(id)).map((child) => child.title),
    folderId,
  );
}

function managerUrl(extensionId: string, folderId?: string) {
  const base = `chrome-extension://${extensionId}/bookmarks.html`;
  return folderId ? `${base}?id=${folderId}` : base;
}

function row(page: Page, title: string) {
  return page.locator('tbody tr').filter({ hasText: title });
}

function selectBox(page: Page, title: string) {
  return page.getByRole('checkbox', { name: `Select "${title}"` });
}

/** Text of the table row that holds keyboard focus, or the focused element's tag outside rows. */
function focusedRowText(page: Page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    return active?.closest('tr')?.textContent ?? active?.tagName ?? '';
  });
}

test.use({ viewport: { width: 1400, height: 900 } });

test('a long page scrolls inside the manager, never the page itself', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await extensionWorker.evaluate(
    (key) => chrome.storage.sync.set({ [key]: { version: 1, pageSize: 50 } }),
    TABLE_VIEW_KEY,
  );
  const seeded = await seedFolder(
    extensionWorker,
    'E2E Tall Page',
    Array.from({ length: 50 }, (_, index) => ({
      title: `Tall ${String(index + 1).padStart(2, '0')}`,
      url: `https://example.com/tall/${index + 1}`,
    })),
  );
  await page.goto(managerUrl(extensionId, seeded.folderId));
  await expect(page.locator('tbody tr')).toHaveCount(50);

  // Screen-reader-only labels once stretched the document far below the window.
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight))
    .toBe(0);
  await page.mouse.move(800, 500);
  for (let step = 0; step < 10; step += 1) await page.mouse.wheel(0, 800);
  await expect(page.getByRole('button', { name: 'Go to last page' })).toBeInViewport();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByTestId('breadcrumb')).toBeInViewport();
});

test('bulk move and its preview keep the order the table shows', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  // Created out of title order, so bookmark IDs ascend in a different order than the titles.
  const seeded = await seedFolder(extensionWorker, 'E2E Order Source', [
    { title: 'Order C', url: 'https://example.com/c' },
    { title: 'Order A', url: 'https://example.com/a' },
    { title: 'Order B', url: 'https://example.com/b' },
  ]);
  const target = await seedFolder(extensionWorker, 'E2E Order Target', []);
  await page.goto(managerUrl(extensionId, seeded.folderId));

  await page.getByRole('button', { name: 'Title', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Asc' }).click();
  await expect(page.locator('tbody tr')).toHaveText([/Order A/, /Order B/, /Order C/]);
  for (const title of ['Order C', 'Order A', 'Order B']) await selectBox(page, title).check();

  const bulk = page.getByTestId('bulk-actions');
  await bulk.getByRole('button', { name: 'Move to folder' }).click();
  const dialog = page.getByRole('dialog', { name: 'Move 3 items' });
  await expect(dialog.getByTestId('bulk-item-preview').locator('li')).toHaveText([
    'Order A',
    'Order B',
    'Order C',
  ]);
  await dialog.getByRole('combobox').click();
  await page.getByRole('option', { name: /E2E Order Target$/ }).click();
  await dialog.getByRole('button', { name: 'Move to folder' }).click();

  await expect
    .poll(() => childTitles(extensionWorker, target.folderId))
    .toEqual(['Order A', 'Order B', 'Order C']);
});

test('an open delete confirmation follows bookmarks deleted or renamed elsewhere', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await updateSettings(extensionWorker, { confirmBeforeDelete: true });
  const seeded = await seedFolder(extensionWorker, 'E2E Stale Confirmation', [
    { title: 'Stale A', url: 'https://example.com/a' },
    { title: 'Stale B', url: 'https://example.com/b' },
    { title: 'Stale C', url: 'https://example.com/c' },
    { title: 'Stale D', url: 'https://example.com/d' },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  const bulk = page.getByTestId('bulk-actions');

  for (const title of ['Stale A', 'Stale B', 'Stale C']) await selectBox(page, title).check();
  await bulk.getByRole('button', { name: 'Delete' }).click();
  const preview = page.getByTestId('bulk-item-preview').locator('li');
  await expect(page.getByRole('dialog', { name: 'Delete 3 items' })).toBeVisible();
  await expect(preview).toHaveCount(3);

  // Another window deletes one item and renames another while the confirmation is open.
  await extensionWorker.evaluate(async (ids) => {
    await chrome.bookmarks.remove(ids['Stale B']);
    await chrome.bookmarks.update(ids['Stale C'], { title: 'Stale C renamed' });
  }, seeded.ids);
  const confirm = page.getByRole('dialog', { name: 'Delete 2 items' });
  await expect(confirm).toBeVisible();
  await expect(preview).toHaveCount(2);
  expect((await preview.allTextContents()).sort()).toEqual(['Stale A', 'Stale C renamed']);

  await confirm.getByRole('button', { name: 'Delete 2 items' }).click();
  await expect.poll(() => childTitles(extensionWorker, seeded.folderId)).toEqual(['Stale D']);
  await expect(toastRegion(page).getByText('✓ 2 items deleted', { exact: true })).toBeVisible();
  await expect(bulk).toHaveCount(0);

  // A confirmation whose only item is deleted elsewhere closes; nothing else is deleted.
  await selectBox(page, 'Stale D').check();
  await bulk.getByRole('button', { name: 'Delete' }).click();
  const single = page.getByRole('dialog', { name: 'Delete bookmark' });
  await expect(single).toContainText('Stale D');
  await extensionWorker.evaluate((id) => chrome.bookmarks.remove(id), seeded.ids['Stale D']);
  await expect(single).toHaveCount(0);
  expect(await childTitles(extensionWorker, seeded.folderId)).toEqual([]);
});

test('an empty folder shows one page and a part selection shows a dash', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Pages And Dash', [
    { title: 'Empty Inside', children: [] },
    { title: 'Dash A', url: 'https://example.com/a' },
    { title: 'Dash B', url: 'https://example.com/b' },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  const selectAll = page.getByRole('checkbox', { name: 'Select all' });
  await selectBox(page, 'Dash A').check();
  await expect(selectAll).toHaveAttribute('aria-checked', 'mixed');
  await expect(selectAll.locator('svg.lucide-minus')).toBeVisible();
  await expect(selectAll.locator('svg.lucide-check')).toBeHidden();

  await selectAll.click();
  await expect(selectAll).toHaveAttribute('aria-checked', 'true');
  await expect(selectAll.locator('svg.lucide-check')).toBeVisible();
  await expect(selectAll.locator('svg.lucide-minus')).toBeHidden();

  await page.goto(managerUrl(extensionId, seeded.ids['Empty Inside']));
  await expect(page.getByText('No results.', { exact: true })).toBeVisible();
  await expect(page.getByText('Page 1 of 1', { exact: true })).toBeVisible();
});

test('keyboard folder navigation keeps focus in the table', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Focus Parent', [
    { title: 'Focus Child', children: [{ title: 'Focus Leaf', url: 'https://example.com/leaf' }] },
    { title: 'Focus Sibling', url: 'https://example.com/sibling' },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));

  // Enter opens the folder; focus moves to its first row instead of falling to the page.
  await row(page, 'Focus Child').focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`id=${seeded.ids['Focus Child']}$`));
  await expect.poll(() => focusedRowText(page)).toContain('Focus Leaf');

  // Going up focuses the folder just left.
  await page.keyboard.press('Backspace');
  await expect(page).toHaveURL(new RegExp(`id=${seeded.folderId}$`));
  await expect.poll(() => focusedRowText(page)).toContain('Focus Child');

  await page.keyboard.press('Alt+ArrowUp');
  await expect(page).toHaveURL(new RegExp(`id=${seeded.rootId}$`));
  await expect.poll(() => focusedRowText(page)).toContain('E2E Focus Parent');
});

test('deep breadcrumbs keep the current folder in view', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 800 });
  const long = 'with a really long folder name for the breadcrumb';
  const seeded = await seedFolder(extensionWorker, `E2E Crumb Top ${long}`, [
    {
      title: `Crumb Level 1 ${long}`,
      children: [
        {
          title: `Crumb Level 2 ${long}`,
          children: [{ title: `Crumb Level 3 ${long}`, children: [{ title: 'Crumb Current' }] }],
        },
      ],
    },
  ]);
  await page.goto(managerUrl(extensionId, seeded.ids['Crumb Current']));
  const nav = page.getByTestId('breadcrumb');
  const current = nav.locator('[aria-current="page"]');
  await expect(current).toHaveText('Crumb Current');

  await expect
    .poll(async () => {
      const [navBox, currentBox] = await Promise.all([nav.boundingBox(), current.boundingBox()]);
      if (!navBox || !currentBox) return false;
      return (
        currentBox.x >= navBox.x - 1 &&
        currentBox.x + currentBox.width <= navBox.x + navBox.width + 1
      );
    })
    .toBe(true);
});

test('columns hidden for lack of room keep their chosen state in the view menu', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Space Hidden', [
    { title: 'Space Link', url: 'https://example.com/space' },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  await expect(page.getByRole('columnheader', { name: 'URL' })).toBeVisible();

  await page.getByTitle('Show tools').click();
  await expect(page.getByRole('columnheader', { name: 'URL' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Customize table view' }).click();
  const urlItem = page.getByRole('menuitemcheckbox', { name: 'URL' });
  await expect(urlItem).toBeDisabled();
  await expect(urlItem).toHaveAttribute('aria-checked', 'true');
});

test('edits explain a blank folder name and a URL without a scheme in the dialog', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Edit Checks', [
    { title: 'Named Folder', children: [] },
    { title: 'Checked Link', url: 'https://example.com/checked' },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));

  await row(page, 'Named Folder').getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  let dialog = page.getByRole('dialog', { name: 'Edit folder' });
  await dialog.getByLabel('Name').fill('   ');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByText('Enter a folder name.', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Name')).toHaveAttribute('aria-invalid', 'true');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);

  await row(page, 'Checked Link').getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  dialog = page.getByRole('dialog', { name: 'Edit bookmark' });
  await dialog.getByLabel('URL').fill('example.com/new');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(
    dialog.getByText('Enter a complete URL, including its scheme, such as https://example.com/.', {
      exact: true,
    }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  expect(await childTitles(extensionWorker, seeded.folderId)).toEqual([
    'Named Folder',
    'Checked Link',
  ]);
  const url = await extensionWorker.evaluate(
    async (id) => (await chrome.bookmarks.get(id))[0].url,
    seeded.ids['Checked Link'],
  );
  expect(url).toBe('https://example.com/checked');
});
