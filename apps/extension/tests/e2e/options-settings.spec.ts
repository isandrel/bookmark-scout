import type { Page, Worker } from '@playwright/test';
import { expect, test } from './fixtures';

const SETTINGS_KEY = 'bookmark-scout-settings';
const AI_KEY = 'bookmark-scout-ai';
const RECENT_KEY = 'bookmark-scout-recent-folders';

async function setSettings(worker: Worker, updates: Record<string, unknown>) {
  await worker.evaluate(
    async ({ key, values }) => {
      const stored = await chrome.storage.sync.get(key);
      await chrome.storage.sync.set({ [key]: { ...(stored[key] ?? {}), ...values } });
    },
    { key: SETTINGS_KEY, values: updates },
  );
}

async function readSettings(worker: Worker): Promise<Record<string, unknown>> {
  return worker.evaluate(async (key) => {
    const stored = await chrome.storage.sync.get(key);
    return (stored[key] ?? {}) as Record<string, unknown>;
  }, SETTINGS_KEY);
}

function settingRow(page: Page, key: string) {
  return page.locator(`[data-setting="${key}"]`);
}

async function openOptions(page: Page, extensionId: string) {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(page.getByRole('tab', { name: 'Appearance' })).toBeVisible();
}

test('non-default selects survive reload and never block saving other settings', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en', theme: 'dark', faviconSize: 32 });
  await openOptions(page, extensionId);

  await expect(page.getByRole('combobox', { name: 'Theme' })).toHaveText('Dark');
  await expect(page.getByRole('combobox', { name: 'Favicon Size' })).toHaveText('32px (Large)');
  await expect(page.getByRole('combobox', { name: 'Language' })).toHaveText('English');

  await page.getByRole('switch', { name: 'Show Favicons' }).click();
  await expect.poll(async () => (await readSettings(extensionWorker)).showFavicons).toBe(false);

  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Theme' })).toHaveText('Dark');
  await page.getByRole('switch', { name: 'Show Favicons' }).click();
  await expect
    .poll(() => readSettings(extensionWorker))
    .toMatchObject({ showFavicons: true, theme: 'dark', faviconSize: 32, language: 'en' });
  await expect(page.getByTestId('settings-save-status')).toHaveText('Settings saved');
  await expect(page.getByText(/Invalid settings|invalid_/)).toHaveCount(0);
});

test('changing the AI provider selects that provider default model and saves', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en' });
  await openOptions(page, extensionId);
  await page.getByRole('tab', { name: 'AI', exact: true }).click();

  await page.getByRole('combobox', { name: 'AI Provider' }).click();
  await page.getByRole('option', { name: 'Anthropic' }).click();
  await expect(page.getByRole('combobox', { name: 'AI Model' })).toHaveText('Claude Sonnet 4');
  await expect
    .poll(() => readSettings(extensionWorker))
    .toMatchObject({ aiProvider: 'anthropic', aiModel: 'claude-sonnet-4-20250514' });

  await page.getByRole('combobox', { name: 'AI Provider' }).click();
  await page.getByRole('option', { name: 'Custom Provider' }).click();
  await expect
    .poll(() => readSettings(extensionWorker))
    .toMatchObject({ aiProvider: 'custom', aiModel: 'gpt-4o-mini' });
  await expect(page.getByRole('combobox', { name: 'AI Model' })).toHaveText('Default Model');
});

test('list settings accept commas and status codes are validated inline', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en' });
  await openOptions(page, extensionId);
  await page.getByRole('tab', { name: 'Maintenance' }).click();

  const preserve = page.getByRole('textbox', { name: 'Preserve Parameters' });
  await preserve.fill('');
  await preserve.pressSequentially('ref, page');
  await expect(preserve).toHaveValue('ref, page');
  await preserve.blur();
  await expect
    .poll(async () => (await readSettings(extensionWorker)).urlCleanerPreserveParams)
    .toEqual(['ref', 'page']);

  const statuses = page.getByRole('textbox', { name: 'Success Status Codes' });
  await statuses.fill('200, 204');
  await statuses.press('Enter');
  await expect
    .poll(async () => (await readSettings(extensionWorker)).deadLinksSuccessStatuses)
    .toEqual([200, 204]);

  await statuses.fill('200, abc');
  await statuses.blur();
  await expect(settingRow(page, 'deadLinksSuccessStatuses').getByRole('alert')).toHaveText(
    'Enter HTTP status codes from 100 to 599, separated by commas.',
  );
  await expect(page.getByTestId('settings-save-status')).toHaveText('1 settings not saved');

  // An invalid field does not block other edits.
  await page.getByRole('switch', { name: 'Remove Fragments' }).click();
  await expect
    .poll(() => readSettings(extensionWorker))
    .toMatchObject({
      urlCleanerRemoveHash: expect.any(Boolean),
      deadLinksSuccessStatuses: [200, 204],
    });

  await statuses.fill('200');
  await statuses.blur();
  await expect(settingRow(page, 'deadLinksSuccessStatuses').getByRole('alert')).toHaveCount(0);
  await expect
    .poll(async () => (await readSettings(extensionWorker)).deadLinksSuccessStatuses)
    .toEqual([200]);
});

