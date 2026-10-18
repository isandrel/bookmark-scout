import { readFileSync } from 'node:fs';
import path from 'node:path';
import { appRoot, readConfigToml } from '../config-files';
import { expect, test } from './fixtures';
import { STORAGE_ITEMS, seedAIServices } from './storage';
import { openTools, seedFolder, setSettings, toolCard } from './tool-helpers';

test('[mocked provider contract] a custom prompt saved in Options is what auto-tagging sends', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  const { folderId, ids } = await seedFolder(extensionWorker, 'E2E Prompt Library', [
    { title: 'Prompt Fixture', url: 'https://e2e.invalid/prompt-fixture' },
  ]);
  await setSettings(extensionWorker, {
    language: 'en',
    aiEnabled: true,
    autoTaggingEnabled: true,
    autoTaggingMaxTags: 3,
  });
  await seedAIServices(extensionWorker, [
    {
      provider: 'custom',
      model: 'e2e-model',
      credentials: { baseUrl: 'https://prompt.e2e.invalid/v1' },
    },
  ]);
  const bodies: string[] = [];
  await context.route('https://prompt.e2e.invalid/v1/**', async (route) => {
    bodies.push(route.request().postData() ?? '');
    const content = JSON.stringify({
      items: [
        { bookmarkId: ids['Prompt Fixture'], title: 'Prompt Fixture', tags: ['e2e'], reason: 'r' },
      ],
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        id: 'chat-e2e',
        model: 'e2e-model',
        choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }],
      }),
    });
  });

  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByRole('tab', { name: 'AI Tools', exact: true }).click();
  const row = page.getByTestId('prompt-task').filter({ hasText: 'Auto-Tagging' });
  await row.getByRole('button', { name: 'Customize' }).click();
  const editor = page.getByRole('dialog', { name: /New prompt/ });
  await editor.getByLabel('Name').fill('Terse tags');
  const text = editor.getByRole('textbox', { name: 'Prompt', exact: true });
  await text.fill('CUSTOM PROMPT: at most ');
  await editor.getByRole('button', { name: '{{maxTags}}' }).click();
  await expect(text).toHaveValue('CUSTOM PROMPT: at most {{maxTags}}');
  await text.press('End');
  await text.pressSequentially(' in ');
  await editor.getByRole('button', { name: '{{language}}' }).click();
  await expect(text).toHaveValue('CUSTOM PROMPT: at most {{maxTags}} in {{language}}');
  await editor.getByText('Preview with current settings').click();
  await expect(editor.locator('pre')).toHaveText('CUSTOM PROMPT: at most 3 in English');
  await editor.getByRole('button', { name: 'Save prompt' }).click();
  await expect(editor).toHaveCount(0);
  await expect(row.getByRole('combobox')).toHaveText('Terse tags');

  await openTools(page, extensionId, folderId);
  await toolCard(page, 'Auto-Tagging').getByRole('button', { name: 'Analyze' }).click();
  await expect(page.getByRole('dialog', { name: 'Auto-Tagging' })).toContainText('Prompt Fixture');
  expect(bodies).toHaveLength(1);
  expect(bodies[0]).toContain('CUSTOM PROMPT: at most 3 in English');
  expect(bodies[0]).not.toContain('You are a bookmark tagging assistant');
});

test('[mocked provider contract] auto-tagging asks for the AI output language: the extension language, then each page', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  const ja = JSON.parse(
    readFileSync(path.join(appRoot, 'public/_locales/ja/messages.json'), 'utf8'),
  ) as Record<string, { message: string }>;
  const { folderId, ids } = await seedFolder(extensionWorker, 'E2E Output Language', [
    { title: 'Language Fixture', url: 'https://e2e.invalid/language-fixture' },
  ]);
  // The extension in Japanese, and AI output language left at its default (the extension's).
  await setSettings(extensionWorker, { language: 'ja', aiEnabled: true, autoTaggingEnabled: true });
  await seedAIServices(extensionWorker, [
    {
      provider: 'custom',
      model: 'e2e-model',
      credentials: { baseUrl: 'https://language.e2e.invalid/v1' },
    },
  ]);
  const systems: string[] = [];
  await context.route('https://language.e2e.invalid/v1/**', async (route) => {
    const body = route.request().postDataJSON() as { messages: { role: string; content: string }[] };
    systems.push(body.messages.find((message) => message.role === 'system')?.content ?? '');
    const content = JSON.stringify({
      items: [{ bookmarkId: ids['Language Fixture'], title: 'Language Fixture', tags: ['e2e'] }],
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        id: 'chat-e2e',
        model: 'e2e-model',
        choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }],
      }),
    });
  });

  const analyze = async () => {
    await page.goto(`chrome-extension://${extensionId}/bookmarks.html?id=${folderId}`);
    await page.getByTitle(ja.bookmarks_showTools.message).click();
    await toolCard(page, ja.tools_autoTagging.message)
      .getByRole('button', { name: ja.action_analyze.message })
      .click();
    await expect(page.getByRole('dialog', { name: ja.tools_autoTagging.message })).toContainText(
      'Language Fixture',
    );
  };

  await analyze();
  expect(systems).toHaveLength(1);
  expect(systems[0]).toContain(
    'Write all free text (summaries, reasons, new tag and folder names) in Japanese (日本語).',
  );

  await setSettings(extensionWorker, { aiOutputLanguage: 'page' });
  await analyze();
  expect(systems).toHaveLength(2);
  expect(systems[1]).toContain(
    'in the same language as each page or bookmark title (if unclear, Japanese (日本語)).',
  );
});

