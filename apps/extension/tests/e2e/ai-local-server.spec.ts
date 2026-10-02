import type { Page } from '@playwright/test';
import { expect, test, toastRegion } from './fixtures';
import { childrenOf, openTools, seedFolder, setSettings, toolCard } from './tool-helpers';

/**
 * Opt-in checks against a real local OpenAI-compatible server, such as CLIProxyAPI, which routes
 * requests through your own Claude, Gemini, or Codex accounts. Skipped unless
 * BOOKMARK_SCOUT_LOCAL_AI_KEY is set, so CI and machines without the server never run them.
 *
 *   BOOKMARK_SCOUT_LOCAL_AI_KEY=<key from the server's api-keys>
 *   BOOKMARK_SCOUT_LOCAL_AI_MODEL=<a model the server can answer with>   (required for prompts)
 *   BOOKMARK_SCOUT_LOCAL_AI_PROVIDER=cliproxyapi                          (optional)
 *   BOOKMARK_SCOUT_LOCAL_AI_BASE_URL=http://localhost:8317/v1             (optional)
 */
const KEY = process.env.BOOKMARK_SCOUT_LOCAL_AI_KEY ?? '';
const MODEL = process.env.BOOKMARK_SCOUT_LOCAL_AI_MODEL ?? '';
const PROVIDER = process.env.BOOKMARK_SCOUT_LOCAL_AI_PROVIDER ?? 'cliproxyapi';
const BASE_URL = process.env.BOOKMARK_SCOUT_LOCAL_AI_BASE_URL ?? '';

test.skip(!KEY, 'Set BOOKMARK_SCOUT_LOCAL_AI_KEY to run checks against a real local AI server.');
test.use({ grantWebHostAccess: true });
// Real models answer in seconds, not milliseconds.
test.setTimeout(120_000);

async function openAIOptions(page: Page, extensionId: string) {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByRole('tab', { name: 'AI', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Base URL' })).toBeVisible();
}

test('[real local server] Refresh Models and Verify Service reach the local server', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en', aiEnabled: true, aiProvider: 'openai' });
  await openAIOptions(page, extensionId);

  const provider = page.getByRole('combobox', { name: 'AI Provider' });
  await provider.click();
  await page.getByRole('combobox', { name: 'Search...' }).fill('CLIProxy');
  await page.getByRole('option', { name: 'CLIProxyAPI', exact: true }).click();
  await expect
    .poll(() =>
      extensionWorker.evaluate(async () => {
        const stored = await chrome.storage.sync.get('bookmark-scout-settings');
        return (stored['bookmark-scout-settings'] as { aiProvider?: string }).aiProvider;
      }),
    )
    .toBe(PROVIDER);

  const apiKey = page.getByLabel('API Key', { exact: true });
  await apiKey.fill(KEY);
  await apiKey.blur();
  if (BASE_URL) {
    const baseUrl = page.getByRole('textbox', { name: 'Base URL' });
    await baseUrl.fill(BASE_URL);
    await baseUrl.blur();
  }

  await page.getByRole('button', { name: 'Refresh Models' }).click();
  await expect(toastRegion(page).getByText(/^\d+ models found from CLIProxyAPI\.$/)).toBeVisible({
    timeout: 15_000,
  });

  if (MODEL) {
    await page.getByRole('combobox', { name: 'AI Model' }).click();
    await page.getByRole('option', { name: MODEL, exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'AI Model' })).toHaveText(MODEL);
  }
  await page.getByRole('button', { name: 'Verify Service' }).click();
  await expect(toastRegion(page).getByText('Service verified', { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  if (MODEL) {
    await expect(toastRegion(page).getByText('CLIProxyAPI responded successfully.')).toBeVisible();
  }
});

test('[real local server] auto-tagging previews tags from a real model without changing bookmarks', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  test.skip(!MODEL, 'Set BOOKMARK_SCOUT_LOCAL_AI_MODEL to send a real prompt.');
  const { folderId } = await seedFolder(extensionWorker, 'E2E Local AI Tagging', [
    {
      title: 'MDN Web Docs: JavaScript reference',
      url: 'https://developer.mozilla.org/docs/Web/JavaScript',
    },
    { title: 'Rust Programming Language', url: 'https://www.rust-lang.org/' },
  ]);
  await setSettings(extensionWorker, {
    language: 'en',
    aiEnabled: true,
    aiProvider: PROVIDER,
    aiModel: MODEL,
    autoTaggingEnabled: true,
  });
  await extensionWorker.evaluate(
    async ({ provider, config }) => {
      await chrome.storage.local.set({ 'bookmark-scout-ai': { [provider]: config } });
    },
    { provider: PROVIDER, config: { apiKey: KEY, ...(BASE_URL ? { baseUrl: BASE_URL } : {}) } },
  );

  await openTools(page, extensionId, folderId);
  await toolCard(page, 'Auto-Tagging').getByRole('button', { name: 'Analyze' }).click();

  const preview = page.getByRole('dialog', { name: 'Auto-Tagging' });
  await expect(preview).toContainText('Rust Programming Language', { timeout: 90_000 });
  await expect(preview).toContainText('MDN Web Docs: JavaScript reference');
  const titles = (await childrenOf(extensionWorker, folderId)).map((item) => item.title).sort();
  expect(titles).toEqual(['MDN Web Docs: JavaScript reference', 'Rust Programming Language']);
});
