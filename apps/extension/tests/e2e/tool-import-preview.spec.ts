import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Locator, Page, Worker } from '@playwright/test';
import { expect, test, toastRegion } from './fixtures';
import { openTools, seedFolder } from './tool-helpers';

const fixturesDirectory = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'import-fixtures',
);
const HTML_FIXTURE = path.join(fixturesDirectory, 'conflicts.html');
const JSON_FIXTURE = path.join(fixturesDirectory, 'conflicts.json');

type TreeShape = { title: string; url?: string; children?: TreeShape[] };

/** The folder's contents as titles, URLs, and nesting, read from chrome.bookmarks. */
async function subtreeOf(worker: Worker, folderId: string): Promise<TreeShape[]> {
  return worker.evaluate(async (id) => {
    const [folder] = await chrome.bookmarks.getSubTree(id);
    const shape = (node: chrome.bookmarks.BookmarkTreeNode): TreeShape =>
      node.url
        ? { title: node.title, url: node.url }
        : { title: node.title, children: (node.children ?? []).map(shape) };
    return (folder.children ?? []).map(shape);
  }, folderId);
}

async function wholeTree(worker: Worker): Promise<string> {
  return worker.evaluate(async () => JSON.stringify(await chrome.bookmarks.getTree()));
}

async function folderPath(worker: Worker, folderId: string): Promise<string> {
  return worker.evaluate(async (id) => {
    const titles: string[] = [];
    let current: string | undefined = id;
    while (current) {
      const [node] = await chrome.bookmarks.get(current);
      if (!node.parentId) break;
      titles.unshift(node.title);
      current = node.parentId;
    }
    return titles.join(' / ');
  }, folderId);
}

/** Target holds "Existing"; another folder holds "Elsewhere". */
async function seedConflicts(worker: Worker) {
  const target = await seedFolder(worker, 'E2E Import Target', [
    { title: 'Existing', url: 'https://e2e.invalid/existing' },
  ]);
  const elsewhere = await seedFolder(worker, 'E2E Elsewhere', [
    { title: 'Elsewhere', url: 'https://e2e.invalid/elsewhere' },
  ]);
  return { targetId: target.folderId, elsewhereId: elsewhere.folderId };
}

