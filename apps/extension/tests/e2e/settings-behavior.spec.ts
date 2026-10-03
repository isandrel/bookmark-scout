/**
 * Settings-to-behavior checks for settings no other spec exercised: each test changes a saved
 * setting and asserts that the UI or its output changes. See tests/settings-matrix.ts.
 */
import { readFile } from 'node:fs/promises';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import { expect, test, toastRegion } from './fixtures';
import { bookmarkRow, folderRow, openPopup, seedFolder as seedPopupFolder } from './popup-helpers';

// The harness opens the popup as a tab, which gets no activeTab (the toolbar button grants it),
// so these tests grant the optional tabs permission to read the current page.
test.use({ grantPermissions: ['tabs'] });
import { openTools, seedFolder, setSettings, toolCard } from './tool-helpers';

async function downloadContextPack(page: Page) {
  const downloadPromise = page.waitForEvent('download');
  await toolCard(page, 'AI Context Packer').getByRole('button', { name: 'Export' }).click();
  const download = await downloadPromise;
  return readFile(await download.path(), 'utf8');
}

async function setBookmarkSummary(worker: Worker, bookmarkId: string, summary: string) {
  await worker.evaluate(
    async ({ id, value }) => {
      const key = 'bookmark-scout-bookmark-metadata';
      const stored = await chrome.storage.local.get(key);
      await chrome.storage.local.set({ [key]: { ...(stored[key] ?? {}), [id]: { summary: value } } });
    },
    { id: bookmarkId, value: summary },
  );
}

test('toast duration setting controls how long popup toasts stay open', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const { barTitle } = await seedPopupFolder(extensionWorker, 'E2E Toast Quick', []);
  await seedPopupFolder(extensionWorker, 'E2E Toast Slow', []);
  await setSettings(extensionWorker, { toastDurationMs: 2000 });

  await openPopup(page, extensionId);
  await folderRow(page, barTitle).click();
  const addTo = async (title: string) => {
    const row = folderRow(page, title);
    await row.hover();
    await row.getByRole('button', { name: 'Add current page' }).click();
    // Hovering a toast pauses its timer, so keep the pointer away from the toast stack.
    await page.mouse.move(0, 0);
  };

  await addTo('E2E Toast Quick');
  const toast = toastRegion(page).getByText('Bookmark Added');
  await expect(toast).toBeVisible();
  // The 4000 ms default would still show it; 2000 ms closes it well before then.
  await expect(toast).toHaveCount(0, { timeout: 3500 });

  await setSettings(extensionWorker, { toastDurationMs: 10000 });
  await addTo('E2E Toast Slow');
  await expect(toast).toBeVisible();
  // Past the 4000 ms default, well before 10000 ms.
  await page.waitForTimeout(5500);
  await expect(toast).toBeVisible();
});

test('search delay setting controls when the popup filters results', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await seedFolder(extensionWorker, 'E2E Debounce', [
    { title: 'Debounce Target', url: 'https://e2e.invalid/debounce' },
  ]);
  await setSettings(extensionWorker, { searchDebounceMs: 1000, expandFoldersOnSearch: true });

  await openPopup(page, extensionId);
  const search = page.getByPlaceholder('Search bookmarks...');
  const target = bookmarkRow(page, 'Debounce Target');
  await search.fill('Debounce Target');
  await page.waitForTimeout(500);
  // Still the unfiltered, collapsed tree half-way through the 1000 ms delay.
  await expect(target).toHaveCount(0);
  await expect(target).toBeVisible();

  await setSettings(extensionWorker, { searchDebounceMs: 50 });
  await openPopup(page, extensionId);
  await page.getByPlaceholder('Search bookmarks...').fill('Debounce Target');
  // Well inside the previous 1000 ms delay.
  await expect(target).toBeVisible({ timeout: 700 });
});

async function stubRecommendations(context: BrowserContext, folderPaths: string[]) {
  const requests: string[] = [];
  const text = JSON.stringify({
    recommendations: folderPaths.map((folderPath) => ({
      type: 'new',
      folderPath,
      parentPath: '',
      confidence: 0.9,
      reason: 'Fixture recommendation',
    })),
  });
  await context.route('https://e2e.invalid/v1/**', async (route) => {
    requests.push(route.request().postData() ?? '');
    const isResponses = route.request().url().endsWith('/responses');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(
        isResponses
          ? {
              id: 'response-e2e',
              model: 'e2e-model',
              output: [
                {
                  type: 'message',
                  role: 'assistant',
                  id: 'message-e2e',
                  content: [{ type: 'output_text', text, annotations: [] }],
                },
              ],
            }
          : {
              id: 'chat-e2e',
              model: 'e2e-model',
              choices: [
                { index: 0, finish_reason: 'stop', message: { role: 'assistant', content: text } },
              ],
            },
      ),
    });
  });
  return requests;
}

