import { readFile } from 'node:fs/promises';
import type { Page, Worker } from '@playwright/test';
import { expect, test } from './fixtures';

type SeedItem = { title: string; url: string };

async function seedFolder(worker: Worker, title: string, items: SeedItem[]) {
  return worker.evaluate(
    async ({ folderTitle, entries }) => {
      const [root] = await chrome.bookmarks.getTree();
      const writableRoot = root.children?.find((node) => node.children !== undefined);
      if (!writableRoot) throw new Error('No writable bookmark root found');

      const folder = await chrome.bookmarks.create({
        parentId: writableRoot.id,
        title: folderTitle,
      });
      for (const item of entries) {
        await chrome.bookmarks.create({ parentId: folder.id, ...item });
      }
      return folder.id;
    },
    { folderTitle: title, entries: items },
  );
}

async function setSettings(worker: Worker, updates: Record<string, unknown>) {
  await worker.evaluate(async (values) => {
    const key = 'bookmark-scout-settings';
    const stored = await chrome.storage.sync.get(key);
    await chrome.storage.sync.set({ [key]: { ...(stored[key] ?? {}), ...values } });
  }, updates);
}

async function setBookmarkMetadata(
  worker: Worker,
  bookmarkId: string,
  metadata: { tags?: string[]; summary?: string },
) {
  await worker.evaluate(
    async ({ id, value }) => {
      const key = 'bookmark-scout-bookmark-metadata';
      const stored = await chrome.storage.local.get(key);
      await chrome.storage.local.set({
        [key]: { ...(stored[key] ?? {}), [id]: value },
      });
    },
    { id: bookmarkId, value: metadata },
  );
}

function toolCard(page: Page, title: string) {
  return page
    .getByRole('heading', { name: title, exact: true })
    .locator('..')
    .locator('..')
    .locator('..')
    .locator('..');
}

async function openTools(page: Page, extensionId: string, folderId: string) {
  await page.goto(`chrome-extension://${extensionId}/bookmarks.html?id=${folderId}`);
  await page.getByTitle('Show tools').click();
}

test('popup search honors case, whole-word, and regex controls', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await seedFolder(extensionWorker, 'E2E Search Modes', [
    { title: 'Alpha Link', url: 'https://e2e.invalid/alpha' },
    { title: 'Alphabet Soup', url: 'https://e2e.invalid/alphabet' },
    { title: 'alpha lower', url: 'https://e2e.invalid/lower' },
  ]);

  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  const search = page.getByPlaceholder('Search bookmarks...');
  await search.fill('Alpha');
  await expect(page.getByText('Alpha Link', { exact: true })).toBeVisible();
  await expect(page.getByText('Alphabet Soup', { exact: true })).toBeVisible();
  await expect(page.getByText('alpha lower', { exact: true })).toBeVisible();

  await page.getByTitle('Match Case').click();
  await expect(page.getByText('alpha lower', { exact: true })).toHaveCount(0);
  await page.getByTitle('Match Whole Word').click();
  await expect(page.getByText('Alpha Link', { exact: true })).toBeVisible();
  await expect(page.getByText('Alphabet Soup', { exact: true })).toHaveCount(0);

  await page.getByTitle('Match Whole Word').click();
  await page.getByTitle('Use Regular Expression').click();
  await search.fill('^Alpha\\sLink$');
  await expect(page.getByText('Alpha Link', { exact: true })).toBeVisible();
  await expect(page.getByText('Alphabet Soup', { exact: true })).toHaveCount(0);
});

