import type { Page, Worker } from '@playwright/test';
import { expect, test, toastRegion } from './fixtures';
import { readSettings, readStored, STORAGE_ITEMS, setSettings, writeStored } from './storage';

function settingRow(page: Page, key: string) {
  return page.locator(`[data-setting="${key}"]`);
}

function themeChoice(page: Page, name: 'Dark' | 'Light' | 'System') {
  return page.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio', { name });
}

/** Base URL, headers, and provider-specific fields sit under More settings. */
async function openMoreSettings(page: Page) {
  await page.getByRole('button', { name: 'More settings' }).click();
}

async function readServices(worker: Worker) {
  return readStored<{
    services: { provider: string; model: string; name: string }[];
    defaultServiceId?: string;
  }>(worker, STORAGE_ITEMS.aiServices);
}

/** Opens a section's closed "Advanced settings" fold. */
async function openAdvanced(page: Page, section: string) {
  await page
    .locator(`[data-settings-section="${section}"] [data-slot="settings-advanced"] > button`)
    .click();
}

/** Opens Options on Appearance (language, theme, icons), where most of these checks start. */
async function openOptions(page: Page, extensionId: string) {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByRole('tab', { name: 'Appearance' }).click();
}

test('non-default selects survive reload and never block saving other settings', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en', theme: 'dark', faviconSize: 32 });
  await openOptions(page, extensionId);

  // A choice of up to three short options is one-click segments, not a dropdown.
  await expect(themeChoice(page, 'Dark')).toBeChecked();
  await expect(page.getByRole('combobox', { name: 'Favicon Size' })).toHaveText('32px (Large)');
  await expect(page.getByRole('combobox', { name: 'Language' })).toHaveText('English');

  await page.getByRole('switch', { name: 'Show Favicons' }).click();
  await expect.poll(async () => (await readSettings(extensionWorker)).showFavicons).toBe(false);

  await page.reload();
  await page.getByRole('tab', { name: 'Appearance' }).click();
  await expect(themeChoice(page, 'Dark')).toBeChecked();
  await page.getByRole('switch', { name: 'Show Favicons' }).click();
  await expect
    .poll(() => readSettings(extensionWorker))
    .toMatchObject({ showFavicons: true, theme: 'dark', faviconSize: 32, language: 'en' });
  // Autosave shows no success message; the status only speaks up when a save fails.
  await expect(page.getByTestId('settings-save-status')).toBeEmpty();
  await expect(page.getByText(/Invalid settings|invalid_/)).toHaveCount(0);
});

test('adding an AI service selects that provider default model and saves', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en' });
  await openOptions(page, extensionId);
  await page.getByRole('tab', { name: 'AI', exact: true }).click();

  const addService = async (provider: string, name?: string) => {
    await page.getByRole('button', { name: 'Add service' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add an AI service' });
    await dialog.getByRole('combobox', { name: 'Provider' }).click();
    await page.getByRole('option', { name: provider, exact: true }).click();
    if (name) await dialog.getByLabel('Name').fill(name);
    await dialog.getByRole('button', { name: 'Add service' }).click();
    await expect(dialog).toHaveCount(0);
  };

  await addService('Anthropic');
  const anthropic = page.getByTestId('ai-service').filter({ hasText: 'Anthropic' });
  await expect(anthropic.getByRole('combobox', { name: 'AI Model' })).toHaveText('Claude Sonnet 4');
  await expect
    .poll(async () => (await readServices(extensionWorker))?.services.at(-1))
    .toMatchObject({ provider: 'anthropic', model: 'claude-sonnet-4-20250514', name: 'Anthropic' });

  await addService('Custom Provider', 'Work proxy');
  const custom = page.getByTestId('ai-service').filter({ hasText: 'Work proxy' });
  await expect(custom.getByRole('combobox', { name: 'AI Model' })).toHaveText('Default Model');
  await expect
    .poll(async () => (await readServices(extensionWorker))?.services.at(-1))
    .toMatchObject({ provider: 'custom', model: 'gpt-4o-mini', name: 'Work proxy' });
});

test('list editors add and remove names, and status codes are a checklist that validates other codes', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en' });
  await openOptions(page, extensionId);
  await page.getByRole('tab', { name: 'Maintenance' }).click();
  const readPreserve = async () => (await readSettings(extensionWorker)).urlCleanerPreserveParams;

  // Typing a comma, or pressing Enter, adds what was typed; names already there are skipped.
  const preserve = page.getByRole('textbox', { name: 'Preserve Parameters' });
  await preserve.pressSequentially('ref, page');
  await preserve.press('Enter');
  await expect.poll(readPreserve).toEqual(['id', 'page', 'q', 'p', 'lang', 'ref']);
  await page.getByRole('button', { name: 'Remove id' }).click();
  await page.getByRole('button', { name: 'Add query' }).click();
  await expect.poll(readPreserve).toEqual(['page', 'q', 'p', 'lang', 'ref', 'query']);
  // Backspace in the empty box removes the last name.
  await preserve.press('Backspace');
  await expect.poll(readPreserve).toEqual(['page', 'q', 'p', 'lang', 'ref']);

  await openAdvanced(page, 'deadLinks');
  const codes = page.getByRole('group', { name: 'Success Status Codes' });
  const readCodes = async () => (await readSettings(extensionWorker)).deadLinksSuccessStatuses;
  await codes.getByRole('checkbox', { name: '201 Created' }).click();
  await codes.getByRole('checkbox', { name: '403 Forbidden' }).click();
  await expect.poll(readCodes).toEqual([200, 202, 204, 301, 302, 307, 308, 403]);

  // A code outside the checklist is added as a chip; text that is not a code is refused inline.
  const other = codes.getByRole('textbox', { name: 'Other codes' });
  await other.fill('abc');
  await other.press('Enter');
  await expect(codes.getByRole('alert')).toHaveText('Enter a status code from 100 to 599.');
  await other.fill('418');
  await other.press('Enter');
  await expect(codes.getByRole('alert')).toHaveCount(0);
  await expect.poll(readCodes).toContain(418);
  await codes.getByRole('button', { name: 'Remove 418' }).click();
  await expect.poll(readCodes).not.toContain(418);
});

