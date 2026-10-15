import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';
import { expect, test } from './fixtures';
import { settingRow } from './options-helpers';
import { readSettings, setSettings } from './storage';

/** The settings config/ui/essentials.toml puts on the Essentials tab, in order. */
const essentials = (
  parse(
    readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), '../../config/ui/essentials.toml'),
      'utf8',
    ),
  ) as { settings: string[] }
).settings;

test('Options opens on Essentials: the configured settings, the same values as their own tabs, and a pointer to AI', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en' });
  await page.goto(`chrome-extension://${extensionId}/options.html`);

  await expect(page.getByRole('tab', { name: 'Essentials', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('heading', { name: 'Essentials', level: 2 })).toBeVisible();
  const shown = await page
    .getByRole('tabpanel')
    .locator('[data-setting]')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-setting')));
  expect(shown).toEqual(essentials);
  // Every other tab reads as Advanced.
  await expect(page.getByTestId('settings-advanced-heading')).toHaveText('Advanced');

  // A setting changed here is the same setting as in its own tab.
  await page
    .getByRole('radiogroup', { name: 'Theme' })
    .getByRole('radio', { name: 'Dark' })
    .click();
  await expect.poll(async () => (await readSettings(extensionWorker)).theme).toBe('dark');
  await page.getByRole('tab', { name: 'Appearance', exact: true }).click();
  await expect(
    page.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio', { name: 'Dark' }),
  ).toBeChecked();

  // Search lists each setting once, in its own tab, never under Essentials.
  await page.getByRole('searchbox', { name: 'Search settings...' }).fill('theme');
  await expect(settingRow(page, 'theme')).toHaveCount(1);
  await expect(page.locator('[data-search-category="appearance"]')).toBeVisible();
  await expect(page.locator('[data-search-category="essentials"]')).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Search settings...' }).fill('');

  // AI is optional and set up in its own tab.
  await page.getByRole('tab', { name: 'Essentials', exact: true }).click();
  const ai = page.getByTestId('essentials-ai');
  await expect(ai).toContainText('AI is optional');
  await ai.getByRole('button', { name: 'Set up AI' }).click();
  await expect(page.getByRole('tab', { name: 'AI', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('heading', { name: 'AI services' })).toBeVisible();
});

test('a link to another Options tab still opens that tab', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en' });
  await page.goto(`chrome-extension://${extensionId}/options.html?category=developers`);
  await expect(page.getByRole('tab', { name: 'For developers', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('switch', { name: 'Allow local AI agents' })).toBeVisible();
});
