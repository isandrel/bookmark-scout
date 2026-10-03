import { expect, test } from './fixtures';
import { openAIOptions } from './ai-helpers';
import { setSettings } from './popup-helpers';

test.use({ grantWebHostAccess: true });

const BASE_URL = 'https://provider.invalid/v1';

test('[mocked provider contract] AI activity records a request with its key redacted, only while on', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, {
    language: 'en',
    aiEnabled: true,
    aiProvider: 'custom',
    aiModel: 'listed-model',
  });
  await extensionWorker.evaluate(async (baseUrl) => {
    await chrome.storage.local.set({
      'bookmark-scout-ai': { custom: { apiKey: 'synthetic-activity-key', baseUrl } },
    });
  }, BASE_URL);
  await context.route(`${BASE_URL}/models`, (route) =>
    route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*' },
      contentType: 'application/json',
      body: JSON.stringify({ data: [{ id: 'listed-model' }] }),
    }),
  );

  await openAIOptions(page, extensionId);
  const activity = page.getByTestId('ai-activity');
  const entries = activity.getByTestId('ai-activity-entry');

  // Off by default: a check leaves no trace.
  await page.getByRole('button', { name: 'Verify Service' }).click();
  await expect(page.getByTestId('ai-service-status').getByText('Custom Provider responded successfully.')).toBeVisible();
  await expect(entries).toHaveCount(0);

  await activity.getByRole('switch', { name: 'Record requests' }).click();
  await expect(activity.getByText('No AI requests yet.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Verify Service' }).click();
  await expect(entries).toHaveCount(1);
  const entry = entries.first();
  await expect(entry).toContainText('Verify Service');
  await expect(entry).toContainText('GET provider.invalid/v1/models');
  await expect(entry).toContainText('200');

  await entry.locator('summary').click();
  await expect(entry).toContainText('Request headers');
  await expect(entry).toContainText('[redacted]');
  await expect(entry).toContainText('listed-model');
  await expect(entry).not.toContainText('synthetic-activity-key');
  const stored = await extensionWorker.evaluate(async () =>
    JSON.stringify(await chrome.storage.local.get('bookmark-scout-ai-activity')),
  );
  expect(stored).not.toContain('synthetic-activity-key');

  // Turning recording off deletes the log.
  await activity.getByRole('switch', { name: 'Record requests' }).click();
  await expect(entries).toHaveCount(0);
});
