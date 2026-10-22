import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openPopup, setSettings } from './popup-helpers';
import { seedAIServices } from './storage';

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
  await expect(
    manager.getByPlaceholder('Search titles, addresses, folders, and tags'),
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  // Typed text survives the switch: the page re-renders instead of remounting.
  await page
    .getByRole('combobox', { name: 'Search bookmarks, or type a folder name' })
    .fill('typed before the switch');

  await setSettings(extensionWorker, { language: 'ja' });

  await expect(page.getByRole('combobox', { name: 'ブックマークを検索' })).toHaveValue(
    'typed before the switch',
  );
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(manager.getByPlaceholder('タイトル・アドレス・フォルダ・タグを検索')).toBeVisible();
  await expect(manager.getByTestId('folder-sidebar').getByRole('heading')).toHaveText(
    'ブックマーク',
  );
  await expect(manager.locator('html')).toHaveAttribute('lang', 'ja');

  await setSettings(extensionWorker, { language: 'en' });
  await expect(
    page.getByRole('combobox', { name: 'Search bookmarks, or type a folder name' }),
  ).toBeVisible();
  await expect(
    manager.getByPlaceholder('Search titles, addresses, folders, and tags'),
  ).toBeVisible();
});

test('a page opened in a selected language shows it from the first paint', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'ja' });
  // Record the search box's label the first time the box appears, before any later re-render.
  // (Its placeholder may shorten to fit the box, so the label is the stable text.)
  await page.addInitScript(() => {
    const scope = window as unknown as { firstLabel?: string };
    const observer = new MutationObserver(() => {
      const input = document.querySelector<HTMLInputElement>('input[aria-label]');
      if (!input) return;
      scope.firstLabel = input.getAttribute('aria-label') ?? undefined;
      observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true });
  });

  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.getByRole('combobox', { name: 'ブックマークを検索' })).toBeVisible();
  expect(await page.evaluate(() => (window as { firstLabel?: string }).firstLabel)).toBe(
    'ブックマークを検索、またはフォルダ名を入力してこのページを保存',
  );
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(page).toHaveTitle('ブックマークスカウト');
});

test('an AI service follows changes saved in another Options tab', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en' });
  await seedAIServices(extensionWorker, [{ provider: 'openai' }]);
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
