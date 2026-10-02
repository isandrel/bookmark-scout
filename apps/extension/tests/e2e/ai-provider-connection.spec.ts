import type { BrowserContext, Page, Worker } from '@playwright/test';
import { expect, test, toastRegion } from './fixtures';
import { setSettings } from './popup-helpers';

// Website access is pre-granted, so Refresh and Verify never wait on the permission prompt.
test.use({ grantWebHostAccess: true });

const BASE_URL = 'https://provider.invalid/v1';

async function seedProvider(worker: Worker, provider: string, config: Record<string, string>) {
  await worker.evaluate(
    async ({ providerId, providerConfig }) => {
      await chrome.storage.local.set({ 'bookmark-scout-ai': { [providerId]: providerConfig } });
    },
    { providerId: provider, providerConfig: config },
  );
}

async function openAIOptions(page: Page, extensionId: string) {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByRole('tab', { name: 'AI', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Base URL' })).toBeVisible();
}

/** Serves an OpenAI-style model list, and counts requests that would spend tokens. */
async function mockModelList(context: BrowserContext, status = 200, body: unknown = {}) {
  const seen = { models: 0, generations: 0, authorization: '' };
  await context.route(`${BASE_URL}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/models')) {
      seen.models += 1;
      seen.authorization = (await route.request().headerValue('authorization')) ?? '';
      await route.fulfill({
        status,
        headers: { 'access-control-allow-origin': '*' },
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
      return;
    }
    seen.generations += 1;
    await route.fulfill({ status: 500, body: 'unexpected generation request' });
  });
  return seen;
}

test('[mocked provider contract] Refresh Models lists models and keeps them after a reload', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, {
    language: 'en',
    aiEnabled: true,
    aiProvider: 'custom',
    aiModel: 'gpt-4o-mini',
  });
  await seedProvider(extensionWorker, 'custom', { apiKey: 'synthetic-key', baseUrl: BASE_URL });
  const seen = await mockModelList(context, 200, {
    data: [{ id: 'listed-model-b' }, { id: 'listed-model-a' }],
  });

  await openAIOptions(page, extensionId);
  await page.getByRole('button', { name: 'Refresh Models' }).click();
  await expect(
    toastRegion(page).getByText('2 models found from Custom Provider.'),
  ).toBeVisible();
  expect(seen.authorization).toBe('Bearer synthetic-key');

  const model = page.getByRole('combobox', { name: 'AI Model' });
  await expect(model).toHaveText('listed-model-a');
  await page.reload();
  await page.getByRole('tab', { name: 'AI', exact: true }).click();
  await model.click();
  // The cached list is offered again without a new request, next to the chosen model.
  await expect(page.getByRole('option', { name: 'listed-model-b', exact: true })).toBeVisible();
  expect(seen.models).toBe(1);
  expect(seen.generations).toBe(0);
});

test('[mocked provider contract] Verify Service checks the model list instead of generating', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, {
    language: 'en',
    aiEnabled: true,
    aiProvider: 'custom',
    aiModel: 'gpt-4o-mini',
  });
  await seedProvider(extensionWorker, 'custom', { apiKey: 'synthetic-key', baseUrl: BASE_URL });
  const seen = await mockModelList(context, 200, { data: [{ id: 'other-model' }] });

  await openAIOptions(page, extensionId);
  await page.getByRole('button', { name: 'Verify Service' }).click();
  await expect(
    toastRegion(page).getByText(
      'Connected to Custom Provider, but gpt-4o-mini is not in its model list. Pick another model.',
    ),
  ).toBeVisible();
  expect(seen.models).toBe(1);
  expect(seen.generations).toBe(0);
});

test('[mocked provider contract] Verify Service explains a rejected key', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en', aiEnabled: true, aiProvider: 'custom' });
  await seedProvider(extensionWorker, 'custom', { apiKey: 'synthetic-key', baseUrl: BASE_URL });
  await mockModelList(context, 401, { error: { message: 'Incorrect API key' } });

  await openAIOptions(page, extensionId);
  await page.getByRole('button', { name: 'Verify Service' }).click();
  await expect(
    toastRegion(page).getByText(
      'The provider rejected the API key. Check that it is correct and still active.',
    ),
  ).toBeVisible();
});