test('invalid text shows a localized inline error and is not silently saved', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'ja', defaultNewFolderName: 'Inbox' });
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByRole('tab', { name: '動作' }).click();
  const row = settingRow(page, 'defaultNewFolderName');
  await row.getByRole('textbox').fill('');
  await expect(row.getByRole('alert')).toHaveText('この項目は空にできません。');
  await expect(page.getByTestId('settings-save-status')).toHaveText('1 件の設定が未保存です');
  expect((await readSettings(extensionWorker)).defaultNewFolderName).toBe('Inbox');
  await expect(page.getByText('Modified')).toHaveCount(0);
});

test('partial import merges onto current settings and reports what changed', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en', defaultNewFolderName: 'Inbox' });
  await openOptions(page, extensionId);

  await page.getByLabel('Import', { exact: true }).setInputFiles({
    name: 'partial.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ theme: 'dark' })),
  });
  await expect(page.getByText('1 settings changed: Theme')).toBeVisible();
  await expect
    .poll(() => readSettings(extensionWorker))
    .toMatchObject({ theme: 'dark', defaultNewFolderName: 'Inbox' });

  await page.getByLabel('Import', { exact: true }).setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ theme: 'neon' })),
  });
  await expect(page.getByText('These settings have invalid values: Theme')).toBeVisible();
  expect((await readSettings(extensionWorker)).theme).toBe('dark');
});

test('theme is one synced setting applied live in every open page', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en', theme: 'light' });
  await openOptions(page, extensionId);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.locator('html')).toHaveClass(/light/);

  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect.poll(async () => (await readSettings(extensionWorker)).theme).toBe('dark');
  await expect(popup.locator('html')).toHaveClass(/dark/);
  // The toggle used to revert after the autosave debounce.
  await page.waitForTimeout(2_000);
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.getByRole('combobox', { name: 'Theme' })).toHaveText('Dark');

  // A change arriving through sync (another device, import) applies without reload.
  await setSettings(extensionWorker, { theme: 'light' });
  await expect(page.locator('html')).toHaveClass(/light/);
  await expect(popup.locator('html')).toHaveClass(/light/);
  await expect(page.getByRole('combobox', { name: 'Theme' })).toHaveText('Light');
});

test('rejected API keys and unsafe Base URLs are never persisted', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en', aiProvider: 'openai' });
  await openOptions(page, extensionId);
  await page.getByRole('tab', { name: 'AI', exact: true }).click();

  const readAI = () =>
    extensionWorker.evaluate(async (key) => {
      const stored = await chrome.storage.local.get(key);
      return (stored[key] ?? {}) as Record<string, Record<string, string>>;
    }, AI_KEY);

  const key = page.getByLabel('API Key', { exact: true });
  await key.fill('test-key-not-real');
  await key.blur();
  await expect(
    page.getByText("This doesn't look like an API key for OpenAI. It was not saved."),
  ).toBeVisible();

  const baseUrl = page.getByRole('textbox', { name: 'Base URL' });
  await baseUrl.fill('javascript:alert(1)');
  await baseUrl.blur();
  await expect(page.getByText('Enter a full http:// or https:// URL.')).toBeVisible();
  expect((await readAI()).openai?.apiKey).toBeUndefined();
  expect((await readAI()).openai?.baseUrl).toBeUndefined();

  await baseUrl.fill('https://proxy.example.invalid/v1');
  await baseUrl.blur();
  await expect
    .poll(async () => (await readAI()).openai?.baseUrl)
    .toBe('https://proxy.example.invalid/v1');
  expect((await readAI()).openai?.apiKey).toBeUndefined();

  await page.getByRole('button', { name: 'Show API key' }).click();
  await expect(page.getByRole('button', { name: 'Hide API key' })).toBeVisible();
});

