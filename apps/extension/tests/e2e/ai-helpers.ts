import type { Page, Route } from '@playwright/test';
import { expect } from './fixtures';
import { readStored, STORAGE_ITEMS } from './storage';

/** Streams an OpenAI-style chat completion as server-sent events, for a stubbed provider. */
export function streamChunks(
  route: Route,
  deltas: Record<string, unknown>[],
  finishReason: string,
) {
  const chunk = (delta: Record<string, unknown>, finish: string | null) =>
    `data: ${JSON.stringify({
      id: 'chat-e2e',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'ask-model',
      choices: [{ index: 0, delta, finish_reason: finish }],
    })}\n\n`;
  const body = [
    ...deltas.map((delta) => chunk(delta, null)),
    chunk({}, finishReason),
    'data: [DONE]\n\n',
  ].join('');
  return route.fulfill({
    status: 200,
    headers: { 'access-control-allow-origin': '*', 'content-type': 'text/event-stream' },
    body,
  });
}

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
  return readStored<{ services: { id: string; provider: string; model: string; name: string }[] }>(
    page,
    STORAGE_ITEMS.aiServices,
  );
}
