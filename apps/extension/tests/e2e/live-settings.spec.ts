import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openPopup, setSettings } from './popup-helpers';

async function openAIOptions(page: Page, extensionId: string) {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByRole('tab', { name: 'AI', exact: true }).click();
  await page.getByRole('button', { name: 'More settings' }).click();
  await expect(page.getByRole('textbox', { name: 'Base URL' })).toBeVisible();
}

test('a language change re-renders open pages without a reload', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en' });
  await openPopup(page, extensionId);
  const manager = await context.newPage();
  await manager.goto(`chrome-extension://${extensionId}/bookmarks.html`);
  await expect(manager.getByPlaceholder('Filter titles...')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  await setSettings(extensionWorker, { language: 'ja' });

  await expect(page.getByPlaceholder('ブックマークを検索...')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(manager.getByPlaceholder('タイトルで絞り込み...')).toBeVisible();
  await expect(manager.getByTestId('folder-sidebar').getByRole('heading')).toHaveText(
    'ブックマーク',
  );
  await expect(manager.locator('html')).toHaveAttribute('lang', 'ja');

  await setSettings(extensionWorker, { language: 'en' });
  await expect(page.getByPlaceholder('Search bookmarks...')).toBeVisible();
  await expect(manager.getByPlaceholder('Filter titles...')).toBeVisible();
});

test('an AI service follows changes saved in another Options tab', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en', aiProvider: 'openai' });
  await openAIOptions(page, extensionId);
  const other = await context.newPage();
  await openAIOptions(other, extensionId);

  const baseUrl = page.getByRole('textbox', { name: 'Base URL' });
  await baseUrl.fill('https://proxy.example.invalid/v1');
  await baseUrl.blur();
  await expect(other.getByRole('textbox', { name: 'Base URL' })).toHaveValue(
    'https://proxy.example.invalid/v1',
  );

  // A field being edited in the other tab keeps its text while a different field updates.
  const otherBaseUrl = other.getByRole('textbox', { name: 'Base URL' });
  await otherBaseUrl.fill('https://typing.example.invalid/v1');
  const headers = page.getByRole('textbox', { name: 'Extra Headers JSON' });
  await headers.fill('{"X-Test":"1"}');
  await headers.blur();
  await expect(other.getByRole('textbox', { name: 'Extra Headers JSON' })).toHaveValue(
    '{"X-Test":"1"}',
  );
  await expect(otherBaseUrl).toHaveValue('https://typing.example.invalid/v1');
});
