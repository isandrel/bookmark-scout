import type { BrowserContext } from '@playwright/test';
import { expect, test } from './fixtures';

// The harness opens the popup as a tab, which gets no activeTab (the toolbar button grants it),
// so these tests grant the optional tabs permission to read the current page.
test.use({ grantPermissions: ['tabs'] });

const SERVICES = {
  services: [
    { id: 'custom-work', name: 'Work proxy', provider: 'custom', model: 'work-model', enabled: true },
    { id: 'custom-home', name: 'Home proxy', provider: 'custom', model: 'home-model', enabled: true },
  ],
  defaultServiceId: 'custom-work',
};

/** Answers chat completions for both proxies and records which host and model each call used. */
async function stubProxies(context: BrowserContext) {
  const calls: { host: string; model: string }[] = [];
  const text = JSON.stringify({
    recommendations: [
      { type: 'existing', confidence: 0.9, folderPath: 'Reading', parentPath: '', reason: 'Fixture' },
    ],
  });
  for (const host of ['work.e2e.invalid', 'home.e2e.invalid']) {
    await context.route(`https://${host}/v1/**`, async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}') as { model?: string };
      calls.push({ host, model: body.model ?? '' });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({
          id: 'chat-e2e',
          model: body.model,
          choices: [
            { index: 0, finish_reason: 'stop', message: { role: 'assistant', content: text } },
          ],
        }),
      });
    });
  }
  return calls;
}

test('[mocked provider contract] two services of one provider keep their own endpoints and the popup switches between them', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await extensionWorker.evaluate(async (services) => {
    await chrome.storage.sync.set({
      'bookmark-scout-settings': {
        language: 'en',
        aiEnabled: true,
        aiMaxRecommendations: 1,
        aiAutoTriggerOnOpen: false,
        recentFoldersEnabled: false,
      },
    });
    await chrome.storage.local.set({
      'bookmark-scout-ai-services': services,
      'bookmark-scout-ai': {
        'custom-work': { baseUrl: 'https://work.e2e.invalid/v1', apiKey: 'work-key' },
        'custom-home': { baseUrl: 'https://home.e2e.invalid/v1', apiKey: 'home-key' },
      },
    });
    const [root] = await chrome.bookmarks.getTree();
    const writableRoot = root.children?.find((node) => node.children !== undefined);
    if (writableRoot) await chrome.bookmarks.create({ parentId: writableRoot.id, title: 'Reading' });
  }, SERVICES);
  const calls = await stubProxies(context);

  await context.route('https://current.e2e.invalid/article', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<title>E2E Article</title>' }),
  );
  await page.goto('https://current.e2e.invalid/article');
  const tabId = await extensionWorker.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    return tabs.find((tab) => tab.url === 'https://current.e2e.invalid/article')?.id;
  });
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await extensionWorker.evaluate((id) => chrome.tabs.update(id ?? 0, { active: true }), tabId);

  await popup.getByTitle('AI folder recommendation').click();
  await expect.poll(() => calls.length).toBe(1);
  expect(calls[0]).toEqual({ host: 'work.e2e.invalid', model: 'work-model' });

  const switcher = popup.getByTestId('ai-service-switcher');
  await expect(switcher).toHaveAccessibleName('AI service: Work proxy');
  await switcher.click();
  await popup.getByRole('menuitemradio', { name: /Home proxy/ }).click();
  await expect(switcher).toHaveAccessibleName('AI service: Home proxy');
  await expect
    .poll(() =>
      extensionWorker.evaluate(async () => {
        const stored = await chrome.storage.local.get('bookmark-scout-ai-services');
        return (stored['bookmark-scout-ai-services'] as { defaultServiceId?: string })
          .defaultServiceId;
      }),
    )
    .toBe('custom-home');

  await popup.getByTitle('AI folder recommendation').click();
  await expect.poll(() => calls.length).toBe(2);
  expect(calls[1]).toEqual({ host: 'home.e2e.invalid', model: 'home-model' });
});

test('Options lists saved services and Set as default moves the badge', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await extensionWorker.evaluate(async (services) => {
    await chrome.storage.sync.set({ 'bookmark-scout-settings': { language: 'en' } });
    await chrome.storage.local.set({ 'bookmark-scout-ai-services': services });
  }, SERVICES);

  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByRole('tab', { name: 'AI', exact: true }).click();
  const work = page.getByTestId('ai-service').filter({ hasText: 'Work proxy' });
  const home = page.getByTestId('ai-service').filter({ hasText: 'Home proxy' });
  await expect(work).toContainText('Default');
  await expect(home).not.toContainText('Default');

  await home.getByRole('button', { name: 'Actions for Home proxy' }).click();
  await page.getByRole('menuitem', { name: 'Set as default' }).click();
  await expect(home).toContainText('Default');
  await expect(work).not.toContainText('Default');

  await work.getByRole('button', { name: 'Actions for Work proxy' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByRole('dialog', { name: 'Delete Work proxy?' }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByTestId('ai-service')).toHaveCount(1);
  // The menu that opened the dialog went with the row, so focus moves to the next service.
  await expect(page.getByRole('button', { name: 'Edit Home proxy' })).toBeFocused();

  // Cancel still returns focus to the menu button.
  await home.getByRole('button', { name: 'Actions for Home proxy' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  const confirmHome = page.getByRole('dialog', { name: 'Delete Home proxy?' });
  await confirmHome.getByRole('button', { name: 'Cancel' }).click();
  await expect(home.getByRole('button', { name: 'Actions for Home proxy' })).toBeFocused();

  // With no service left, focus moves to Add service.
  await home.getByRole('button', { name: 'Actions for Home proxy' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await confirmHome.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByTestId('ai-service')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add service' })).toBeFocused();
});

test('an API key field shows the key format, or says required or optional in the Options language', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await extensionWorker.evaluate(async (services) => {
    await chrome.storage.sync.set({ 'bookmark-scout-settings': { language: 'ja' } });
    await chrome.storage.local.set({ 'bookmark-scout-ai-services': services });
  }, SERVICES);
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByRole('tab', { name: 'AI', exact: true }).click();
  await expect(page.getByLabel('APIキー', { exact: true })).toHaveAttribute('placeholder', '任意');

  // Providers once showed English prose here ("(Optional)", "Required", "Azure API key").
  const cases = [
    { language: 'ja', label: 'APIキー', provider: 'ollama', placeholder: '任意' },
    { language: 'ja', label: 'APIキー', provider: 'jan', placeholder: '必須' },
    { language: 'ko', label: 'API 키', provider: 'azure', placeholder: '필수' },
    { language: 'ko', label: 'API 키', provider: 'cliproxyapi', placeholder: '선택 사항' },
    { language: 'ko', label: 'API 키', provider: 'openai', placeholder: 'sk-...' },
  ];
  for (const { language, label, provider, placeholder } of cases) {
    await extensionWorker.evaluate(
      async ({ language, provider }) => {
        await chrome.storage.sync.set({ 'bookmark-scout-settings': { language } });
        await chrome.storage.local.set({
          'bookmark-scout-ai-services': {
            services: [{ id: provider, name: provider, provider, model: 'm', enabled: true }],
            defaultServiceId: provider,
          },
        });
      },
      { language, provider },
    );
    await page.reload();
    await page.getByRole('tab', { name: 'AI', exact: true }).click();
    await expect(page.getByLabel(label, { exact: true }), provider).toHaveAttribute(
      'placeholder',
      placeholder,
    );
  }
});