test('settings search shows matches from every tab and controls have accessible names', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en' });
  await openOptions(page, extensionId);

  await page.getByRole('searchbox', { name: 'Search settings...' }).fill('status codes');
  await expect(page.getByText('1 matching settings in all tabs')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Success Status Codes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Maintenance' })).toBeVisible();

  await page.getByRole('searchbox', { name: 'Search settings...' }).fill('');
  await page.getByRole('tab', { name: 'AI', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Max Categories' })).toBeVisible();
  await expect(settingRow(page, 'aiMaxCategories')).toContainText('No limit');

  const unnamed = await page.evaluate(() =>
    [...document.querySelectorAll('[role="switch"], [role="combobox"], [role="slider"], button')]
      .filter((element) => {
        const labelledBy = element.getAttribute('aria-labelledby');
        const name =
          element.getAttribute('aria-label') ||
          (labelledBy && document.getElementById(labelledBy)?.textContent) ||
          element.textContent;
        return !name?.trim();
      })
      .map((element) => element.outerHTML.slice(0, 80)),
  );
  expect(unnamed).toEqual([]);
});

test('recent folders drop deleted folders and follow renames', async ({ extensionWorker }) => {
  const ids = await extensionWorker.evaluate(async (key) => {
    const [root] = await chrome.bookmarks.getTree();
    const parent = root.children?.find((node) => node.children !== undefined);
    if (!parent) throw new Error('No writable bookmark root found');
    const keep = await chrome.bookmarks.create({ parentId: parent.id, title: 'E2E Keep' });
    const drop = await chrome.bookmarks.create({ parentId: parent.id, title: 'E2E Drop' });
    await chrome.storage.local.set({
      [key]: [
        { id: drop.id, title: 'E2E Drop', lastUsed: 2 },
        { id: keep.id, title: 'E2E Keep', lastUsed: 1 },
      ],
    });
    await chrome.bookmarks.remove(drop.id);
    await chrome.bookmarks.update(keep.id, { title: 'E2E Kept' });
    return { keep: keep.id };
  }, RECENT_KEY);

  await expect
    .poll(() =>
      extensionWorker.evaluate(
        async (key) => (await chrome.storage.local.get(key))[key],
        RECENT_KEY,
      ),
    )
    .toEqual([{ id: ids.keep, title: 'E2E Kept', lastUsed: 1 }]);
});

test('options layout fits a 480px window without squeezed labels', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'ja' });
  await page.setViewportSize({ width: 480, height: 900 });
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  const themeLabel = page.locator('#setting-theme-label');
  await expect(themeLabel).toHaveText('テーマ');
  const labelBox = await themeLabel.boundingBox();
  expect(labelBox?.height).toBeLessThan(40);

  await page.getByRole('tab', { name: '分析' }).click();
  const scope = page.getByRole('combobox', { name: '既定の範囲' });
  const scopeBox = await scope.boundingBox();
  expect(scopeBox?.width).toBeGreaterThan(300);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

const DEFAULT_SUCCESS_STATUSES = [200, 201, 202, 204, 301, 302, 307, 308];

test('options follows theme changes made from the popup', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en', theme: 'light' });
  await openOptions(page, extensionId);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.locator('html')).toHaveClass(/light/);

  for (const theme of ['dark', 'light', 'dark']) {
    await popup.getByRole('button', { name: /^(Light|Dark) mode$/ }).click();
    await expect.poll(async () => (await readSettings(extensionWorker)).theme).toBe(theme);
    await expect(popup.locator('html')).toHaveClass(new RegExp(theme));
    await expect(page.locator('html')).toHaveClass(new RegExp(theme));
    await expect(page.getByRole('combobox', { name: 'Theme' })).toHaveText(
      theme === 'dark' ? 'Dark' : 'Light',
    );
  }
  // Late cache events from other pages must not revert the synced theme.
  await page.waitForTimeout(1_500);
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.bringToFront();
  await expect(page.locator('html')).toHaveClass(/dark/);
});

for (const mode of ['reload', 'close'] as const) {
  test(`an edit made right before ${mode} is saved`, async ({
    context,
    extensionId,
    extensionWorker,
  }) => {
    await setSettings(extensionWorker, { language: 'en' });
    const page = await context.newPage();
    await openOptions(page, extensionId);
    await page.getByRole('tab', { name: 'Behavior' }).click();
    const value = `Flushed on ${mode}`;
    await settingRow(page, 'defaultNewFolderName').getByRole('textbox').fill(value);
    // Well inside the autosave debounce.
    if (mode === 'reload') await page.reload();
    else await page.close({ runBeforeUnload: true });

    await expect
      .poll(async () => (await readSettings(extensionWorker)).defaultNewFolderName)
      .toBe(value);
    if (mode === 'reload') {
      await page.getByRole('tab', { name: 'Behavior' }).click();
      await expect(settingRow(page, 'defaultNewFolderName').getByRole('textbox')).toHaveValue(
        value,
      );
    }
  });
}

