import type { Page, Worker } from '@playwright/test';
import { expect, test } from './fixtures';

type SeedItem = { title: string; url?: string; children?: SeedItem[] };

const SETTINGS_KEY = 'bookmark-scout-settings';

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

async function openRowMenu(page: Page, title: string) {
  await row(page, title).getByRole('button', { name: 'Open menu' }).click();
  await expect(page.getByRole('menu')).toBeVisible();
}

test.use({ viewport: { width: 1400, height: 900 } });

test('bulk delete and move only touch selected rows visible under the filters', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await updateSettings(extensionWorker, { confirmBeforeDelete: true });
  const seeded = await seedFolder(extensionWorker, 'E2E Hidden Selection', [
    { title: 'Move Here', children: [] },
    { title: 'Keep me', url: 'https://keep.example.com/' },
    { title: 'Also keep', url: 'https://also.example.com/' },
    { title: 'Target X', url: 'https://target-x.example.com/' },
    { title: 'Target Y', url: 'https://target-y.example.com/' },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  const bulk = page.getByTestId('bulk-actions');

  await page.getByRole('checkbox', { name: 'Select all' }).check();
  await expect(bulk).toContainText('5 selected');
  await page.getByPlaceholder('Filter titles...').fill('Target X');
  await expect(page.locator('tbody tr')).toHaveCount(1);

  // Toolbar, footer, and the confirmation all count the one visible row.
  await expect(bulk).toContainText('1 selected');
  await expect(page.getByTestId('bulk-hidden-selection')).toHaveText(
    '(4 more hidden by filters, not included)',
  );
  await expect(page.getByText('1 of 1 row(s) selected.', { exact: true })).toBeVisible();
  await bulk.getByRole('button', { name: 'Delete' }).click();
  const confirm = page.getByRole('dialog');
  await expect(confirm).toContainText('Delete bookmark');
  await expect(confirm).toContainText('Target X');
  await confirm.getByRole('button', { name: 'Delete bookmark' }).click();
  await expect
    .poll(() => childTitles(extensionWorker, seeded.folderId))
    .toEqual(['Move Here', 'Keep me', 'Also keep', 'Target Y']);
  await expect(bulk).toHaveCount(0);

  // Bulk move behaves the same way: only the visible selected row moves.
  await page.getByPlaceholder('Filter titles...').fill('');
  await page.getByRole('checkbox', { name: 'Select "Keep me"' }).check();
  await page.getByRole('checkbox', { name: 'Select "Target Y"' }).check();
  await page.getByPlaceholder('Filter titles...').fill('Target Y');
  await expect(bulk).toContainText('1 selected');
  await bulk.getByRole('button', { name: 'Move to folder' }).click();
  const moveDialog = page.getByRole('dialog', { name: /^Move 1 item/ });
  await moveDialog.getByRole('combobox').click();
  await page.getByRole('option', { name: /E2E Hidden Selection \/ Move Here$/ }).click();
  await moveDialog.getByRole('button', { name: 'Move to folder' }).click();
  await expect
    .poll(() => childTitles(extensionWorker, seeded.ids['Move Here']))
    .toEqual(['Target Y']);
  await expect
    .poll(() => childTitles(extensionWorker, seeded.folderId))
    .toEqual(['Move Here', 'Keep me', 'Also keep']);
});

test('bookmarklets can be renamed while new script and HTML data URLs are rejected', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Bookmarklet Edit', [
    { title: 'My Bookmarklet', url: 'javascript:void(0)' },
    { title: 'Plain Link', url: 'https://example.com/plain' },
  ]);
  const getNode = (id: string) =>
    extensionWorker.evaluate(async (nodeId) => {
      const [node] = await chrome.bookmarks.get(nodeId);
      return { title: node.title, url: node.url };
    }, id);
  await page.goto(managerUrl(extensionId, seeded.folderId));

  // Renaming leaves the existing javascript: URL untouched.
  await openRowMenu(page, 'My Bookmarklet');
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  let dialog = page.getByRole('dialog', { name: 'Edit bookmark' });
  await dialog.getByLabel('Name').fill('Renamed Bookmarklet');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(() => getNode(seeded.ids['My Bookmarklet']))
    .toEqual({ title: 'Renamed Bookmarklet', url: 'javascript:void(0)' });

  await openRowMenu(page, 'Plain Link');
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  dialog = page.getByRole('dialog', { name: 'Edit bookmark' });
  const url = dialog.getByLabel('URL');
  const error = dialog.locator('#bookmark-edit-url-error');
  await url.fill('vbscript:msgbox(1)');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(error).toHaveText(
    'Script URLs (vbscript:) cannot be saved here. Existing bookmarklets can still be renamed.',
  );
  await url.fill('data:text/html,<script>alert(1)</script>');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(error).toHaveText(
    'data: URLs that open as a web page (data:text/html) cannot be saved here.',
  );
  await expect
    .poll(() => getNode(seeded.ids['Plain Link']))
    .toEqual({ title: 'Plain Link', url: 'https://example.com/plain' });

  await url.fill('data:text/plain,hello');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(() => getNode(seeded.ids['Plain Link']))
    .toEqual({ title: 'Plain Link', url: 'data:text/plain,hello' });
});