test('[mocked provider contract] popup AI model, auto-trigger, suggestion count, and title truncation follow settings', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await extensionWorker.evaluate(async () => {
    await chrome.storage.sync.set({
      'bookmark-scout-settings': {
        aiEnabled: true,
        aiProvider: 'custom',
        aiModel: 'e2e-settings-model',
        aiAutoTriggerOnOpen: false,
        aiMaxRecommendations: 2,
        truncateLength: 20,
        recentFoldersEnabled: false,
      },
    });
    await chrome.storage.local.set({
      'bookmark-scout-ai': { custom: { baseUrl: 'https://e2e.invalid/v1' } },
    });
  });
  const requests = await stubRecommendations(context, ['Rec One', 'Rec Two', 'Rec Three']);
  await context.route('https://current.e2e.invalid/article', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<title>E2E-Truncation-Title-Is-Longer</title><main>Fixture page</main>',
    }),
  );
  await page.goto('https://current.e2e.invalid/article');
  const targetTabId = await extensionWorker.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    return tabs.find((tab) => tab.url === 'https://current.e2e.invalid/article')?.id;
  });
  if (targetTabId === undefined) throw new Error('Target tab not found');

  const popup = await context.newPage();
  await openPopup(popup, extensionId);
  await extensionWorker.evaluate((id) => chrome.tabs.update(id, { active: true }), targetTabId);
  // A suggestion's accessible name is its folder path followed by its confidence.
  const suggestion = (name: string) => popup.getByRole('button', { name: `${name} 90%` });
  // Auto-trigger is off, so opening the popup asks the provider nothing.
  await popup.waitForTimeout(500);
  expect(requests).toHaveLength(0);
  await expect(suggestion('Rec One')).toHaveCount(0);

  await setSettings(extensionWorker, { aiAutoTriggerOnOpen: true });
  await expect(suggestion('Rec One')).toBeVisible();
  await expect(suggestion('Rec Two')).toBeVisible();
  await expect(suggestion('Rec Three')).toHaveCount(0);
  expect(requests).toHaveLength(1);
  expect(requests[0]).toContain('Return exactly 2 folder recommendations');
  expect(requests[0]).toContain('"model":"e2e-settings-model"');
  const header = popup.getByText('AI Suggestions for:');
  await expect(header).toHaveText('AI Suggestions for: E2E-Truncation-Title...');
});

test('statistics top-N and privacy title scanning follow their settings', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'E2E Report Settings', [
    { title: 'A1', url: 'https://a.e2e.invalid/1' },
    { title: 'A2', url: 'https://a.e2e.invalid/2' },
    { title: 'B1', url: 'https://b.e2e.invalid/1' },
    { title: 'Mail alice@e2e.invalid', url: 'https://c.e2e.invalid/' },
  ]);
  await setSettings(extensionWorker, {
    statisticsDefaultScope: 'folder',
    statisticsIncludeDomains: true,
    statisticsTopN: 1,
    privacyScannerScanTitles: false,
    privacyScannerEmailDetection: true,
  });

  await openTools(page, extensionId, folder.folderId);
  const statsCard = toolCard(page, 'Bookmark Statistics');
  const stats = page.getByRole('dialog', { name: 'Bookmark Statistics' });
  const topDomains = stats.getByText('Top domains', { exact: true }).locator('..');
  await statsCard.getByRole('button', { name: 'View' }).click();
  await expect(topDomains).toContainText('a.e2e.invalid');
  await expect(topDomains).not.toContainText('b.e2e.invalid');
  await page.keyboard.press('Escape');

  await setSettings(extensionWorker, { statisticsTopN: 3 });
  await statsCard.getByRole('button', { name: 'View' }).click();
  await expect(topDomains).toContainText('b.e2e.invalid');
  await expect(topDomains).toContainText('c.e2e.invalid');
  await page.keyboard.press('Escape');

  const privacyCard = toolCard(page, 'Privacy Scanner');
  const privacy = page.getByRole('dialog', { name: 'Privacy Scanner' });
  const mailRow = privacy.getByText('Mail alice@e2e.invalid', { exact: true });
  await privacyCard.getByRole('button', { name: 'Scan' }).click();
  await expect(privacy).toBeVisible();
  await expect(mailRow).toHaveCount(0);
  await page.keyboard.press('Escape');

  await setSettings(extensionWorker, { privacyScannerScanTitles: true });
  await privacyCard.getByRole('button', { name: 'Scan' }).click();
  await expect(mailRow).toBeVisible();
  await expect(privacy).toContainText('Email address detected');
});