async function openPreview(page: Page, file: string): Promise<Locator> {
  await page.locator('#bookmark-import-input').setInputFiles(file);
  const dialog = page.getByRole('dialog', { name: 'Import preview' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function expectSummary(dialog: Locator, lines: string[]) {
  const summary = dialog.getByTestId('import-preview-summary');
  for (const line of lines) {
    await expect(summary.getByText(line, { exact: true })).toBeVisible();
  }
}

async function chooseStrategy(page: Page, dialog: Locator, label: string) {
  await dialog.getByRole('combobox', { name: 'Duplicates' }).click();
  await page.getByRole('option', { name: label, exact: true }).click();
}

const researchWithoutDuplicates: TreeShape = {
  title: 'Research',
  children: [
    { title: 'Deep', children: [{ title: 'Deep link', url: 'https://e2e.invalid/deep' }] },
  ],
};

test('import preview reports the exact target, counts, and duplicates, and cancel changes nothing', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const { targetId } = await seedConflicts(extensionWorker);
  await openTools(page, extensionId, targetId);
  const before = await wholeTree(extensionWorker);

  const dialog = await openPreview(page, HTML_FIXTURE);
  await expect(dialog).toContainText('conflicts.html');
  await expectSummary(dialog, [
    `Target folder: ${await folderPath(extensionWorker, targetId)}`,
    'Bookmarks to create: 2',
    'Folders to create: 2',
    'Items to skip: 3',
  ]);
  await expect(dialog.getByRole('combobox', { name: 'Import into' })).toContainText(
    'E2E Import Target',
  );
  const conflicts = dialog.getByTestId('import-preview-conflicts');
  await expect(
    conflicts.getByText(
      'Already exists: 1 in the target folder, 1 elsewhere, 1 repeated in this file',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(conflicts.getByRole('listitem')).toHaveCount(3);
  await expect(conflicts.getByRole('listitem').filter({ hasText: 'Existing again' })).toContainText(
    'In target folder',
  );

  // Changing the strategy is still only a preview.
  await chooseStrategy(page, dialog, 'Import everything, including duplicates');
  await expectSummary(dialog, ['Bookmarks to create: 5', 'Items to skip: 0']);
  expect(await wholeTree(extensionWorker)).toBe(before);

  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  expect(await wholeTree(extensionWorker)).toBe(before);
});

test('applying with "skip anywhere" creates only new items and prunes emptied folders', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const { targetId } = await seedConflicts(extensionWorker);
  await openTools(page, extensionId, targetId);
  const dialog = await openPreview(page, HTML_FIXTURE);
  await dialog.getByRole('button', { name: 'Import', exact: true }).click();

  await expect(dialog).toBeHidden();
  await expect(toastRegion(page).getByText('✓ Import Complete', { exact: true })).toBeVisible();
  await expect(
    toastRegion(page).getByText(
      'Bookmarks created: 2. Folders created: 2. Skipped: 3. Failed: 0.',
      { exact: true },
    ),
  ).toBeVisible();
  expect(await subtreeOf(extensionWorker, targetId)).toEqual([
    { title: 'Existing', url: 'https://e2e.invalid/existing' },
    { title: 'Fresh', url: 'https://e2e.invalid/fresh' },
    researchWithoutDuplicates,
  ]);
});

test('applying with "skip in target" keeps bookmarks that only exist in other folders', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const { targetId, elsewhereId } = await seedConflicts(extensionWorker);
  await openTools(page, extensionId, targetId);
  const dialog = await openPreview(page, HTML_FIXTURE);
  await chooseStrategy(page, dialog, 'Skip bookmarks already in the target folder');
  await expectSummary(dialog, [
    'Bookmarks to create: 3',
    'Folders to create: 2',
    'Items to skip: 2',
  ]);
  await dialog.getByRole('button', { name: 'Import', exact: true }).click();

  await expect(dialog).toBeHidden();
  expect(await subtreeOf(extensionWorker, targetId)).toEqual([
    { title: 'Existing', url: 'https://e2e.invalid/existing' },
    { title: 'Fresh', url: 'https://e2e.invalid/fresh' },
    {
      title: 'Research',
      children: [
        { title: 'Elsewhere again', url: 'https://e2e.invalid/elsewhere' },
        { title: 'Deep', children: [{ title: 'Deep link', url: 'https://e2e.invalid/deep' }] },
      ],
    },
  ]);
  expect(await subtreeOf(extensionWorker, elsewhereId)).toEqual([
    { title: 'Elsewhere', url: 'https://e2e.invalid/elsewhere' },
  ]);
});

test('applying with "import everything" creates the file exactly, duplicates included', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const { targetId } = await seedConflicts(extensionWorker);
  await openTools(page, extensionId, targetId);
  const dialog = await openPreview(page, HTML_FIXTURE);
  await chooseStrategy(page, dialog, 'Import everything, including duplicates');
  await dialog.getByRole('button', { name: 'Import', exact: true }).click();

  await expect(dialog).toBeHidden();
  expect(await subtreeOf(extensionWorker, targetId)).toEqual([
    { title: 'Existing', url: 'https://e2e.invalid/existing' },
    { title: 'Existing again', url: 'https://e2e.invalid/existing' },
    { title: 'Fresh', url: 'https://e2e.invalid/fresh' },
    {
      title: 'Research',
      children: [
        { title: 'Elsewhere again', url: 'https://e2e.invalid/elsewhere' },
        {
          title: 'Deep',
          children: [
            { title: 'Deep link', url: 'https://e2e.invalid/deep' },
            { title: 'Fresh repeat', url: 'https://e2e.invalid/fresh' },
          ],
        },
      ],
    },
  ]);
});

test('a JSON import can target another folder and be undone', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const { targetId, elsewhereId } = await seedConflicts(extensionWorker);
  await openTools(page, extensionId, targetId);
  const dialog = await openPreview(page, JSON_FIXTURE);
  await dialog.getByRole('combobox', { name: 'Import into' }).click();
  await page
    .getByRole('option', { name: await folderPath(extensionWorker, elsewhereId), exact: true })
    .click();
  await expectSummary(dialog, [
    `Target folder: ${await folderPath(extensionWorker, elsewhereId)}`,
    'Bookmarks to create: 2',
    'Folders to create: 2',
    'Items to skip: 3',
    'Invalid entries ignored: 1',
  ]);
  const targetBefore = await subtreeOf(extensionWorker, targetId);
  await dialog.getByRole('button', { name: 'Import', exact: true }).click();

  await expect(dialog).toBeHidden();
  expect(await subtreeOf(extensionWorker, elsewhereId)).toEqual([
    { title: 'Elsewhere', url: 'https://e2e.invalid/elsewhere' },
    { title: 'Fresh', url: 'https://e2e.invalid/fresh' },
    researchWithoutDuplicates,
  ]);
  expect(await subtreeOf(extensionWorker, targetId)).toEqual(targetBefore);

  await toastRegion(page).getByRole('button', { name: 'Undo' }).click();
  await expect(toastRegion(page).getByText('✓ Import undone', { exact: true })).toBeVisible();
  expect(await subtreeOf(extensionWorker, elsewhereId)).toEqual([
    { title: 'Elsewhere', url: 'https://e2e.invalid/elsewhere' },
  ]);
});

