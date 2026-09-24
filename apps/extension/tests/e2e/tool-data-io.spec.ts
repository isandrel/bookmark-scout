import { readFile } from 'node:fs/promises';
import { expect, test } from './fixtures';
import { childrenOf, openTools, seedFolder, setSettings, toolCard } from './tool-helpers';

function localDate() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

test('export uses the selected folder and saved preferences, and neutralizes CSV formulas', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'Tracking', [
    { title: '=HYPERLINK("https://evil.invalid","x")', url: 'https://e2e.invalid/formula' },
    { title: 'Nested', children: [{ title: 'Inner Link', url: 'https://e2e.invalid/inner' }] },
  ]);
  await seedFolder(extensionWorker, 'Elsewhere', [
    { title: 'Outside Link', url: 'https://e2e.invalid/outside' },
  ]);
  await setSettings(extensionWorker, {
    dataDefaultExportFormat: 'csv',
    exportFilenamePrefix: 'backup-',
    exportIncludeDates: false,
    exportIncludeUrls: false,
  });

  await openTools(page, extensionId, folder.folderId);
  const exportCard = toolCard(page, 'Export Bookmarks');
  await expect(exportCard.getByRole('combobox', { name: 'Format' })).toContainText('CSV');
  const downloadPromise = page.waitForEvent('download');
  await exportCard.getByRole('button', { name: 'Export' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`backup-Tracking_${localDate()}.csv`);
  const csv = await readFile(await download.path(), 'utf8');
  expect(csv.split('\n')).toEqual([
    'Title,Folder',
    `"'=HYPERLINK(""https://evil.invalid"",""x"")",Tracking`,
    'Inner Link,Tracking/Nested',
  ]);
  expect(csv).not.toContain('Outside Link');
});

test('an all-bookmarks JSON export has no nameless wrapper and re-imports without an extra level', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'E2E Round Trip', [
    { title: 'Round Trip Link', url: 'https://e2e.invalid/round-trip' },
  ]);
  await setSettings(extensionWorker, { dataDefaultExportFormat: 'json', exportJsonIndentSize: 4 });

  await openTools(page, extensionId, folder.folderId);
  const exportCard = toolCard(page, 'Export Bookmarks');
  await exportCard.getByRole('combobox').nth(1).click();
  await page.getByRole('option', { name: 'All Bookmarks' }).click();
  const downloadPromise = page.waitForEvent('download');
  await exportCard.getByRole('button', { name: 'Export' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/_all_\d{4}-\d{2}-\d{2}\.json$/);
  const raw = await readFile(await download.path(), 'utf8');
  expect(raw).toContain('\n    "title"');
  const exported = JSON.parse(raw) as { children: Array<{ title: string }> };
  expect(exported.children.every((node) => node.title !== '')).toBe(true);
  expect(raw).not.toContain('"title": ""');

  const target = await seedFolder(extensionWorker, 'E2E Import Target', []);
  await openTools(page, extensionId, target.folderId);
  await page.locator('#bookmark-import-input').setInputFiles({
    name: 'round-trip.json',
    mimeType: 'application/json',
    buffer: Buffer.from(raw),
  });
  await expect(page.getByText('Import Complete', { exact: true })).toBeVisible();
  const topLevel = (await childrenOf(extensionWorker, target.folderId)).map((item) => item.title);
  expect(topLevel).toEqual(exported.children.map((node) => node.title));
  expect(topLevel).not.toContain('Untitled');
  expect(topLevel).not.toContain('Untitled Folder');
});

test('import reports empty files as failures and partial JSON imports with counts', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'E2E Import Report', []);
  await openTools(page, extensionId, folder.folderId);
  const input = page.locator('#bookmark-import-input');

  await input.setInputFiles({
    name: 'not-bookmarks.html',
    mimeType: 'text/html',
    buffer: Buffer.from('Just some plain text, no bookmarks here.'),
  });
  await expect(
    page.getByText('No bookmarks or folders were found in this file.', { exact: false }),
  ).toBeVisible();
  expect(await childrenOf(extensionWorker, folder.folderId)).toEqual([]);

  await input.setInputFiles({
    name: 'partial.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify([
        { title: 'Valid One', url: 'https://e2e.invalid/one' },
        7,
        { title: 'Bad Scheme', url: 'javascript:alert(1)' },
        { title: 'Valid Two', url: 'https://e2e.invalid/two' },
      ]),
    ),
  });
  await expect(page.getByText('Some items were not imported', { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Bookmarks imported: \d\. Folders imported: 0\. Not imported: \d\./),
  ).toBeVisible();
  const titles = (await childrenOf(extensionWorker, folder.folderId)).map((item) => item.title);
  expect(titles).toEqual(expect.arrayContaining(['Valid One', 'Valid Two']));
});

test('export and import cards follow their visibility settings without changing bookmarks', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'E2E Data Visibility', [
    { title: 'Visibility Link', url: 'https://e2e.invalid/visibility' },
  ]);
  await openTools(page, extensionId, folder.folderId);
  await expect(toolCard(page, 'Export Bookmarks')).toBeVisible();
  await expect(toolCard(page, 'Import Bookmarks')).toBeVisible();

  await setSettings(extensionWorker, { dataShowExport: false });
  await expect(toolCard(page, 'Export Bookmarks')).toHaveCount(0);
  await expect(toolCard(page, 'Import Bookmarks')).toBeVisible();

  await setSettings(extensionWorker, { dataShowImport: false });
  await expect(toolCard(page, 'Import Bookmarks')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Data', exact: true })).toHaveCount(0);

  await setSettings(extensionWorker, { dataShowExport: true });
  await expect(toolCard(page, 'Export Bookmarks')).toBeVisible();
  expect(await childrenOf(extensionWorker, folder.folderId)).toHaveLength(1);
});
