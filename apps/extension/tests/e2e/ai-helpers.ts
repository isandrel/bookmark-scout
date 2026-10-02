import type { Page } from '@playwright/test';
import { expect } from './fixtures';

export async function openAIOptions(page: Page, extensionId: string) {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByRole('tab', { name: 'AI', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'AI services' })).toBeVisible();
}

/** Base URL, headers, and provider-specific fields sit under More settings. */
export async function openMoreSettings(page: Page) {
  await page.getByRole('button', { name: 'More settings' }).click();
}

/** Adds a service through the Add service dialog, searching the provider picker. */
export async function addAIServiceInOptions(
  page: Page,
  { search, provider, name }: { search: string; provider: string; name?: string },
) {
  await page.getByRole('button', { name: 'Add service' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add an AI service' });
  await dialog.getByRole('combobox', { name: 'Provider' }).click();
  await page.getByRole('combobox', { name: 'Search...' }).fill(search);
  await page.getByRole('option', { name: provider, exact: true }).click();
  if (name) await dialog.getByLabel('Name').fill(name);
  await dialog.getByRole('button', { name: 'Add service' }).click();
  await expect(dialog).toHaveCount(0);
  return page.getByTestId('ai-service').filter({ hasText: name ?? provider });
}

export async function readAIServices(page: Page) {
  return page.evaluate(async () => {
    const stored = await chrome.storage.local.get('bookmark-scout-ai-services');
    return stored['bookmark-scout-ai-services'] as
      | { services: { id: string; provider: string; model: string; name: string }[] }
      | undefined;
  });
}
