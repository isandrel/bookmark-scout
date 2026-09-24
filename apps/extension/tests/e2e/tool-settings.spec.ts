import { readFile } from 'node:fs/promises';
import type { Page, Worker } from '@playwright/test';
import { expect, test } from './fixtures';

async function seedFolder(worker: Worker, title: string) {
  return worker.evaluate(async (folderTitle) => {
    const [root] = await chrome.bookmarks.getTree();
    const writableRoot = root.children?.find((node) => node.children !== undefined);
    if (!writableRoot) throw new Error('No writable bookmark root found');
    const folder = await chrome.bookmarks.create({ parentId: writableRoot.id, title: folderTitle });
    await chrome.bookmarks.create({
      parentId: folder.id,
      title: `${folderTitle} Link`,
      url: 'https://e2e.invalid/shared-duplicate',
    });
    return folder.id;
  }, title);
}

async function setSettings(worker: Worker, updates: Record<string, unknown>) {
  await worker.evaluate(async (values) => {
    const key = 'bookmark-scout-settings';
    const stored = await chrome.storage.sync.get(key);
    await chrome.storage.sync.set({ [key]: { ...(stored[key] ?? {}), ...values } });
  }, updates);
}

function toolCard(page: Page, title: string) {
  return page
    .getByRole('heading', { name: title, exact: true })
    .locator('..')
    .locator('..')
    .locator('..')
    .locator('..');
}

test('enabled flags hide all tool cards and live settings restore selected cards', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folderId = await seedFolder(extensionWorker, 'E2E Tool A');
  await seedFolder(extensionWorker, 'E2E Tool B');
  await setSettings(extensionWorker, {
    aiContextPackerEnabled: false,
    autoTaggingEnabled: false,
    summarizerEnabled: false,
    reorganizationEnabled: false,
    duplicatesEnabled: false,
    urlCleanerEnabled: false,
    deadLinksEnabled: false,
    metadataFetcherEnabled: false,
    privacyScannerEnabled: false,
    statisticsEnabled: false,
  });

  await page.goto(`chrome-extension://${extensionId}/bookmarks.html?id=${folderId}`);
  await page.getByTitle('Show tools').click();
  for (const title of [
    'AI Context Packer',
    'Auto-Tagging',
    'Content Summarizer',
    'AI Folder Reorganization',
    'Duplicate Cleaner',
    'URL Cleaner',
    'Check Dead Links',
    'Metadata Fetcher',
    'Privacy Scanner',
    'Bookmark Statistics',
  ]) {
    await expect(toolCard(page, title)).toHaveCount(0);
  }
  await expect(page.getByText('Export Bookmarks', { exact: true })).toBeVisible();

  await setSettings(extensionWorker, {
    aiContextPackerEnabled: true,
    aiContextPackerDefaultScope: 'all',
    statisticsEnabled: true,
    statisticsDefaultScope: 'all',
    duplicatesEnabled: true,
    duplicatesDefaultScope: 'folder',
    autoTaggingEnabled: true,
    autoTaggingDefaultScope: 'all',
    reorganizationEnabled: true,
    reorganizationDryRunFirst: false,
  });

  const statisticsCard = toolCard(page, 'Bookmark Statistics');
  await expect(statisticsCard).toBeVisible();
  await expect(statisticsCard.getByRole('combobox')).toContainText('All Bookmarks');
  await statisticsCard.getByRole('button', { name: 'View' }).click();
  const statistics = page.getByRole('dialog', { name: 'Bookmark Statistics' });
  await expect(statistics.getByText('Bookmarks', { exact: true }).locator('..')).toContainText('2');
  await page.keyboard.press('Escape');

  const contextCard = toolCard(page, 'AI Context Packer');
  await expect(contextCard.getByRole('combobox')).toContainText('All Bookmarks');
  const downloadPromise = page.waitForEvent('download');
  await contextCard.getByRole('button', { name: 'Export' }).click();
  const download = await downloadPromise;
  const content = await readFile(await download.path(), 'utf8');
  expect(content).toContain('E2E Tool A Link');
  expect(content).toContain('E2E Tool B Link');

  const duplicateCard = toolCard(page, 'Duplicate Cleaner');
  await expect(duplicateCard.getByRole('combobox')).toHaveCount(0);
  await duplicateCard.getByRole('button', { name: 'Scan' }).click();
  const duplicates = page.getByRole('dialog', { name: 'Duplicate Cleaner' });
  await expect(duplicates.getByText('1 duplicate group found across 2 bookmarks')).toBeVisible();
  await expect(duplicates).toContainText('E2E Tool A Link');
  await expect(duplicates).toContainText('E2E Tool B Link');
  await page.keyboard.press('Escape');

  const autoTaggingCard = toolCard(page, 'Auto-Tagging');
  await expect(autoTaggingCard.getByRole('combobox')).toHaveCount(0);
  await expect(autoTaggingCard.getByRole('button', { name: 'Analyze' })).toBeVisible();
  const reorganizationCard = toolCard(page, 'AI Folder Reorganization');
  await expect(reorganizationCard.getByRole('button', { name: 'Apply Changes' })).toBeVisible();
  await setSettings(extensionWorker, { reorganizationDryRunFirst: true });
  await expect(reorganizationCard.getByRole('button', { name: 'Analyze' })).toBeVisible();
  await setSettings(extensionWorker, { statisticsDefaultScope: 'folder' });
  await expect(statisticsCard.getByRole('combobox')).toContainText('E2E Tool A');
  await statisticsCard.getByRole('button', { name: 'View' }).click();
  await expect(statistics.getByText('Bookmarks', { exact: true }).locator('..')).toContainText('1');
});