test('AI context pack item, depth, and excerpt limits change the exported file', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'E2E Pack Limits', [
    { title: 'Pack One', url: 'https://e2e.invalid/one' },
    { title: 'Pack Two', url: 'https://e2e.invalid/two' },
    { title: 'Nested', children: [{ title: 'Pack Deep', url: 'https://e2e.invalid/deep' }] },
  ]);
  await setBookmarkSummary(extensionWorker, folder.ids['Pack One'], 'S'.repeat(100));
  await setSettings(extensionWorker, {
    aiContextPackerEnabled: true,
    aiContextPackerDefaultScope: 'folder',
    aiContextPackerOutputFormat: 'markdown',
    aiContextPackerIncludeSummaries: true,
    aiContextPackerMaxItems: 100,
    aiContextPackerMaxDepth: 10,
    aiContextPackerExcerptLength: 2000,
  });

  await openTools(page, extensionId, folder.folderId);
  const full = await downloadContextPack(page);
  expect(full).toContain('Pack Deep');
  expect(full).toContain(`Summary: ${'S'.repeat(100)}`);

  await setSettings(extensionWorker, {
    aiContextPackerMaxDepth: 1,
    aiContextPackerExcerptLength: 40,
  });
  const shallow = await downloadContextPack(page);
  expect(shallow).toContain('Pack Two');
  expect(shallow).not.toContain('Pack Deep');
  expect(shallow).toContain(`Summary: ${'S'.repeat(37)}...\n`);

  await setSettings(extensionWorker, { aiContextPackerMaxItems: 1 });
  const single = await downloadContextPack(page);
  expect(single).toContain('Pack One');
  expect(single).not.toContain('Pack Two');
});

test('duplicate matching, group limit, and reorganization scope follow their settings', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'E2E Duplicate Settings', [
    { title: 'Www Copy', url: 'https://www.e2e.invalid/page' },
    { title: 'Bare Copy', url: 'https://e2e.invalid/page' },
    { title: 'Same One', url: 'https://e2e.invalid/same' },
    { title: 'Same Two', url: 'https://e2e.invalid/same' },
  ]);
  await setSettings(extensionWorker, {
    duplicatesEnabled: true,
    duplicatesMatchStrategy: 'normalized_url',
    duplicatesNormalizeWww: false,
    duplicatesMaxGroups: 100,
    reorganizationEnabled: true,
    reorganizationDefaultScope: 'all',
  });

  await openTools(page, extensionId, folder.folderId);
  const card = toolCard(page, 'Duplicate Cleaner');
  const dialog = page.getByRole('dialog', { name: 'Duplicate Cleaner' });
  await card.getByRole('button', { name: 'Scan' }).click();
  await expect(dialog.getByText('1 duplicate group found across 4 bookmarks')).toBeVisible();
  await expect(dialog).not.toContainText('Www Copy');
  await page.keyboard.press('Escape');

  await setSettings(extensionWorker, { duplicatesNormalizeWww: true });
  await card.getByRole('button', { name: 'Scan' }).click();
  await expect(dialog.getByText('2 duplicate groups found across 4 bookmarks')).toBeVisible();
  await expect(dialog).toContainText('Www Copy');
  await page.keyboard.press('Escape');

  await setSettings(extensionWorker, { duplicatesMaxGroups: 1 });
  await card.getByRole('button', { name: 'Scan' }).click();
  await expect(dialog.getByText('1 duplicate group found across 4 bookmarks')).toBeVisible();
  await page.keyboard.press('Escape');

  const reorganizationScope = toolCard(page, 'AI Folder Reorganization').getByRole('combobox');
  await expect(reorganizationScope).toContainText('All Bookmarks');
  await setSettings(extensionWorker, { reorganizationDefaultScope: 'folder' });
  await expect(reorganizationScope).toContainText('E2E Duplicate Settings');
});