test('the built-in prompt can be viewed and used as the start of a custom one', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en', autoTaggingMaxTags: 4 });
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByRole('tab', { name: 'AI Tools', exact: true }).click();

  await page.getByRole('button', { name: 'View the built-in prompt for Auto-Tagging' }).click();
  const viewer = page.getByRole('dialog', { name: /Built-in prompt/ });
  await expect(viewer.getByTestId('built-in-prompt')).toContainText('{{maxTags}}');
  await viewer.getByText('Preview with current settings').click();
  await expect(viewer).toContainText('Suggest 2-4 tags per bookmark');

  await viewer.getByRole('button', { name: 'Customize' }).click();
  const editor = page.getByRole('dialog', { name: /New prompt/ });
  await expect(editor.getByRole('textbox', { name: 'Prompt' })).toHaveValue(/\{\{maxTags\}\}/);
});

test('the prompt size counter and limit count the prompt as sync storage stores it', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const { prompt_max_bytes: maxBytes } = readConfigToml('ai/prompt-library.toml') as {
    prompt_max_bytes: number;
  };
  const kilobytes = (bytes: number) => `${Math.round((bytes / 1024) * 10) / 10} KB`;
  await setSettings(extensionWorker, { language: 'en' });
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByRole('tab', { name: 'AI Tools', exact: true }).click();
  const row = page.getByTestId('prompt-task').filter({ hasText: 'Auto-Tagging' });
  await row.getByRole('button', { name: 'Customize' }).click();
  const editor = page.getByRole('dialog', { name: /New prompt/ });

  const text = editor.getByRole('textbox', { name: 'Prompt', exact: true });
  const size = editor.locator('#prompt-text-size');
  // The prompt counts as it is stored: its text plus the name and other saved fields.
  const limit = kilobytes(maxBytes).replace('.', '\\.');
  await text.fill('x'.repeat(2048));
  await expect(size).toHaveText(new RegExp(`^2\\.[1-2] KB of ${limit}$`));

  // Quotes take two bytes each once stored, so this is over the limit although the text is not,
  // and the counter, the error, and the limit all use the same unit.
  await text.fill('"'.repeat(maxBytes - 10));
  await expect(size).toHaveText(new RegExp(`^13\\.[7-8] KB of ${limit}$`));
  await expect(size).toHaveClass(/text-destructive-text/);
  await editor.getByRole('button', { name: 'Save prompt' }).click();
  await expect(editor.getByRole('alert')).toHaveText(
    `The prompt is too long to sync. Keep it within ${kilobytes(maxBytes)}.`,
  );
  await expect(editor).toBeVisible();
  const stored = await extensionWorker.evaluate(
    async (prefix) =>
      Object.keys(await chrome.storage.sync.get(null)).filter((key) => key.startsWith(prefix)),
    `${STORAGE_ITEMS.prompt.name}/`,
  );
  expect(stored).toEqual([]);

  // A storage failure, such as a full sync area, shows a localized message, not the browser's.
  await text.fill('Short prompt');
  await page.evaluate(() => {
    (chrome.storage.sync as { set: unknown }).set = () =>
      Promise.reject(new Error('QUOTA_BYTES quota exceeded'));
  });
  await editor.getByRole('button', { name: 'Save prompt' }).click();
  await expect(editor.getByRole('alert')).toHaveText(
    'The prompt could not be saved. Sync storage may be full; delete prompts you no longer use and try again.',
  );
});

test('deleting a custom prompt asks first and returns the task to its default', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en' });
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByRole('tab', { name: 'AI Tools', exact: true }).click();
  const row = page.getByTestId('prompt-task').filter({ hasText: 'Auto-Tagging' });
  await row.getByRole('button', { name: 'Customize' }).click();
  const editor = page.getByRole('dialog', { name: /New prompt/ });
  await editor.getByLabel('Name').fill('Short lived');
  await editor.getByRole('button', { name: 'Save prompt' }).click();
  await expect(row.getByRole('combobox')).toHaveText('Short lived');

  // Cancel keeps the prompt.
  await row.getByRole('button', { name: 'Delete Short lived' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete Short lived?' });
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toHaveCount(0);
  await expect(row.getByRole('combobox')).toHaveText('Short lived');

  await row.getByRole('button', { name: 'Delete Short lived' }).click();
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await expect(row.getByRole('combobox')).toHaveText('Default (built in)');
});