test('unsupported and malformed saved scopes fall back without resetting other tool settings', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  const folderId = await seedFolder(extensionWorker, 'E2E Scope Fallback');
  await setSettings(extensionWorker, {
    statisticsDefaultScope: 'both',
    urlCleanerEnabled: false,
  });
  await page.goto(`chrome-extension://${extensionId}/bookmarks.html?id=${folderId}`);
  await page.getByTitle('Show tools').click();
  await expect(toolCard(page, 'Bookmark Statistics').getByRole('combobox')).toContainText(
    'E2E Scope Fallback',
  );
  await expect(toolCard(page, 'URL Cleaner')).toHaveCount(0);

  const optionsPage = await context.newPage();
  await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);
  await optionsPage.getByRole('tab', { name: 'Maintenance' }).click();
  const duplicatesScopeSetting = optionsPage
    .getByText('Default scope used when scanning for duplicate bookmarks')
    .locator('..')
    .locator('..');
  await duplicatesScopeSetting.getByRole('combobox').click();
  await expect(optionsPage.getByRole('option', { name: 'All Bookmarks' })).toBeVisible();
  await expect(optionsPage.getByRole('option', { name: 'Current Folder' })).toHaveCount(0);
  await expect(optionsPage.getByRole('option', { name: 'Folder or All' })).toHaveCount(0);
  await optionsPage.keyboard.press('Escape');

  const cleanerScopeSetting = optionsPage
    .getByText('Default scope used when cleaning bookmark URLs')
    .locator('..')
    .locator('..');
  await cleanerScopeSetting.getByRole('combobox').click();
  await expect(optionsPage.getByRole('option', { name: 'All Bookmarks' })).toBeVisible();
  await expect(optionsPage.getByRole('option', { name: 'Current Folder' })).toBeVisible();
  await expect(optionsPage.getByRole('option', { name: 'Folder or All' })).toHaveCount(0);
  await optionsPage.keyboard.press('Escape');

  await setSettings(extensionWorker, { statisticsDefaultScope: 'unsupported' });
  await expect(toolCard(page, 'Bookmark Statistics').getByRole('combobox')).toContainText(
    'E2E Scope Fallback',
  );
  await expect(toolCard(page, 'URL Cleaner')).toHaveCount(0);
});

test('tools sidebar headings, cards, scopes, and dialogs follow the selected language', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folderId = await seedFolder(extensionWorker, 'E2E Tool Locale');
  await seedFolder(extensionWorker, 'E2E Tool Locale Copy');
  await setSettings(extensionWorker, {
    language: 'en',
    aiContextPackerEnabled: true,
    aiContextPackerDefaultScope: 'folder',
    duplicatesEnabled: true,
    urlCleanerEnabled: true,
    urlCleanerDefaultScope: 'folder',
    privacyScannerEnabled: true,
    statisticsEnabled: true,
    dataDefaultExportFormat: 'html',
  });

  await page.goto(`chrome-extension://${extensionId}/bookmarks.html?id=${folderId}`);
  await page.getByTitle('Show tools').click();
  for (const heading of ['AI & Intelligence', 'Maintenance', 'Security', 'Analytics', 'Data']) {
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
  await expect(page.getByText(/tools_category_/i)).toHaveCount(0);

  await setSettings(extensionWorker, { language: 'ja' });
  for (const heading of [
    'AI・インテリジェンス',
    'メンテナンス',
    'セキュリティ',
    '分析',
    'データ',
  ]) {
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
  const contextCard = toolCard(page, 'AIコンテキストパッカー');
  await expect(contextCard).toContainText(
    'ブックマークをAI向けの形式（XML/Markdown）で書き出します',
  );
  await contextCard.getByRole('combobox').click();
  await expect(page.getByRole('option', { name: 'E2E Tool Locale' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'すべてのブックマーク' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(toolCard(page, 'ブックマークを書き出す').getByRole('combobox')).toContainText(
    'HTML（Chrome）',
  );

  await toolCard(page, '重複クリーナー').getByRole('button', { name: 'スキャン' }).click();
  const duplicates = page.getByRole('dialog', { name: '重複クリーナー' });
  await expect(
    duplicates.getByText('2 件のブックマークから 1 個の重複グループが見つかりました'),
  ).toBeVisible();
  await page.keyboard.press('Escape');

  await setSettings(extensionWorker, { language: 'ko' });
  await expect(page.getByRole('heading', { name: '유지 관리', exact: true })).toBeVisible();
  await toolCard(page, 'URL 정리').getByRole('button', { name: '정리' }).click();
  await expect(page.getByRole('dialog', { name: 'URL 정리' })).toContainText(
    '0개의 북마크를 정리할 수 있습니다',
  );
});
