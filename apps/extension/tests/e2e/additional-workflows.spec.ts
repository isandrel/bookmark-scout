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

async function setAIProviderConfig(
  worker: Worker,
  provider: string,
  config: Record<string, string>,
) {
  await worker.evaluate(
    async ({ providerId, providerConfig }) => {
      const key = 'bookmark-scout-ai';
      const stored = await chrome.storage.local.get(key);
      await chrome.storage.local.set({
        [key]: { ...(stored[key] ?? {}), [providerId]: providerConfig },
      });
    },
    { providerId: provider, providerConfig: config },
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

test('[mocked provider contract] provider-backed AI previews stop at opt-in without making external requests', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folderId = await seedFolder(extensionWorker, 'E2E AI Opt In', [
    { title: 'Private Fixture', url: 'https://e2e.invalid/private-ai-fixture' },
  ]);
  await setSettings(extensionWorker, {
    aiEnabled: false,
    aiProvider: 'openai',
    aiModel: 'gpt-4o-mini',
  });
  await setAIProviderConfig(extensionWorker, 'openai', { apiKey: 'sk-synthetic-e2e-key' });
  let providerRequests = 0;
  await page.route('https://api.openai.com/**', async (route) => {
    providerRequests += 1;
    await route.fulfill({ status: 500, body: 'Provider route must not be called' });
  });

  await openTools(page, extensionId, folderId);
  await toolCard(page, 'Auto-Tagging').getByRole('button', { name: 'Analyze' }).click();
  await expect(page.getByText('AI features are disabled', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Auto-Tagging' })).toHaveCount(0);

  await toolCard(page, 'Content Summarizer').getByRole('button', { name: 'Analyze' }).click();
  await expect(page.getByText('AI features are disabled', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Content Summarizer' })).toHaveCount(0);
  expect(providerRequests).toBe(0);
});

const MOCK_PROVIDER_BASE_URL = 'https://provider.invalid/v1';
const MOCK_PROVIDER_CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
};

async function useMockCustomProvider(worker: Worker) {
  await setSettings(worker, { aiEnabled: true, aiProvider: 'custom', aiModel: 'e2e-model' });
  await setAIProviderConfig(worker, 'custom', {
    apiKey: 'synthetic-e2e-key',
    baseUrl: MOCK_PROVIDER_BASE_URL,
  });
}

// Minimal OpenAI Responses API envelope; asserts our contract with the SDK, not live compatibility.
function mockResponsesApiBody(payload: unknown) {
  return JSON.stringify({
    id: 'resp_e2e',
    created_at: 0,
    model: 'e2e-model',
    output: [
      {
        type: 'message',
        role: 'assistant',
        id: 'msg_e2e',
        content: [{ type: 'output_text', text: JSON.stringify(payload), annotations: [] }],
      },
    ],
    usage: { input_tokens: 1, output_tokens: 1 },
  });
}

test('[mocked provider contract] auto-tagging previews route-mocked provider tags without mutating bookmarks', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folderId = await seedFolder(extensionWorker, 'E2E AI Tagging', [
    { title: 'Tagged Fixture', url: 'https://e2e.invalid/tagged-fixture' },
  ]);
  const [bookmark] = await extensionWorker.evaluate(async (id) => {
    return chrome.bookmarks.getChildren(id);
  }, folderId);
  await useMockCustomProvider(extensionWorker);
  const providerRequests: { authorization?: string; body: string }[] = [];
  await page.route(`${MOCK_PROVIDER_BASE_URL}/**`, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: MOCK_PROVIDER_CORS_HEADERS });
      return;
    }
    providerRequests.push({
      authorization: request.headers().authorization,
      body: request.postData() ?? '',
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: MOCK_PROVIDER_CORS_HEADERS,
      body: mockResponsesApiBody({
        items: [
          {
            bookmarkId: bookmark.id,
            title: 'Provider Rewritten Title',
            tags: ['e2e-tag', 'fixture'],
            reason: 'Route-mocked provider reason',
          },
          {
            bookmarkId: 'hallucinated-id',
            title: 'Hallucinated Bookmark',
            tags: ['ignored'],
            reason: 'Not requested',
          },
        ],
      }),
    });
  });

  await openTools(page, extensionId, folderId);
  await toolCard(page, 'Auto-Tagging').getByRole('button', { name: 'Analyze' }).click();
  const preview = page.getByRole('dialog', { name: 'Auto-Tagging' });
  await expect(preview).toContainText('Tagged Fixture');
  await expect(preview).toContainText('https://e2e.invalid/tagged-fixture');
  await expect(preview).toContainText('e2e-tag');
  await expect(preview).toContainText('Route-mocked provider reason');
  await expect(preview).not.toContainText('Provider Rewritten Title');
  await expect(preview).not.toContainText('Hallucinated Bookmark');

  expect(providerRequests).toHaveLength(1);
  expect(providerRequests[0].authorization).toBe('Bearer synthetic-e2e-key');
  expect(providerRequests[0].body).toContain('https://e2e.invalid/tagged-fixture');
  const titles = await extensionWorker.evaluate(async (id) => {
    const children = await chrome.bookmarks.getChildren(id);
    return children.map((item) => item.title);
  }, folderId);
  expect(titles).toEqual(['Tagged Fixture']);
});