test('an invalid edit pending at close is not saved and does not block valid ones', async ({
  context,
  extensionId,
  extensionWorker,
}) => {
  await setSettings(extensionWorker, {
    language: 'en',
    confirmBeforeDelete: true,
    defaultNewFolderName: 'Keep Me',
  });
  const page = await context.newPage();
  await openOptions(page, extensionId);
  await page.getByRole('tab', { name: 'Behavior' }).click();
  await settingRow(page, 'defaultNewFolderName').getByRole('textbox').fill('');
  await settingRow(page, 'confirmBeforeDelete').getByRole('switch').click();
  await page.close({ runBeforeUnload: true });

  await expect
    .poll(async () => (await readSettings(extensionWorker)).confirmBeforeDelete)
    .toBe(false);
  expect((await readSettings(extensionWorker)).defaultNewFolderName).toBe('Keep Me');
});

test('resetting a list setting clears invalid text', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en', deadLinksSuccessStatuses: [200] });
  await openOptions(page, extensionId);
  await page.getByRole('tab', { name: 'Maintenance' }).click();
  const statuses = page.getByRole('textbox', { name: 'Success Status Codes' });
  const alert = settingRow(page, 'deadLinksSuccessStatuses').getByRole('alert');

  await statuses.fill('200, abc');
  await statuses.blur();
  await expect(alert).toBeVisible();
  await page.getByRole('button', { name: 'Reset Success Status Codes to default' }).click();
  await expect(statuses).toHaveValue(DEFAULT_SUCCESS_STATUSES.join(', '));
  await expect(alert).toHaveCount(0);
  await expect
    .poll(async () => (await readSettings(extensionWorker)).deadLinksSuccessStatuses)
    .toEqual(DEFAULT_SUCCESS_STATUSES);

  // Invalid text on a field that already holds its default is cleared by Reset All too.
  await statuses.fill('abc');
  await statuses.blur();
  await expect(alert).toBeVisible();
  await page.getByRole('button', { name: 'Reset All' }).click();
  await expect(statuses).toHaveValue(DEFAULT_SUCCESS_STATUSES.join(', '));
  await expect(alert).toHaveCount(0);
  await expect(page.getByTestId('settings-save-status')).toHaveText('Settings saved');
  expect((await readSettings(extensionWorker)).deadLinksSuccessStatuses).toEqual(
    DEFAULT_SUCCESS_STATUSES,
  );
});

test('settings search finds AI provider panel fields', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en', aiProvider: 'custom' });
  await openOptions(page, extensionId);
  const search = page.getByRole('searchbox', { name: 'Search settings...' });

  await search.fill('api key');
  await expect(page.getByLabel('API Key', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Base URL' })).toHaveCount(0);
  await expect(page.getByText('0 matching settings in all tabs')).toHaveCount(0);

  for (const [query, name] of [
    ['base url', 'Base URL'],
    ['custom model', 'Custom Model'],
    ['extra headers', 'Extra Headers JSON'],
  ]) {
    await search.fill(query);
    await expect(page.getByRole('textbox', { name, exact: true })).toBeVisible();
    await expect(page.getByText('1 matching settings in all tabs')).toBeVisible();
  }
});

test('unlimited sliders announce "No limit"', async ({ extensionId, extensionWorker, page }) => {
  await setSettings(extensionWorker, { language: 'en', aiMaxCategories: -1 });
  await openOptions(page, extensionId);
  await page.getByRole('tab', { name: 'AI', exact: true }).click();
  const slider = page.getByRole('slider', { name: 'Max Categories' });
  await expect(slider).toHaveAttribute('aria-valuetext', 'No limit');
  await slider.focus();
  await slider.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuetext', '1');
  await expect.poll(async () => (await readSettings(extensionWorker)).aiMaxCategories).toBe(1);
});

test('an invalid Base URL does not block saving valid Extra Headers', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en', aiProvider: 'openai' });
  await openOptions(page, extensionId);
  await page.getByRole('tab', { name: 'AI', exact: true }).click();
  const readAI = () =>
    extensionWorker.evaluate(async (key) => {
      const stored = await chrome.storage.local.get(key);
      return (stored[key] ?? {}) as Record<string, Record<string, string>>;
    }, AI_KEY);

  await page.getByRole('textbox', { name: 'Base URL' }).fill('not a url');
  const headers = page.getByRole('textbox', { name: 'Extra Headers JSON' });
  await headers.fill('{"X-Test":"1"}');
  await headers.blur();

  await expect(page.getByText('Enter a full http:// or https:// URL.')).toBeVisible();
  await expect.poll(async () => (await readAI()).openai?.extraHeaders).toBe('{"X-Test":"1"}');
  expect((await readAI()).openai?.baseUrl).toBeUndefined();
});
