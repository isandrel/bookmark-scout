/**
 * Requires an API key, per AI service: a provider that normally needs a key (OpenRouter, an
 * OpenAI-compatible API) runs with none once it is turned off, sending no Authorization header,
 * and a service that refuses a keyless request says it needs a key, with a way to its editor.
 */
import type { BrowserContext, Page, Worker } from '@playwright/test';
import { openAIOptions, readAIServices, streamChunks } from './ai-helpers';
import { expect, test } from './fixtures';
import { replaceSettings, seedAIServices } from './storage';

// Website access is pre-granted, so Verify never waits on the permission prompt.
test.use({ grantWebHostAccess: true });

const BASE_URL = 'https://gateway.e2e.invalid/v1';
const KEY_REQUIRED =
  'The service says it needs an API key. Add one in its settings, or check the endpoint.';

async function seedGateway(worker: Worker, requiresApiKey?: boolean) {
  await replaceSettings(worker, { language: 'en', aiEnabled: true, aiAutoTriggerOnOpen: false });
  await seedAIServices(worker, [
    {
      provider: 'openrouter',
      name: 'Gateway',
      model: 'e2e-model',
      requiresApiKey,
      credentials: { baseUrl: BASE_URL },
    },
  ]);
}

/**
 * An OpenAI-compatible endpoint behind a gateway: lists one model and answers chats, or refuses
 * every request with `status`. Records the auth headers of each request.
 */
async function stubGateway(context: BrowserContext, status?: number) {
  const seen: { path: string; authorization: string | null }[] = [];
  await context.route(`${BASE_URL}/**`, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': 'GET, POST, OPTIONS',
        },
      });
      return;
    }
    const { pathname } = new URL(request.url());
    seen.push({ path: pathname, authorization: await request.headerValue('authorization') });
    if (status) {
      await route.fulfill({
        status,
        headers: { 'access-control-allow-origin': '*' },
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'Missing bearer token' } }),
      });
      return;
    }
    if (pathname.endsWith('/models')) {
      await route.fulfill({
        headers: { 'access-control-allow-origin': '*' },
        contentType: 'application/json',
        body: JSON.stringify({ data: [{ id: 'e2e-model' }] }),
      });
      return;
    }
    await streamChunks(route, [{ role: 'assistant', content: 'Hello from the gateway.' }], 'stop');
  });
  return seen;
}

async function askAI(page: Page, extensionId: string, question: string) {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByRole('button', { name: 'Ask AI about your bookmarks or this page' }).click();
  const chat = page.getByTestId('ask-ai');
  const box = chat.getByRole('textbox', { name: /Ask about your bookmarks/ });
  await box.fill(question);
  await box.press('Enter');
  return chat;
}

test('[mocked provider contract] a service that needs a key runs without one once Requires an API key is off', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await seedGateway(extensionWorker);
  const seen = await stubGateway(context);

  await openAIOptions(page, extensionId);
  const requiresKey = page.getByRole('switch', { name: 'Requires an API key' });
  await expect(requiresKey).toBeChecked();
  // With the provider's default, a service without a key stops before any request.
  await page.getByRole('button', { name: 'Verify Service' }).click();
  await expect(page.getByTestId('ai-service-status')).toContainText('API key not configured');
  expect(seen).toEqual([]);

  await requiresKey.click();
  await expect(requiresKey).not.toBeChecked();
  await expect(
    page.getByText(
      'This service runs without an API key. Add one only if the endpoint asks for it.',
    ),
  ).toBeVisible();
  await expect
    .poll(async () => (await readAIServices(page))?.services[0])
    .toMatchObject({ provider: 'openrouter', requiresApiKey: false });

  await page.getByRole('button', { name: 'Verify Service' }).click();
  await expect(
    page.getByTestId('ai-service-status').getByText('Gateway responded successfully.'),
  ).toBeVisible();

  const chat = await askAI(page, extensionId, 'Hello?');
  await expect(chat.getByText('Hello from the gateway.')).toBeVisible();

  expect(seen.map(({ path }) => path)).toEqual(['/v1/models', '/v1/chat/completions']);
  expect(seen.map(({ authorization }) => authorization)).toEqual([null, null]);
});

test('[mocked provider contract] a service that refuses a keyless request says it needs a key', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await seedGateway(extensionWorker, false);
  const seen = await stubGateway(context, 401);

  await openAIOptions(page, extensionId);
  await page.getByRole('button', { name: 'Verify Service' }).click();
  await expect(page.getByTestId('ai-service-status').getByText(KEY_REQUIRED)).toBeVisible();

  const chat = await askAI(page, extensionId, 'Hello?');
  const alert = chat.getByRole('alert');
  await expect(alert.getByText(KEY_REQUIRED)).toBeVisible();
  const [options] = await Promise.all([
    context.waitForEvent('page'),
    alert.getByRole('button', { name: 'Open service settings' }).click(),
  ]);
  expect(new URL(options.url()).searchParams.get('service')).toBe('openrouter');
  await expect(options.getByRole('switch', { name: 'Requires an API key' })).not.toBeChecked();

  expect(seen.length).toBeGreaterThan(0);
  expect(seen.every(({ authorization }) => authorization === null)).toBe(true);
});