test('every default column fits at 1400 wide and move buttons do not reserve width', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Column Fit / A rather long folder name', [
    { title: 'Nested Folder With A Long Name', children: [] },
    {
      title: 'BBC News - Home page with a rather long title that keeps going and going',
      url: 'https://www.bbc.co.uk/news/world-europe-12345678?utm_source=feed&utm_medium=rss&x=1',
    },
    { title: 'Short', url: 'https://example.com/' },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  await expect(page.locator('tbody tr')).toHaveCount(3);

  const layout = await page.locator('table').evaluate((table) => {
    const wrapper = table.parentElement as HTMLElement;
    const headers = [...table.querySelectorAll('thead th')];
    const dateAdded = headers.find((th) => th.textContent?.includes('Date Added'));
    const actions = headers[headers.length - 1];
    return {
      overflow: table.scrollWidth - wrapper.clientWidth,
      dateAddedRight: dateAdded?.getBoundingClientRect().right ?? Number.POSITIVE_INFINITY,
      actionsLeft: actions.getBoundingClientRect().left,
      actionsWidth: actions.getBoundingClientRect().width,
    };
  });
  expect(layout.overflow).toBeLessThanOrEqual(0);
  expect(layout.dateAddedRight).toBeLessThanOrEqual(layout.actionsLeft + 1);
  expect(layout.actionsWidth).toBeLessThan(80);

  // Hover still reveals the move buttons as an overlay.
  await page.getByRole('button', { name: 'Browser order' }).click();
  const shortRow = row(page, 'Short');
  await shortRow.hover();
  await expect(shortRow.getByRole('button', { name: 'Move up' })).toBeVisible();
});

test('move buttons are disabled at the ends of the folder', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Edge Moves', [
    { title: 'Edge First', url: 'https://example.com/first' },
    { title: 'Edge Middle', url: 'https://example.com/middle' },
    { title: 'Edge Last', url: 'https://example.com/last' },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  await page.getByRole('button', { name: 'Browser order' }).click();

  const first = row(page, 'Edge First');
  await first.hover();
  await expect(first.getByRole('button', { name: 'Move to top' })).toBeDisabled();
  await expect(first.getByRole('button', { name: 'Move up' })).toBeDisabled();
  await expect(first.getByRole('button', { name: 'Move down' })).toBeEnabled();
  await expect(first.getByRole('button', { name: 'Move to bottom' })).toBeEnabled();

  const last = row(page, 'Edge Last');
  await last.hover();
  await expect(last.getByRole('button', { name: 'Move down' })).toBeDisabled();
  await expect(last.getByRole('button', { name: 'Move to bottom' })).toBeDisabled();
  await expect(last.getByRole('button', { name: 'Move up' })).toBeEnabled();

  const middle = row(page, 'Edge Middle');
  await middle.hover();
  await middle.getByRole('button', { name: 'Move to top' }).click();
  await expect
    .poll(() => childTitles(extensionWorker, seeded.folderId))
    .toEqual(['Edge Middle', 'Edge First', 'Edge Last']);
  // The row that is now first loses its upward moves.
  const moved = row(page, 'Edge Middle');
  await moved.hover();
  await expect(moved.getByRole('button', { name: 'Move up' })).toBeDisabled();
  await expect(row(page, 'Edge First').getByRole('button', { name: 'Move up' })).toBeEnabled();
});