test('a setting error uses the dark-mode-safe error text color', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en', theme: 'dark' });
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByRole('tab', { name: 'Saving & Search' }).click();
  const row = settingRow(page, 'defaultNewFolderName');
  await row.getByRole('textbox').fill('');
  const alert = row.getByRole('alert');
  await expect(alert).toBeVisible();
  const status = page.getByTestId('settings-save-status');
  await expect(status).toHaveText('1 setting not saved');

  // The footer status uses the error text token; in dark mode the fill token is too dark for text.
  const color = (locator: typeof alert) =>
    locator.evaluate((element) => getComputedStyle(element).color);
  expect(await color(alert)).toBe(await color(status));
});

test('a save error clears once the field is reset or its saved value is typed again', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en' });
  await openOptions(page, extensionId);
  await page.getByRole('tab', { name: 'Saving & Search' }).click();
  const row = settingRow(page, 'defaultNewFolderName');
  const input = row.getByRole('textbox');
  const status = page.getByTestId('settings-save-status');
  const saved = await input.inputValue();

  await input.fill('');
  await expect(row.getByRole('alert')).toHaveText("This field can't be empty.");
  await expect(status).toHaveText('1 setting not saved');
  await row.getByRole('button', { name: 'Reset Default Folder Name to default' }).click();
  await expect(input).toHaveValue(saved);
  await expect(row.getByRole('alert')).toHaveCount(0);
  await expect(status).toBeEmpty();

  await input.fill('');
  await expect(status).toHaveText('1 setting not saved');
  await input.fill(saved);
  await expect(row.getByRole('alert')).toHaveCount(0);
  await expect(status).toBeEmpty();
});

test('invalid text shows a localized inline error and is not silently saved', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'ja', defaultNewFolderName: 'Inbox' });
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByRole('tab', { name: '保存と検索' }).click();
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
  await expect(toastRegion(page).getByText('1 settings changed: Theme')).toBeVisible();
  await expect
    .poll(() => readSettings(extensionWorker))
    .toMatchObject({ theme: 'dark', defaultNewFolderName: 'Inbox' });

  await page.getByLabel('Import', { exact: true }).setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ theme: 'neon' })),
  });
  await expect(
    toastRegion(page).getByText('These settings have invalid values: Theme'),
  ).toBeVisible();
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
  await expect(themeChoice(page, 'Dark')).toBeChecked();

  // A change arriving through sync (another device, import) applies without reload.
  await setSettings(extensionWorker, { theme: 'light' });
  await expect(page.locator('html')).toHaveClass(/light/);
  await expect(popup.locator('html')).toHaveClass(/light/);
  await expect(themeChoice(page, 'Light')).toBeChecked();
});