test('AI context pack exports the selected folder with AI disabled', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const targetFolderId = await seedFolder(extensionWorker, 'E2E Context Target', [
    { title: 'Context Target', url: 'https://e2e.invalid/context-target' },
    { title: 'Context Missing Metadata', url: 'https://e2e.invalid/context-missing' },
  ]);
  await seedFolder(extensionWorker, 'E2E Context Other', [
    { title: 'Context Other', url: 'https://e2e.invalid/context-other' },
  ]);
  await setSettings(extensionWorker, {
    aiEnabled: false,
    aiContextPackerOutputFormat: 'markdown',
    aiContextPackerIncludeFolderPath: true,
    aiContextPackerIncludeDates: false,
    aiContextPackerIncludeTags: true,
    aiContextPackerIncludeSummaries: true,
  });
  const [storedBookmark] = await extensionWorker.evaluate(async (folderId) => {
    return chrome.bookmarks.getChildren(folderId);
  }, targetFolderId);
  await setBookmarkMetadata(extensionWorker, storedBookmark.id, {
    tags: ['e2e', 'reviewed'],
    summary: 'Stored E2E summary',
  });

  await openTools(page, extensionId, targetFolderId);
  const downloadPromise = page.waitForEvent('download');
  await toolCard(page, 'AI Context Packer').getByRole('button', { name: 'Export' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('bookmark-context.md');
  const content = await readFile(await download.path(), 'utf8');
  expect(content).toContain('Context Target');
  expect(content).toContain('https://e2e.invalid/context-target');
  expect(content).toContain('Folder: E2E Context Target');
  expect(content).toContain('- Tags: ["e2e","reviewed"]');
  expect(content).toContain('- Summary: Stored E2E summary');
  expect(content).toContain('Context Missing Metadata');
  expect(content).not.toContain('Tags: []');
  expect(content).not.toContain('Summary: Context Missing Metadata');
  expect(content).not.toContain('Context Other');
});

test('dead-link checker reports mocked reachable and missing URLs', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folderId = await seedFolder(extensionWorker, 'E2E Link Health', [
    { title: 'Reachable Fixture', url: 'https://e2e.invalid/ok' },
    { title: 'Missing Fixture', url: 'https://e2e.invalid/missing' },
  ]);
  await setSettings(extensionWorker, { deadLinksRetryCount: 0 });
  const requested: string[] = [];
  await page.route('https://e2e.invalid/**', async (route) => {
    requested.push(`${route.request().method()} ${route.request().url()}`);
    await route.fulfill({
      status: route.request().url().endsWith('/ok') ? 200 : 404,
      headers: { 'access-control-allow-origin': '*' },
    });
  });

  await openTools(page, extensionId, folderId);
  await toolCard(page, 'Check Dead Links').getByRole('button', { name: 'Scan' }).click();
  const results = page.getByRole('dialog', { name: 'Check Dead Links' });
  await expect(results).toContainText('Reachable Fixture');
  await expect(results).toContainText('Missing Fixture');
  await expect(results).toContainText('HTTP 404');
  expect(requested.sort()).toEqual([
    'HEAD https://e2e.invalid/missing',
    'HEAD https://e2e.invalid/ok',
  ]);
});

test('URL cleaner honors preserved parameters and fragment settings', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folderId = await seedFolder(extensionWorker, 'E2E Cleaner Settings', [
    {
      title: 'Configurable URL',
      url: 'https://e2e.invalid/page?utm_source=e2e&drop=x#keep',
    },
  ]);
  await setSettings(extensionWorker, {
    urlCleanerPreserveParams: ['utm_source'],
    urlCleanerRemoveParams: ['utm_source', 'drop'],
    urlCleanerRemoveHash: false,
    urlCleanerSortQueryParams: false,
    urlCleanerDedupeQueryParams: false,
  });

  await openTools(page, extensionId, folderId);
  await toolCard(page, 'URL Cleaner').getByRole('button', { name: 'Clean' }).click();
  const preview = page.getByRole('dialog', { name: 'URL Cleaner' });
  await expect(preview).toContainText('https://e2e.invalid/page?utm_source=e2e#keep');
  await preview.getByRole('button', { name: 'Apply Changes' }).click();

  await expect
    .poll(() =>
      extensionWorker.evaluate(async (id) => {
        const [bookmark] = await chrome.bookmarks.getChildren(id);
        return bookmark.url;
      }, folderId),
    )
    .toBe('https://e2e.invalid/page?utm_source=e2e#keep');
});

test('metadata fetcher previews mocked page metadata without changing bookmarks', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folderId = await seedFolder(extensionWorker, 'E2E Metadata', [
    { title: 'Original Title', url: 'https://e2e.invalid/metadata' },
  ]);
  await setSettings(extensionWorker, {
    metadataFetcherFetchDescriptions: true,
  });
  await page.route('https://e2e.invalid/metadata', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      headers: { 'access-control-allow-origin': '*' },
      body: '<title>Suggested Fixture Title</title><meta name="description" content="Fixture summary">',
    }),
  );

  await openTools(page, extensionId, folderId);
  await toolCard(page, 'Metadata Fetcher').getByRole('button', { name: 'Scan' }).click();
  const results = page.getByRole('dialog', { name: 'Metadata Fetcher' });
  await expect(results).toContainText('Suggested title: Suggested Fixture Title');
  await expect(results).toContainText('Fixture summary');
  const titles = await extensionWorker.evaluate(async (id) => {
    const children = await chrome.bookmarks.getChildren(id);
    return children.map((item) => item.title);
  }, folderId);
  expect(titles).toEqual(['Original Title']);
});