test('cancelling a bulk delete keeps the selection and the confirmation lists the items', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await updateSettings(extensionWorker, { confirmBeforeDelete: true });
  const seeded = await seedFolder(extensionWorker, 'E2E Cancel Keeps Selection', [
    { title: 'Cancel A', url: 'https://example.com/a' },
    { title: 'Cancel B', url: 'https://example.com/b' },
    { title: 'Cancel C', url: 'https://example.com/c' },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  const bulk = page.getByTestId('bulk-actions');

  await page.getByRole('checkbox', { name: 'Select "Cancel A"' }).check();
  await page.getByRole('checkbox', { name: 'Select "Cancel B"' }).check();
  await bulk.getByRole('button', { name: 'Delete' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete 2 items' });
  await expect(confirm.getByTestId('bulk-item-preview')).toHaveText(/Cancel A.*Cancel B/);
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toHaveCount(0);

  await expect(bulk).toContainText('2 selected');
  await expect(page.getByRole('checkbox', { name: 'Select "Cancel A"' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Select "Cancel B"' })).toBeChecked();
  expect(await childTitles(extensionWorker, seeded.folderId)).toEqual([
    'Cancel A',
    'Cancel B',
    'Cancel C',
  ]);

  await bulk.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete 2 items' }).click();
  await expect.poll(() => childTitles(extensionWorker, seeded.folderId)).toEqual(['Cancel C']);
  await expect(bulk).toHaveCount(0);
});

/** Converts any CSS color the browser understands (oklch, hsl, ...) to sRGB channels. */
async function contrastOf(page: Page, selector: string) {
  return page
    .locator(selector)
    .first()
    .evaluate((element) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('No canvas context');
      const toRgb = (color: string) => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        return [...context.getImageData(0, 0, 1, 1).data];
      };
      const luminance = ([r, g, b]: number[]) => {
        const [lr, lg, lb] = [r, g, b].map((value) => {
          const channel = value / 255;
          return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
      };
      let background: number[] | undefined;
      for (let node: Element | null = element; node && !background; node = node.parentElement) {
        const rgba = toRgb(getComputedStyle(node).backgroundColor);
        if (rgba[3] === 255) background = rgba;
      }
      const foreground = toRgb(getComputedStyle(element).color);
      const [light, dark] = [luminance(foreground), luminance(background ?? [0, 0, 0])].sort(
        (left, right) => right - left,
      );
      return (light + 0.05) / (dark + 0.05);
    });
}

test('delete controls stay readable in dark mode', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await updateSettings(extensionWorker, { theme: 'dark' });
  const seeded = await seedFolder(extensionWorker, 'E2E Dark Delete', [
    { title: 'Dark Row', url: 'https://example.com/dark' },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  await expect(page.locator('html')).toHaveClass(/dark/);

  await page.getByRole('checkbox', { name: 'Select "Dark Row"' }).check();
  const bulkDelete = '[data-testid="bulk-actions"] button:has-text("Delete")';
  expect(await contrastOf(page, bulkDelete)).toBeGreaterThanOrEqual(4.5);

  await openRowMenu(page, 'Dark Row');
  expect(await contrastOf(page, '[role="menuitem"]:has-text("Delete")')).toBeGreaterThanOrEqual(
    4.5,
  );
});

test('bulk move explains nested items, names them, and skips their current folder', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Bulk Wording', [
    {
      title: 'Wording Parent',
      children: [{ title: 'Wording Child', url: 'https://example.com/child' }],
    },
    { title: 'Wording Target', children: [] },
    { title: 'Wording Link', url: 'https://example.com/link' },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  const bulk = page.getByTestId('bulk-actions');

  // A folder and an item inside it: only the folder moves, and the dialog says why.
  await page.getByPlaceholder('Filter titles...').fill('Wording');
  await page.getByRole('checkbox', { name: 'Select "Wording Parent"' }).check();
  await page.getByRole('checkbox', { name: 'Select "Wording Child"' }).check();
  await expect(bulk).toContainText('2 selected');
  await bulk.getByRole('button', { name: 'Move to folder' }).click();
  let dialog = page.getByRole('dialog', { name: 'Move 1 item' });
  await expect(dialog.getByTestId('bulk-item-preview')).toHaveText('Wording Parent');
  await expect(dialog.getByTestId('bulk-nested-note')).toHaveText(
    '1 other selected item(s) are inside a selected folder and move with it.',
  );
  await dialog.getByRole('combobox').click();
  // The folder the items are already in is not offered.
  await expect(
    page.getByRole('option', { name: /E2E Bulk Wording \/ Wording Target$/ }),
  ).toBeVisible();
  await expect(page.getByRole('option', { name: /E2E Bulk Wording$/ })).toHaveCount(0);
  await page.getByRole('option', { name: /E2E Bulk Wording \/ Wording Target$/ }).click();
  await dialog.getByRole('button', { name: 'Move to folder' }).click();
  await expect(page.getByText('✓ Moved 1 item', { exact: true })).toBeVisible();
  await expect
    .poll(() => childTitles(extensionWorker, seeded.ids['Wording Target']))
    .toEqual(['Wording Parent']);
  expect(await childTitles(extensionWorker, seeded.ids['Wording Parent'])).toEqual([
    'Wording Child',
  ]);

  await page.getByPlaceholder('Filter titles...').fill('');
  await page.getByRole('checkbox', { name: 'Select "Wording Link"' }).check();
  await page.getByRole('checkbox', { name: 'Select "Wording Target"' }).check();
  await bulk.getByRole('button', { name: 'Move to folder' }).click();
  dialog = page.getByRole('dialog', { name: 'Move 2 items' });
  await expect(dialog.getByTestId('bulk-item-preview')).toContainText('Wording Link');
  await expect(dialog.getByTestId('bulk-nested-note')).toHaveCount(0);
});

test('narrow windows keep one sidebar open so the table has room', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 700 });
  const seeded = await seedFolder(extensionWorker, 'E2E Narrow Sidebars', [
    { title: 'Narrow Row', url: 'https://example.com/narrow' },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  const folders = page.getByTestId('folder-sidebar');
  const tools = page.getByTestId('tools-sidebar');
  await expect(folders).not.toHaveAttribute('inert', '');

  await page.getByTitle('Show tools').click();
  await expect(tools).not.toHaveAttribute('inert', '');
  await expect(folders).toHaveAttribute('inert', '');
  await expect
    .poll(() => page.locator('main').evaluate((main) => main.getBoundingClientRect().width))
    .toBeGreaterThan(550);

  await page.getByTitle('Show folders').click();
  await expect(folders).not.toHaveAttribute('inert', '');
  await expect(tools).toHaveAttribute('inert', '');

  // Wide windows still allow both.
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.getByTitle('Show tools').click();
  await expect(tools).not.toHaveAttribute('inert', '');
  await expect(folders).not.toHaveAttribute('inert', '');
});

test('type labels stay on one line in Japanese at 1400 wide', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await updateSettings(extensionWorker, { language: 'ja' });
  const seeded = await seedFolder(extensionWorker, 'E2E Ja Type', [
    { title: 'Ja Folder', children: [] },
    { title: 'Ja Link', url: 'https://example.com/ja' },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  const label = row(page, 'Ja Link').getByText('リンク', { exact: true });
  await expect(label).toBeVisible();
  expect(await label.evaluate((element) => element.getClientRects().length)).toBe(1);
  const lineHeight = await label.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).lineHeight),
  );
  expect((await label.boundingBox())?.height ?? Number.POSITIVE_INFINITY).toBeLessThan(
    lineHeight * 1.5,
  );
});

test('undoing single deletions out of order restores the original order', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await updateSettings(extensionWorker, { confirmBeforeDelete: false });
  const titles = ['Order A', 'Order B', 'Order C', 'Order D'];
  const seeded = await seedFolder(
    extensionWorker,
    'E2E Undo Order',
    titles.map((title) => ({ title, url: `https://example.com/${title.replace(' ', '-')}` })),
  );
  await page.goto(managerUrl(extensionId, seeded.folderId));

  for (const title of ['Order A', 'Order B', 'Order C']) {
    await openRowMenu(page, title);
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await expect(row(page, title)).toHaveCount(0);
  }
  await expect.poll(() => childTitles(extensionWorker, seeded.folderId)).toEqual(['Order D']);

  const undo = (title: string) =>
    page
      .locator('ol > li')
      .filter({ hasText: `Deleted "${title}". Undo within 10 seconds.` })
      .getByRole('button', { name: 'Undo', exact: true })
      .click();
  await undo('Order B');
  await expect
    .poll(() => childTitles(extensionWorker, seeded.folderId))
    .toEqual(['Order B', 'Order D']);
  await undo('Order C');
  await undo('Order A');
  await expect.poll(() => childTitles(extensionWorker, seeded.folderId)).toEqual(titles);
});

test('Back returns to the table page that was open', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Back Page', [
    {
      title: 'Back Sub Folder',
      children: [{ title: 'Back Child', url: 'https://example.com/child' }],
    },
    ...Array.from({ length: 11 }, (_, index) => ({
      title: `Back Item ${String(index + 1).padStart(2, '0')}`,
      url: `https://example.com/back/${index + 1}`,
    })),
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  await expect(page.getByText('Page 1 of 2')).toBeVisible();
  await page.getByRole('button', { name: 'Go to next page' }).click();
  await expect(page.getByText('Page 2 of 2')).toBeVisible();

  await page
    .getByTestId('folder-tree')
    .getByRole('button', { name: 'Back Sub Folder', exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`id=${seeded.ids['Back Sub Folder']}$`));
  await expect(page.getByText('Page 1 of 1')).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`id=${seeded.folderId}$`));
  await expect(page.getByText('Page 2 of 2')).toBeVisible();

  // Going forward opens the subfolder on its own first page again.
  await page.goForward();
  await expect(page.getByText('Page 1 of 1')).toBeVisible();
});
