import type { BrowserContext, Worker } from '@playwright/test';
import { expect, test } from './fixtures';
import { openAIOptions, openMoreSettings, readAIServices } from './ai-helpers';
import { setSettings } from './popup-helpers';
import { seedAIServices } from './storage';

// Website access is pre-granted, so Refresh and Verify never wait on the permission prompt.
test.use({ grantWebHostAccess: true });

const BASE_URL = 'https://provider.invalid/v1';

/** A custom service with a synthetic key and the mocked Base URL. */
async function seedCustomService(worker: Worker, model?: string) {
  await seedAIServices(worker, [
    {
      provider: 'custom',
      name: 'Custom Provider',
      model,
      credentials: { apiKey: 'synthetic-key', baseUrl: BASE_URL },
    },
  ]);
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
  await setSettings(extensionWorker, { language: 'en', aiEnabled: true });
  await seedCustomService(extensionWorker, 'gpt-4o-mini');
  const seen = await mockModelList(context, 200, {
    data: [{ id: 'listed-model-b' }, { id: 'listed-model-a' }],
  });

  await openAIOptions(page, extensionId);
  await page.getByRole('button', { name: 'Refresh Models' }).click();
  await expect(
    page.getByTestId('ai-service-status').getByText('2 models found from Custom Provider.'),
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
  await setSettings(extensionWorker, { language: 'en', aiEnabled: true });
  await seedCustomService(extensionWorker, 'gpt-4o-mini');
  const seen = await mockModelList(context, 200, { data: [{ id: 'other-model' }] });

  await openAIOptions(page, extensionId);
  await page.getByRole('button', { name: 'Verify Service' }).click();
  await expect(
    page
      .getByTestId('ai-service-status')
      .getByText(
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
  await setSettings(extensionWorker, { language: 'en', aiEnabled: true });
  await seedCustomService(extensionWorker);
  await mockModelList(context, 401, { error: { message: 'Incorrect API key' } });

  await openAIOptions(page, extensionId);
  await page.getByRole('button', { name: 'Verify Service' }).click();
  await expect(
    page
      .getByTestId('ai-service-status')
      .getByText('The provider rejected the API key. Check that it is correct and still active.'),
  ).toBeVisible();
});

test('[mocked provider contract] the provider picker searches the catalog and lists its models', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en', aiEnabled: true });
  let authorization = '';
  await context.route('https://api.together.xyz/v1/**', async (route) => {
    authorization = (await route.request().headerValue('authorization')) ?? '';
    await route.fulfill({
      headers: { 'access-control-allow-origin': '*' },
      contentType: 'application/json',
      body: JSON.stringify({ data: [{ id: 'together/model-a' }] }),
    });
  });

  await openAIOptions(page, extensionId);
  await page.getByRole('button', { name: 'Add service' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add an AI service' });
  await dialog.getByRole('combobox', { name: 'Provider' }).click();
  await page.getByRole('combobox', { name: 'Search...' }).fill('togeth');
  await expect(page.getByRole('option')).toHaveCount(1);
  await page.getByRole('option', { name: 'Together AI', exact: true }).click();
  await dialog.getByRole('button', { name: 'Add service' }).click();
  const service = page.getByTestId('ai-service').filter({ hasText: 'Together AI' });
  await expect
    .poll(async () => (await readAIServices(page))?.services.at(-1)?.provider)
    .toBe('togetherai');
  await expect(service.getByTestId('ai-provider-info')).toContainText('models.dev catalog');
  await openMoreSettings(page);
  await expect(service.getByRole('textbox', { name: 'Base URL' })).toHaveAttribute(
    'placeholder',
    'https://api.together.xyz/v1',
  );

  const apiKey = service.getByLabel('API Key', { exact: true });
  await apiKey.fill('synthetic-key');
  await apiKey.blur();
  await service.getByRole('button', { name: 'Refresh Models' }).click();
  await expect(service.getByRole('combobox', { name: 'AI Model' })).toHaveText('together/model-a');
  expect(authorization).toBe('Bearer synthetic-key');
});

test('a second check keeps the last result and the buttons in place while it runs', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en', aiEnabled: true });
  await seedCustomService(extensionWorker, 'listed-model-a');
  let release: () => void = () => {};
  let hold = false;
  await context.route(`${BASE_URL}/**`, async (route) => {
    if (hold) await new Promise<void>((resolve) => (release = resolve));
    await route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*' },
      contentType: 'application/json',
      body: JSON.stringify({ data: [{ id: 'listed-model-a' }] }),
    });
  });

  await openAIOptions(page, extensionId);
  const refresh = page.getByRole('button', { name: 'Refresh Models' });
  const verify = page.getByRole('button', { name: 'Verify Service' });
  const status = page.getByTestId('ai-service-status');
  await refresh.click();
  await expect(status.getByText('1 models found from Custom Provider.')).toBeVisible();
  const before = { refresh: await refresh.boundingBox(), verify: await verify.boundingBox() };
  const statusBefore = await status.boundingBox();

  // While the next check waits on the provider, nothing moves: the last result stays (dimmed)
  // and the busy label takes no more or less room than the idle one.
  hold = true;
  await refresh.click();
  await expect(page.getByRole('button', { name: 'Refreshing...' })).toBeDisabled();
  await expect(status).toHaveAttribute('data-stale', '');
  expect(await status.boundingBox()).toEqual(statusBefore);
  expect(await page.getByRole('button', { name: 'Refreshing...' }).boundingBox()).toEqual(
    before.refresh,
  );
  expect(await verify.boundingBox()).toEqual(before.verify);

  release();
  await expect(status).not.toHaveAttribute('data-stale', '');
  await expect(refresh).toBeEnabled();
});
