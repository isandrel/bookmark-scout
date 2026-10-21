/**
 * AI onboarding for newcomers: the "AI is optional" box in Options > AI, the provider picker that
 * lists well-known providers first, the "Get a key" link, and AI buttons that wait until a default
 * service is set up (a "Finish AI setup" line instead).
 */
import { expect, test } from './fixtures';
import { openPopup } from './popup-helpers';
import { seedAIServices, setSettings } from './storage';

const AI_BUTTON = 'AI folder recommendation';

test('Options > AI explains AI before the switch until a service is set up', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en' });
  await page.goto(`chrome-extension://${extensionId}/options.html?category=ai`);

  const intro = page.getByTestId('ai-intro');
  await expect(intro.getByRole('heading', { name: 'AI is optional' })).toBeVisible();
  await expect(intro).toContainText('an account with an AI company');
  await expect(intro).toContainText('Ollama');
  await expect(intro).toContainText('may charge a small amount');
  await expect(intro).toContainText('Page text only with Read page content on');
  const guide = intro.getByRole('link', { name: 'Read the AI guide' });
  await expect(guide).toHaveAttribute('href', /^https:\/\/[^/]+\/guides\/ai-tools$/);
  // Above the AI Features switch.
  const introBox = await intro.boundingBox();
  const switchBox = await page.locator('[data-setting="aiEnabled"]').boundingBox();
  expect(introBox && switchBox && introBox.y < switchBox.y).toBe(true);

  // Once the default service has its key, the box gives the room back.
  await seedAIServices(extensionWorker, [
    { provider: 'openai', credentials: { apiKey: 'sk-e2e-test-key' } },
  ]);
  await expect(intro).toHaveCount(0);
});

test('Add service lists well-known providers first, the catalog by search, and a key link', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en' });
  await page.goto(`chrome-extension://${extensionId}/options.html?category=ai`);

  await page.getByRole('button', { name: 'Add service' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add an AI service' });
  await dialog.getByRole('combobox', { name: 'Provider' }).click();
  const popup = page.locator('[data-slot="searchable-select-popup"]');
  await expect(popup.getByRole('option', { name: 'OpenAI', exact: true })).toBeVisible();
  await expect(popup.getByRole('option', { name: 'Ollama (Local)', exact: true })).toBeVisible();
  // Every listed provider has an icon: its logo, or a generic one for its kind (a local program,
  // a custom endpoint) when it has no logo.
  const iconless = await popup
    .getByRole('option')
    .evaluateAll((options) =>
      options
        .filter(
          (option) => !option.querySelector('[data-slot="option-icon"], svg:not(.lucide-check)'),
        )
        .map((option) => option.textContent),
    );
  expect(iconless).toEqual([]);
  // The long catalog waits for a search, and the line under the list says so.
  await expect(popup.getByText('More providers (models.dev)')).toHaveCount(0);
  await expect(popup.locator('[data-slot="searchable-select-hint"]')).toHaveText(
    /^Type to search \d+ more providers$/,
  );
  await popup.getByRole('combobox', { name: 'Search...' }).fill('Hugging');
  await expect(popup.getByText('More providers (models.dev)')).toBeVisible();
  await expect(popup.locator('[data-slot="searchable-select-hint"]')).toHaveCount(0);
  await popup.getByRole('combobox', { name: 'Search...' }).fill('OpenAI');
  await popup.getByRole('option', { name: 'OpenAI', exact: true }).click();
  await dialog.getByRole('button', { name: 'Add service' }).click();
  await expect(dialog).toHaveCount(0);

  // The key field links to where OpenAI hands out keys.
  const keyLink = page.getByTestId('ai-provider-key-link');
  await expect(keyLink).toHaveText('Get an API key from OpenAI');
  await expect(keyLink).toHaveAttribute('href', 'https://platform.openai.com/api-keys');
});

test('with AI on but no service set up, the popup shows Finish AI setup instead of AI buttons', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en', aiEnabled: true });
  // A service without its API key is not set up either.
  await seedAIServices(extensionWorker, [{ provider: 'openai' }]);
  await openPopup(page, extensionId);

  const notice = page.getByTestId('ai-setup-notice');
  await expect(notice).toContainText('AI is on but not set up yet');
  await expect(page.getByRole('button', { name: AI_BUTTON })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Ask AI about your bookmarks or this page' }),
  ).toHaveCount(0);
  // It takes the footer line the quick save tips use, so there is one line, not two.
  await expect(page.getByTestId('quick-save-shortcut-notice')).toHaveCount(0);

  const [options] = await Promise.all([
    context.waitForEvent('page'),
    notice.getByRole('button', { name: 'Finish AI setup' }).click(),
  ]);
  await expect(options).toHaveURL(`chrome-extension://${extensionId}/options.html?category=ai`);

  // With the key saved, the AI buttons come back and the line goes.
  await seedAIServices(extensionWorker, [
    { provider: 'openai', credentials: { apiKey: 'sk-e2e-test-key' } },
  ]);
  await expect(page.getByRole('button', { name: AI_BUTTON })).toBeVisible();
  await expect(notice).toHaveCount(0);
});

test('with AI off, the popup shows neither AI buttons nor the setup line', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en' });
  await openPopup(page, extensionId);
  await expect(page.getByRole('button', { name: 'Open bookmark manager' })).toBeVisible();
  await expect(page.getByRole('button', { name: AI_BUTTON })).toHaveCount(0);
  await expect(page.getByTestId('ai-setup-notice')).toHaveCount(0);
});