test('rejected API keys and unsafe Base URLs are never persisted', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en', aiProvider: 'openai' });
  await openOptions(page, extensionId);
  await page.getByRole('tab', { name: 'AI', exact: true }).click();

  const readAI = async () =>
    (await readStored<Record<string, Record<string, string>>>(
      extensionWorker,
      STORAGE_ITEMS.aiCredentials,
    )) ?? {};

  const key = page.getByLabel('API Key', { exact: true });
  await key.fill('test-key-not-real');
  await key.blur();
  await expect(
    page.getByText("This doesn't look like an API key for OpenAI. It was not saved."),
  ).toBeVisible();

  await openMoreSettings(page);
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
  await expect(page.getByText('1 matching setting in all tabs')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Success Status Codes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Maintenance' })).toBeVisible();

  // The search covers every tab, so the empty state does not mention a category.
  await page.getByRole('searchbox', { name: 'Search settings...' }).fill('zzzz-no-match');
  await expect(page.getByText('0 matching settings in all tabs')).toBeVisible();
  await expect(page.getByText('No settings match your search.', { exact: true })).toBeVisible();

  await page.getByRole('searchbox', { name: 'Search settings...' }).fill('');
  await page.getByRole('tab', { name: 'AI Tools', exact: true }).click();
  await openAdvanced(page, 'reorganization');
  await expect(page.getByRole('textbox', { name: 'Max Categories' })).toHaveAttribute(
    'placeholder',
    'No limit',
  );

  const unnamed = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        '[role="switch"], [role="checkbox"], [role="combobox"], [role="slider"], input:not([aria-hidden="true"]), button',
      ),
    ]
      .filter((element) => {
        const labelledBy = element.getAttribute('aria-labelledby');
        const name =
          element.getAttribute('aria-label') ||
          (element instanceof HTMLInputElement && element.labels?.[0]?.textContent) ||
          (labelledBy && document.getElementById(labelledBy)?.textContent) ||
          element.textContent;
        return !name?.trim();
      })
      .map((element) => element.outerHTML.slice(0, 80)),
  );
  expect(unnamed).toEqual([]);
});

test('recent folders drop deleted folders and follow renames', async ({ extensionWorker }) => {
  const ids = await extensionWorker.evaluate(async () => {
    const [root] = await chrome.bookmarks.getTree();
    const parent = root.children?.find((node) => node.children !== undefined);
    if (!parent) throw new Error('No writable bookmark root found');
    const keep = await chrome.bookmarks.create({ parentId: parent.id, title: 'E2E Keep' });
    const drop = await chrome.bookmarks.create({ parentId: parent.id, title: 'E2E Drop' });
    return { keep: keep.id, drop: drop.id };
  });
  await writeStored(extensionWorker, STORAGE_ITEMS.recentFolders, [
    { id: ids.drop, title: 'E2E Drop', lastUsed: 2 },
    { id: ids.keep, title: 'E2E Keep', lastUsed: 1 },
  ]);
  await extensionWorker.evaluate(async ({ keep, drop }) => {
    await chrome.bookmarks.remove(drop);
    await chrome.bookmarks.update(keep, { title: 'E2E Kept' });
  }, ids);

  await expect
    .poll(() => readStored(extensionWorker, STORAGE_ITEMS.recentFolders))
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
  await page.getByRole('tab', { name: '外観' }).click();
  const themeLabel = page.locator('#setting-theme-label');
  await expect(themeLabel).toHaveText('テーマ');
  const labelBox = await themeLabel.boundingBox();
  expect(labelBox?.height).toBeLessThan(40);

  await page.getByRole('tab', { name: '分析' }).click();
  const scope = page.getByRole('radiogroup', { name: '既定の範囲' });
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
    await expect(themeChoice(page, theme === 'dark' ? 'Dark' : 'Light')).toBeChecked();
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
    await page.getByRole('tab', { name: 'Saving & Search' }).click();
    const value = `Flushed on ${mode}`;
    await settingRow(page, 'defaultNewFolderName').getByRole('textbox').fill(value);
    // Well inside the autosave debounce.
    if (mode === 'reload') await page.reload();
    else await page.close({ runBeforeUnload: true });

    await expect
      .poll(async () => (await readSettings(extensionWorker)).defaultNewFolderName)
      .toBe(value);
    if (mode === 'reload') {
      await page.getByRole('tab', { name: 'Saving & Search' }).click();
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
  await page.getByRole('tab', { name: 'Saving & Search' }).click();
  await settingRow(page, 'defaultNewFolderName').getByRole('textbox').fill('');
  await page.getByRole('tab', { name: 'Behavior' }).click();
  await settingRow(page, 'confirmBeforeDelete').getByRole('switch').click();
  await page.close({ runBeforeUnload: true });

  await expect
    .poll(async () => (await readSettings(extensionWorker)).confirmBeforeDelete)
    .toBe(false);
  expect((await readSettings(extensionWorker)).defaultNewFolderName).toBe('Keep Me');
});

test('the last status code cannot be cleared, and reset restores the default codes', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en', deadLinksSuccessStatuses: [200] });
  await openOptions(page, extensionId);
  await page.getByRole('tab', { name: 'Maintenance' }).click();
  // A changed value keeps the fold open.
  const codes = page.getByRole('group', { name: 'Success Status Codes' });
  await expect(codes.getByRole('checkbox', { name: '200 OK' })).toBeDisabled();

  await page.getByRole('button', { name: 'Reset Success Status Codes to default' }).click();
  await expect
    .poll(async () => (await readSettings(extensionWorker)).deadLinksSuccessStatuses)
    .toEqual(DEFAULT_SUCCESS_STATUSES);
  await expect(codes.getByRole('checkbox', { name: '200 OK' })).toBeEnabled();
  await expect(page.getByTestId('settings-save-status')).toBeEmpty();
});

