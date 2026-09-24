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
      const folder = await chrome.bookmarks.create({ parentId: writableRoot.id, title: folderTitle });
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
