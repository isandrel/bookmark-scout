import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { childrenOf, openTools, seedFolder, setSettings, toolCard } from './tool-helpers';

const SECRET_URL = 'https://e2e.invalid/callback?token=e2e-secret-123&page=2';
const EMAIL_URL = 'https://e2e.invalid/invite?user=alice%40example.com#access_token=e2e-frag-456';

function reviewDialog(page: Page) {
  return page.getByRole('dialog', { name: 'Review private data before export' });
}

async function seedSensitiveFolder(extensionWorker: Parameters<typeof seedFolder>[0]) {
  return seedFolder(extensionWorker, 'E2E Private Export', [
    { title: 'Token Callback', url: SECRET_URL },
    { title: 'Invite', url: EMAIL_URL },
    { title: 'Public Page', url: 'https://e2e.invalid/public' },
  ]);
}

const storedUrls = [
  { title: 'Token Callback', url: SECRET_URL },
  { title: 'Invite', url: EMAIL_URL },
  { title: 'Public Page', url: 'https://e2e.invalid/public' },
];

test('bookmark export lists sensitive fields and downloads the original on request', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedSensitiveFolder(extensionWorker);
  await setSettings(extensionWorker, { dataDefaultExportFormat: 'html', exportIncludeDates: false });

  await openTools(page, extensionId, folder.folderId);
  await toolCard(page, 'Export Bookmarks').getByRole('button', { name: 'Export' }).click();

  const dialog = reviewDialog(page);
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText(
      '2 bookmarks in this export contain values that may be private. A redacted export replaces them with REDACTED in the file only; your bookmarks are not changed.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(dialog.getByText(SECRET_URL, { exact: true })).toBeVisible();
  await expect(dialog.getByText('Sensitive query parameter: token', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Email-like value in parameter: user', { exact: true })).toBeVisible();
  await expect(
    dialog.getByText('Sensitive value in URL fragment: access_token', { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByText('Public Page', { exact: true })).toHaveCount(0);

  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export original' }).click();
  const html = await readFile(await (await downloadPromise).path(), 'utf8');
  await expect(dialog).toHaveCount(0);
  expect(html).toContain('HREF="https://e2e.invalid/callback?token=e2e-secret-123&amp;page=2"');
  expect(html).toContain('user=alice%40example.com#access_token=e2e-frag-456');
  expect(html).not.toContain('REDACTED');
  expect(await childrenOf(extensionWorker, folder.folderId)).toEqual(
    storedUrls.map((item) => expect.objectContaining(item)),
  );
});

test('bookmark export downloads a redacted file without changing stored bookmarks', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedSensitiveFolder(extensionWorker);
  await setSettings(extensionWorker, { dataDefaultExportFormat: 'json', exportIncludeDates: false });

  await openTools(page, extensionId, folder.folderId);
  await toolCard(page, 'Export Bookmarks').getByRole('button', { name: 'Export' }).click();
  const dialog = reviewDialog(page);
  await expect(dialog).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export redacted' }).click();
  const raw = await readFile(await (await downloadPromise).path(), 'utf8');
  const exported = JSON.parse(raw) as {
    children: Array<{ title: string; children: Array<{ title: string; url: string }> }>;
  };
  expect(exported.children[0].children).toEqual([
    { title: 'Token Callback', url: 'https://e2e.invalid/callback?token=REDACTED&page=2' },
    { title: 'Invite', url: 'https://e2e.invalid/invite?user=REDACTED#access_token=REDACTED' },
    { title: 'Public Page', url: 'https://e2e.invalid/public' },
  ]);
  expect(raw).not.toContain('e2e-secret-123');
  expect(raw).not.toContain('alice');
  expect(raw).not.toContain('e2e-frag-456');
  expect(await childrenOf(extensionWorker, folder.folderId)).toEqual(
    storedUrls.map((item) => expect.objectContaining(item)),
  );
});

test('cancelling the export privacy review downloads nothing', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedSensitiveFolder(extensionWorker);
  await setSettings(extensionWorker, { dataDefaultExportFormat: 'html' });
  let downloads = 0;
  page.on('download', () => {
    downloads += 1;
  });

  await openTools(page, extensionId, folder.folderId);
  await toolCard(page, 'Export Bookmarks').getByRole('button', { name: 'Export' }).click();
  const dialog = reviewDialog(page);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  // Give a stray download time to surface before asserting none happened.
  await page.waitForTimeout(500);
  expect(downloads).toBe(0);
  expect(await childrenOf(extensionWorker, folder.folderId)).toEqual(
    storedUrls.map((item) => expect.objectContaining(item)),
  );
});

test('an export with nothing sensitive downloads directly without a review', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'E2E Public Export', [
    { title: 'Docs', url: 'https://e2e.invalid/docs#install' },
  ]);
  await setSettings(extensionWorker, { dataDefaultExportFormat: 'html' });

  await openTools(page, extensionId, folder.folderId);
  const downloadPromise = page.waitForEvent('download');
  await toolCard(page, 'Export Bookmarks').getByRole('button', { name: 'Export' }).click();
  const html = await readFile(await (await downloadPromise).path(), 'utf8');
  expect(html).toContain('https://e2e.invalid/docs#install');
  await expect(reviewDialog(page)).toHaveCount(0);
});

test('AI context pack offers the privacy review and writes a redacted Markdown file', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedSensitiveFolder(extensionWorker);
  await setSettings(extensionWorker, {
    aiEnabled: false,
    aiContextPackerOutputFormat: 'markdown',
    aiContextPackerIncludeDates: false,
  });

  await openTools(page, extensionId, folder.folderId);
  await toolCard(page, 'AI Context Packer').getByRole('button', { name: 'Export' }).click();
  const dialog = reviewDialog(page);
  await expect(dialog.getByText('Sensitive query parameter: token', { exact: true })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export redacted' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('bookmark-context.md');
  const markdown = await readFile(await download.path(), 'utf8');
  expect(markdown).toContain('- URL: https://e2e.invalid/callback?token=REDACTED&page=2');
  expect(markdown).toContain(
    '- URL: https://e2e.invalid/invite?user=REDACTED#access_token=REDACTED',
  );
  expect(markdown).toContain('- URL: https://e2e.invalid/public');
  expect(markdown).not.toContain('e2e-secret-123');
  expect(markdown).not.toContain('e2e-frag-456');
  expect(await childrenOf(extensionWorker, folder.folderId)).toEqual(
    storedUrls.map((item) => expect.objectContaining(item)),
  );
});