test('settings search finds AI service fields, including ones under More settings', async ({
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
    await expect(page.getByText('1 matching setting in all tabs')).toBeVisible();
  }
});

test('number steppers step, accept typing, and leave an unlimited field empty for "No limit"', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en', aiMaxCategories: -1 });
  await openOptions(page, extensionId);
  await page.getByRole('tab', { name: 'AI Tools', exact: true }).click();
  await openAdvanced(page, 'reorganization');
  const field = page.getByRole('textbox', { name: 'Max Categories' });
  await expect(field).toHaveValue('');
  await expect(field).toHaveAttribute('placeholder', 'No limit');

  await page.getByRole('button', { name: 'Increase Max Categories' }).click();
  await expect(field).toHaveValue('1');
  await expect.poll(async () => (await readSettings(extensionWorker)).aiMaxCategories).toBe(1);

  await field.fill('12');
  await field.blur();
  await expect.poll(async () => (await readSettings(extensionWorker)).aiMaxCategories).toBe(12);

  await field.fill('');
  await field.blur();
  await expect.poll(async () => (await readSettings(extensionWorker)).aiMaxCategories).toBe(-1);

  // -1 also means no limit, as the description says; other values below the minimum clamp.
  await field.fill('7');
  await field.blur();
  await expect.poll(async () => (await readSettings(extensionWorker)).aiMaxCategories).toBe(7);
  await field.fill('-1');
  await field.blur();
  await expect.poll(async () => (await readSettings(extensionWorker)).aiMaxCategories).toBe(-1);
  await expect(field).toHaveValue('');
  await expect(field).toHaveAttribute('placeholder', 'No limit');
  await field.fill('0');
  await field.blur();
  await expect(field).toHaveValue('1');
  await expect.poll(async () => (await readSettings(extensionWorker)).aiMaxCategories).toBe(1);
  await field.fill('1000');
  await field.blur();
  await expect(field).toHaveValue('100');
  await expect.poll(async () => (await readSettings(extensionWorker)).aiMaxCategories).toBe(100);

  // Values outside the range are clamped when the field is committed.
  await page.getByRole('tab', { name: 'AI', exact: true }).click();
  const recent = page.getByRole('textbox', { name: 'Max Recommendations' });
  await recent.fill('99');
  await recent.blur();
  await expect(recent).toHaveValue('10');
  await expect
    .poll(async () => (await readSettings(extensionWorker)).aiMaxRecommendations)
    .toBe(10);
});

test('a long unit such as Japanese milliseconds stays on one line', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'ja' });
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByRole('tab', { name: '保存と検索' }).click();
  const unit = settingRow(page, 'searchDebounceMs').locator('[data-slot="setting-unit"]');
  await expect(unit).toHaveText('ミリ秒');
  const lineHeight = await unit.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).lineHeight),
  );
  await expect
    .poll(() => unit.evaluate((element) => element.getBoundingClientRect().height))
    .toBeLessThanOrEqual(lineHeight);
});