test('a preview made stale by a bookmark change is refreshed instead of applied', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const { targetId, elsewhereId } = await seedConflicts(extensionWorker);
  await openTools(page, extensionId, targetId);
  const dialog = await openPreview(page, HTML_FIXTURE);
  await expectSummary(dialog, ['Bookmarks to create: 2']);

  await extensionWorker.evaluate(
    (parentId) =>
      chrome.bookmarks.create({ parentId, title: 'Fresh', url: 'https://e2e.invalid/fresh' }),
    elsewhereId,
  );
  await dialog.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(
    dialog.getByText(
      'Your bookmarks changed since this preview. Review the updated plan, then import again.',
      { exact: true },
    ),
  ).toBeVisible();
  await expectSummary(dialog, ['Bookmarks to create: 1', 'Items to skip: 4']);
  expect(await subtreeOf(extensionWorker, targetId)).toEqual([
    { title: 'Existing', url: 'https://e2e.invalid/existing' },
  ]);

  await dialog.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(await subtreeOf(extensionWorker, targetId)).toEqual([
    { title: 'Existing', url: 'https://e2e.invalid/existing' },
    researchWithoutDuplicates,
  ]);
});

test('a partial import failure is reported with counts and the errors stay visible', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const { targetId } = await seedConflicts(extensionWorker);
  // A URL can parse and still be rejected by the browser; simulate that for one entry.
  await page.addInitScript(() => {
    const create = chrome.bookmarks.create.bind(chrome.bookmarks);
    Object.defineProperty(chrome.bookmarks, 'create', {
      configurable: true,
      value: (details: chrome.bookmarks.CreateDetails) =>
        details.title === 'Rejected'
          ? Promise.reject(new Error('Rejected by the browser.'))
          : create(details),
    });
  });
  await openTools(page, extensionId, targetId);
  await page.locator('#bookmark-import-input').setInputFiles({
    name: 'partial.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify([
        { title: 'Valid One', url: 'https://e2e.invalid/one' },
        { title: 'Rejected', url: 'https://e2e.invalid/rejected' },
        { title: 'Broken', url: 'not a url' },
        { title: 'Valid Two', url: 'https://e2e.invalid/two' },
        { title: '<img src=x onerror=alert(1)><b>Markup</b>', url: 'https://e2e.invalid/existing' },
      ]),
    ),
  });
  const dialog = page.getByRole('dialog', { name: 'Import preview' });
  // An entry whose URL cannot be stored is caught in the preview, not when importing.
  await expectSummary(dialog, [
    'Bookmarks to create: 3',
    'Items to skip: 1',
    'Invalid entries ignored: 1',
  ]);
  // File titles are data: shown literally, never parsed as markup.
  await expect(
    dialog.getByText('<img src=x onerror=alert(1)><b>Markup</b>', { exact: true }),
  ).toBeVisible();
  await expect(dialog.locator('img, b')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Import', exact: true }).click();

  const outcome = 'Bookmarks created: 2. Folders created: 0. Skipped: 2. Failed: 1.';
  await expect(
    toastRegion(page).getByText('× Some items were not imported', { exact: true }),
  ).toBeVisible();
  await expect(toastRegion(page).getByText(outcome, { exact: true })).toBeVisible();
  const result = dialog.getByTestId('import-result');
  await expect(result.getByText(outcome, { exact: true })).toBeVisible();
  // The failure names the entry, so the user knows which one to fix.
  await expect(result.getByRole('listitem')).toHaveText([
    'Could not import "Rejected": Rejected by the browser.',
  ]);
  expect(await subtreeOf(extensionWorker, targetId)).toEqual([
    { title: 'Existing', url: 'https://e2e.invalid/existing' },
    { title: 'Valid One', url: 'https://e2e.invalid/one' },
    { title: 'Valid Two', url: 'https://e2e.invalid/two' },
  ]);

  await dialog.getByRole('button', { name: 'Undo' }).click();
  await expect(dialog).toBeHidden();
  await expect(toastRegion(page).getByText('✓ Import undone', { exact: true })).toBeVisible();
  expect(await subtreeOf(extensionWorker, targetId)).toEqual([
    { title: 'Existing', url: 'https://e2e.invalid/existing' },
  ]);
});