test('[mocked provider contract] summarizer surfaces a route-mocked provider error without a preview', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folderId = await seedFolder(extensionWorker, 'E2E AI Summary Error', [
    { title: 'Summary Fixture', url: 'https://e2e.invalid/summary-fixture' },
  ]);
  await useMockCustomProvider(extensionWorker);
  let providerCalls = 0;
  await page.route(`${MOCK_PROVIDER_BASE_URL}/**`, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: MOCK_PROVIDER_CORS_HEADERS });
      return;
    }
    providerCalls += 1;
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      headers: MOCK_PROVIDER_CORS_HEADERS,
      body: JSON.stringify({
        error: {
          message: 'Synthetic provider rejected the key',
          type: 'invalid_request_error',
          param: null,
          code: 'invalid_api_key',
        },
      }),
    });
  });

  await openTools(page, extensionId, folderId);
  await toolCard(page, 'Content Summarizer').getByRole('button', { name: 'Analyze' }).click();
  await expect(page.getByText('Tool failed', { exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic provider rejected the key', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Content Summarizer' })).toHaveCount(0);
  expect(providerCalls).toBe(1);
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
  await expect(results).toContainText('Reachable');
  await expect(
    page.getByRole('dialog', { name: 'Check Dead Links' }).getByText(
      'Reachability results for the selected bookmarks',
    ),
  ).toBeVisible();
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
  await expect(preview.getByText('1 bookmarks can be cleaned')).toBeVisible();
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

test('network tools report route-mocked transport failures without mutating bookmarks', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folderId = await seedFolder(extensionWorker, 'E2E Network Failure', [
    { title: 'Offline Original', url: 'https://e2e.invalid/offline' },
  ]);
  await setSettings(extensionWorker, { deadLinksRetryCount: 1 });
  const requests: string[] = [];
  await page.route('https://e2e.invalid/offline', async (route) => {
    requests.push(route.request().method());
    await route.abort('failed');
  });

  await openTools(page, extensionId, folderId);
  await toolCard(page, 'Check Dead Links').getByRole('button', { name: 'Scan' }).click();
  const deadLinks = page.getByRole('dialog', { name: 'Check Dead Links' });
  await expect(deadLinks).toContainText('Offline Original');
  await expect(deadLinks.getByText('Error', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  await toolCard(page, 'Metadata Fetcher').getByRole('button', { name: 'Scan' }).click();
  const metadata = page.getByRole('dialog', { name: 'Metadata Fetcher' });
  await expect(metadata).toContainText('Offline Original');
  await expect(metadata.getByText('Suggested title:', { exact: false })).toHaveCount(0);

  expect(requests).toEqual(['HEAD', 'HEAD', 'GET']);
  const [storedBookmark] = await extensionWorker.evaluate(async (id) => {
    return chrome.bookmarks.getChildren(id);
  }, folderId);
  expect(storedBookmark.title).toBe('Offline Original');
});