test('changing a switch back to its default keeps it under the pointer', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en' });
  await openOptions(page, extensionId);
  await page.getByRole('tab', { name: 'Behavior' }).click();
  const toggle = page.getByRole('switch', { name: 'Confirm Before Delete' });
  // Clear of the sticky footer, so clicking does not scroll the page and move the switch.
  await toggle.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  const before = await toggle.boundingBox();
  await toggle.click();
  await expect(page.getByRole('button', { name: /Reset Confirm Before Delete/ })).toBeVisible();
  expect(await toggle.boundingBox()).toEqual(before);
  await toggle.click();
  await expect(page.getByRole('button', { name: /Reset Confirm Before Delete/ })).toHaveCount(0);
  expect(await toggle.boundingBox()).toEqual(before);
});

test('related switches are one checklist that saves each option and resets together', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en' });
  await openOptions(page, extensionId);
  await page.getByRole('tab', { name: 'AI Tools', exact: true }).click();
  const group = page.getByRole('group', { name: 'Include in AI Context' });
  await expect(group.getByRole('checkbox')).toHaveCount(4);
  await group.getByRole('checkbox', { name: /Include Dates/ }).click();
  await expect
    .poll(async () => (await readSettings(extensionWorker)).aiContextPackerIncludeDates)
    .toBe(false);

  await page.getByRole('button', { name: 'Reset Include in AI Context to default' }).click();
  await expect
    .poll(async () => (await readSettings(extensionWorker)).aiContextPackerIncludeDates)
    .toBe(true);
});

test('an invalid Base URL does not block saving valid Extra Headers', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en', aiProvider: 'openai' });
  await openOptions(page, extensionId);
  await page.getByRole('tab', { name: 'AI', exact: true }).click();
  const readAI = async () =>
    (await readStored<Record<string, Record<string, string>>>(
      extensionWorker,
      STORAGE_ITEMS.aiCredentials,
    )) ?? {};

  await openMoreSettings(page);
  await page.getByRole('textbox', { name: 'Base URL' }).fill('not a url');
  const headers = page.getByRole('textbox', { name: 'Extra Headers JSON' });
  await headers.fill('{"X-Test":"1"}');
  await headers.blur();

  await expect(page.getByText('Enter a full http:// or https:// URL.')).toBeVisible();
  await expect.poll(async () => (await readAI()).openai?.extraHeaders).toBe('{"X-Test":"1"}');
  expect((await readAI()).openai?.baseUrl).toBeUndefined();
});

test('a slider setting follows a mouse drag and a track click, and saves', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openOptions(page, extensionId);
  await page.getByRole('tab', { name: 'AI Tools', exact: true }).click();
  await openAdvanced(page, 'reorganization');

  const row = settingRow(page, 'reorganizationMinConfidence');
  const slider = row.getByRole('slider');
  // The thumb wraps the hidden range input that carries the slider role.
  const thumb = slider.locator('xpath=..');
  const control = row.locator('.touch-none').first();
  await thumb.scrollIntoViewIfNeeded();
  const start = Number(await slider.inputValue());
  const thumbBox = await thumb.boundingBox();
  const controlBox = await control.boundingBox();
  if (!thumbBox || !controlBox) throw new Error('slider not laid out');
  const y = thumbBox.y + thumbBox.height / 2;

  // Pointer changes once threw "number is not iterable" in the settings row, so only the
  // keyboard moved the slider.
  await page.mouse.move(thumbBox.x + thumbBox.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(controlBox.x + controlBox.width * 0.9, y, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => Number(await slider.inputValue())).toBeGreaterThan(start);
  await expect
    .poll(async () => (await readSettings(extensionWorker)).reorganizationMinConfidence)
    .toBe(Number(await slider.inputValue()));

  await page.mouse.click(
    controlBox.x + controlBox.width * 0.1,
    controlBox.y + controlBox.height / 2,
  );
  await expect.poll(async () => Number(await slider.inputValue())).toBeLessThan(start);
  await expect
    .poll(async () => (await readSettings(extensionWorker)).reorganizationMinConfidence)
    .toBe(Number(await slider.inputValue()));
  expect(errors).toEqual([]);
});

test('a section switch folds its tool, search opens Advanced settings, and a switch row disables what it controls', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en' });
  await openOptions(page, extensionId);

  // The heading switch is the tool's Enable setting; off folds the rest of the section.
  await page.getByRole('tab', { name: 'Maintenance' }).click();
  const deadLinks = page.locator('[data-settings-section="deadLinks"]');
  await deadLinks.getByRole('switch', { name: 'Enable Dead Link Checker' }).click();
  await expect.poll(async () => (await readSettings(extensionWorker)).deadLinksEnabled).toBe(false);
  await expect(deadLinks).toContainText('Turned off. Turn it on to change its settings.');
  await expect(deadLinks.getByRole('radiogroup')).toHaveCount(0);
  await deadLinks.getByRole('switch', { name: 'Enable Dead Link Checker' }).click();
  await expect(deadLinks.getByRole('radiogroup')).toHaveCount(1);

  // Technical settings start folded, named in the summary, and a search opens the fold.
  const fold = deadLinks.locator('[data-slot="settings-advanced"]');
  await expect(fold.getByRole('button', { name: /Advanced settings/ })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(fold.getByRole('button', { name: /Advanced settings/ })).toContainText(
    'Retry Count',
  );
  await page.getByRole('searchbox', { name: 'Search settings...' }).fill('retry');
  await expect(page.getByRole('textbox', { name: 'Retry Count' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search settings...' }).fill('');

  // Show Favicons leads one row with its size and icon cache, disabled while it is off.
  await page.getByRole('tab', { name: 'Appearance' }).click();
  await page.getByRole('switch', { name: 'Show Favicons' }).click();
  await expect(page.getByRole('combobox', { name: 'Favicon Size' })).toBeDisabled();
  await page.getByRole('switch', { name: 'Show Favicons' }).click();
  await expect(page.getByRole('combobox', { name: 'Favicon Size' })).toBeEnabled();
});

test('a range keeps its minimum at or below its maximum, and durations are edited in seconds', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, {
    language: 'en',
    autoTaggingMinTags: 4,
    autoTaggingMaxTags: 5,
  });
  await openOptions(page, extensionId);

  // Stored in milliseconds, shown and edited in seconds.
  const toast = page.getByRole('textbox', { name: 'Toast Duration' });
  await expect(toast).toHaveValue('4');
  await expect(
    settingRow(page, 'toastDurationMs').locator('[data-slot="setting-unit"]'),
  ).toHaveText('s');
  await page.getByRole('button', { name: 'Increase Toast Duration' }).click();
  await expect.poll(async () => (await readSettings(extensionWorker)).toastDurationMs).toBe(4500);

  await page.getByRole('tab', { name: 'AI Tools', exact: true }).click();
  const increaseMin = page.getByRole('button', { name: 'Increase Minimum Tags' });
  await increaseMin.click();
  await expect.poll(async () => (await readSettings(extensionWorker)).autoTaggingMinTags).toBe(5);
  // The minimum has reached the maximum, so it cannot go higher, and typing more is clamped.
  await expect(increaseMin).toBeDisabled();
  const min = page.getByRole('textbox', { name: 'Minimum Tags' });
  await min.fill('9');
  await min.blur();
  await expect(min).toHaveValue('5');
  await expect(page.getByRole('button', { name: 'Decrease Maximum Tags' })).toBeDisabled();
  await expect(page.getByTestId('settings-save-status')).toBeEmpty();
});

test('a short choice is one-click segments that save on click and arrow keys, and a long one stays a dropdown', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en' });
  await openOptions(page, extensionId);
  await page.getByRole('tab', { name: 'Behavior' }).click();
  const sort = page.getByRole('radiogroup', { name: 'Sort Order' });
  await expect(sort.getByRole('radio')).toHaveText(['Date Added', 'Alphabetical', 'Folders First']);

  await sort.getByRole('radio', { name: 'Alphabetical' }).click();
  await expect
    .poll(async () => (await readSettings(extensionWorker)).sortOrder)
    .toBe('alphabetical');
  await page.keyboard.press('ArrowRight');
  await expect(sort.getByRole('radio', { name: 'Folders First' })).toBeChecked();
  await expect.poll(async () => (await readSettings(extensionWorker)).sortOrder).toBe('folders');

  // More than three options, or labels too long to sit side by side, keep the dropdown.
  await page.getByRole('tab', { name: 'Maintenance' }).click();
  await expect(page.getByRole('combobox', { name: 'Match Strategy' })).toBeVisible();
});
