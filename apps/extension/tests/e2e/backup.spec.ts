/**
 * Back up settings and Restore settings: parts the user selects (remembered on this device), the
 * AI service keys only after a warning and with a password by default, password protection of
 * the whole file, a dry-run review per part, Merge and Replace, Undo import, and older files.
 */
import {
  backupPart,
  importParts,
  openBackupDialog,
  openRestore,
  partCheckbox,
  saveBackup,
  selectOnlyParts,
} from './backup-helpers';
import { expect, test, toastRegion } from './fixtures';
import {
  readSettings,
  readStored,
  STORAGE_ITEMS,
  seedAIServices,
  setSettings,
  writeStored,
  writeStoredItems,
} from './storage';

const PASSWORD = 'e2e backup password';

const rule = (id: string, tag: string) => ({
  id,
  name: `Rule ${id}`,
  enabled: true,
  query: 'docs',
  syntaxVersion: 2,
  addTags: [tag],
});

test('Back up settings saves only the parts selected, remembers them on this device, and never the API keys', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en', theme: 'dark', quickSaveFixedFolder: '1' });
  await seedAIServices(extensionWorker, [
    { provider: 'openai', name: 'Work', credentials: { apiKey: 'sk-e2e-backup-secret' } },
  ]);
  await writeStoredItems(extensionWorker, [
    [
      STORAGE_ITEMS.prompt,
      { id: 'p1', task: 'auto_tagging', name: 'Backed up', system: 'Tag', updatedAt: 1 },
      'p1',
    ],
    [STORAGE_ITEMS.promptIndex, { ids: ['p1'], active: { auto_tagging: 'p1' } }],
    [STORAGE_ITEMS.searchHistory, ['private query']],
  ]);

  await page.goto(`chrome-extension://${extensionId}/options.html`);
  const dialog = await openBackupDialog(page);
  // The default: everything but this computer's settings and the keys.
  await expect(partCheckbox(dialog, 'settings')).toBeChecked();
  await expect(partCheckbox(dialog, 'deviceSettings')).not.toBeChecked();
  await expect(partCheckbox(dialog, 'aiServiceKeys')).not.toBeChecked();
  await expect(backupPart(dialog, 'deviceSettings')).toContainText(
    "Not selected at first: these suit this computer's screen and keyboard.",
  );
  await expect(backupPart(dialog, 'prompts').getByTestId('backup-part-meta')).toHaveText(
    /^Items: 1 · About [\d.]+ KB$/,
  );
  await expect(dialog).toContainText(
    'Nothing is sent anywhere: the file is saved on this computer.',
  );

  await selectOnlyParts(dialog, ['settings', 'prompts']);
  await expect(dialog.getByTestId('backup-filename')).toHaveText(
    /^File name: bookmark-scout-backup_\d{4}-\d{2}-\d{2}_settings-prompts\.json$/,
  );
  const { raw, filename } = await saveBackup(page, dialog);
  expect(filename).toMatch(/^bookmark-scout-backup_\d{4}-\d{2}-\d{2}_settings-prompts\.json$/);
  await expect(
    toastRegion(page).getByText(`Saved ${filename} with: Settings and Prompts and About me.`, {
      exact: true,
    }),
  ).toBeVisible();
  const file = JSON.parse(raw);
  expect(file.categories.map((part: { id: string }) => part.id)).toEqual(['settings', 'prompts']);
  expect(Object.keys(file.sections)).toEqual(['settings', 'prompts']);
  expect(raw).not.toContain('sk-e2e-backup-secret');
  expect(raw).not.toContain('private query');
  // This computer's settings were not selected.
  expect(raw).not.toContain('quickSaveFixedFolder');

  // Remembered on this device for the next backup.
  await expect
    .poll(async () => (await readSettings(extensionWorker)).backupExportCategories)
    .toEqual(['settings', 'prompts']);
  const again = await openBackupDialog(page);
  await expect(partCheckbox(again, 'prompts')).toBeChecked();
  await expect(partCheckbox(again, 'views')).not.toBeChecked();
});

test('the AI service keys need a confirm and start password-protected; the protected file round-trips, and a wrong password or changed file imports nothing', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en' });
  await seedAIServices(extensionWorker, [
    { provider: 'openai', name: 'Work', credentials: { apiKey: 'sk-e2e-key-secret' } },
  ]);
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  const dialog = await openBackupDialog(page);
  await selectOnlyParts(dialog, ['aiServices']);
  await partCheckbox(dialog, 'aiServiceKeys').check();
  const save = dialog.getByRole('button', { name: 'Save backup' });
  await expect(dialog.getByTestId('backup-keys-warning')).toContainText(
    'Anyone who gets this file can use these keys and run up charges on your accounts.',
  );
  await expect(save).toBeDisabled();
  await dialog.getByRole('checkbox', { name: 'I understand; include my API keys' }).check();
  // Protect API Keys With a Password is on by default: a password is needed.
  await expect(
    dialog.getByRole('checkbox', { name: 'Protect the API keys with a password' }),
  ).toBeChecked();
  await expect(save).toBeDisabled();
  await dialog.getByLabel('Password', { exact: true }).fill('short');
  await dialog.getByLabel('Repeat password').fill('short');
  await expect(dialog.getByRole('alert')).toHaveText('Use at least 12 characters.');
  await dialog.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await dialog.getByLabel('Repeat password').fill(PASSWORD);
  await expect(save).toBeEnabled();
  const { raw, filename } = await saveBackup(page, dialog);
  expect(filename).toMatch(/_ai-keys_protected\.json$/);
  expect(raw).not.toContain('sk-e2e-key-secret');
  const file = JSON.parse(raw);
  expect(file.categories).toEqual([
    expect.objectContaining({ id: 'aiServices', count: 1 }),
    expect.objectContaining({ id: 'aiServiceKeys', count: 1, protected: true }),
  ]);

  // The keys are lost on this device.
  await writeStored(extensionWorker, STORAGE_ITEMS.aiCredentials, {});

  // A changed byte fails like a wrong password, and nothing is imported.
  const tampered = structuredClone(file);
  const data: string = tampered.protected.data;
  tampered.protected.data = `${data.slice(0, 10)}${data[10] === 'A' ? 'B' : 'A'}${data.slice(11)}`;
  let review = await openRestore(page, JSON.stringify(tampered));
  await expect(review.getByTestId('backup-unlock')).toContainText(
    'Protected with a password: AI service keys',
  );
  await review.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await review.getByRole('button', { name: 'Unlock' }).click();
  const failure =
    'The password is wrong, or the file was changed after it was saved. Nothing was restored from the protected parts.';
  await expect(review.getByTestId('backup-unlock').getByRole('alert')).toHaveText(failure);
  await review.getByRole('button', { name: 'Cancel' }).click();
  await expect(review).toHaveCount(0);

  review = await openRestore(page, raw, filename);
  await review.getByLabel('Password', { exact: true }).fill('not the password at all');
  await review.getByRole('button', { name: 'Unlock' }).click();
  await expect(review.getByTestId('backup-unlock').getByRole('alert')).toHaveText(failure);
  await review.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await review.getByRole('button', { name: 'Unlock' }).click();
  await expect(review.getByTestId('backup-unlock')).toHaveCount(0);
  // The keys are their own tick, unchecked, with the same warning.
  const keys = backupPart(review, 'aiServiceKeys');
  await expect(partCheckbox(review, 'aiServiceKeys')).not.toBeChecked();
  await partCheckbox(review, 'aiServiceKeys').check();
  await expect(keys.getByTestId('backup-keys-warning')).toBeVisible();
  await expect(review.getByRole('button', { name: 'Import (2)' })).toBeDisabled();
  await review.getByRole('checkbox', { name: 'Import the API keys' }).check();
  await importParts(review);
  await expect
    .poll(() => readStored(extensionWorker, STORAGE_ITEMS.aiCredentials))
    .toEqual({ openai: { apiKey: 'sk-e2e-key-secret' } });
});

test('Protect New Backups With a Password starts every backup protected', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, {
    language: 'en',
    backupEncryptByDefault: true,
    theme: 'dark',
  });
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  const dialog = await openBackupDialog(page);
  await expect(
    dialog.getByRole('checkbox', { name: 'Protect this backup with a password' }),
  ).toBeChecked();
  await expect(dialog.getByRole('button', { name: 'Save backup' })).toBeDisabled();
  await dialog.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await dialog.getByLabel('Repeat password').fill(PASSWORD);
  const { raw, filename } = await saveBackup(page, dialog);
  expect(filename).toMatch(/_protected\.json$/);
  const file = JSON.parse(raw);
  // What it holds stays readable; the data does not.
  expect(file.categories.every((part: { protected?: boolean }) => part.protected)).toBe(true);
  expect(file.sections).toEqual({});
  expect(raw).not.toContain('dark');
});

test('Restore reviews each part without changing anything, asks before Replace, and Undo import puts everything back', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en', theme: 'dark' });
  await writeStored(extensionWorker, STORAGE_ITEMS.bookmarkRules, [rule('r1', 'from-file')]);
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  const { raw } = await saveBackup(page, await openBackupDialog(page));

  await setSettings(extensionWorker, { theme: 'light' });
  await writeStored(extensionWorker, STORAGE_ITEMS.bookmarkRules, [rule('r2', 'here')]);
  const review = await openRestore(page, raw);
  await expect(backupPart(review, 'settings').getByTestId('backup-review-counts')).toHaveText(
    'In the file: 2 · Adds 0 · Changes 1 · Same here: 1',
  );
  await expect(backupPart(review, 'rules').getByTestId('backup-review-counts')).toHaveText(
    'In the file: 1 · Adds 1 · Changes 0 · Same here: 0',
  );
  // A dry run: nothing changed yet.
  expect((await readSettings(extensionWorker)).theme).toBe('light');

  await backupPart(review, 'rules').getByRole('radio', { name: 'Replace' }).click();
  await expect(backupPart(review, 'rules').getByTestId('backup-replace-removes')).toHaveText(
    'Removes 1 items that only this device has.',
  );
  await review.getByRole('button', { name: /^Import \(\d+\)$/ }).click();
  const confirm = page.getByRole('dialog', { name: 'Replace these parts?' });
  await expect(confirm).toContainText('Replace makes Smart Rules hold exactly what the file has');
  await confirm.getByRole('button', { name: 'Replace' }).click();
  await expect(review.getByTestId('backup-import-result')).toBeVisible();
  await expect(
    review.getByTestId('backup-outcome').filter({ hasText: 'Smart Rules' }),
  ).toContainText('Added 1 · Changed 0 · Removed 1');
  await expect.poll(async () => (await readSettings(extensionWorker)).theme).toBe('dark');
  expect(
    (await readStored<{ id: string }[]>(extensionWorker, STORAGE_ITEMS.bookmarkRules))?.map(
      (entry) => entry.id,
    ),
  ).toEqual(['r1']);

  await review.getByRole('button', { name: 'Undo import' }).click();
  await expect(toastRegion(page).getByText('✓ Import undone', { exact: true })).toBeVisible();
  await expect.poll(async () => (await readSettings(extensionWorker)).theme).toBe('light');
  expect(
    (await readStored<{ id: string }[]>(extensionWorker, STORAGE_ITEMS.bookmarkRules))?.map(
      (entry) => entry.id,
    ),
  ).toEqual(['r2']);
  // Undone once: the Settings button is gone too.
  await expect(page.getByRole('button', { name: 'Undo import' })).toHaveCount(0);
});

test('a backup file from before parts still restores, with its AI endpoints', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en' });
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  const old = {
    format: 'bookmark-scout-backup',
    version: 1,
    exportedAt: '2026-10-11T00:00:00.000Z',
    items: {
      'sync:settings': { v: 1, data: { language: 'en', theme: 'dark' } },
      'local:ai.services': {
        v: 1,
        data: {
          services: [{ id: 'custom', name: 'Local', provider: 'custom', model: '', enabled: true }],
          defaultServiceId: 'custom',
        },
      },
    },
    aiEndpoints: { custom: { baseUrl: 'http://localhost:8080/v1', leftOut: ['extraHeaders'] } },
  };
  const review = await openRestore(page, JSON.stringify(old));
  await expect(review.getByTestId('backup-import-part')).toHaveCount(2);
  await importParts(review);
  await expect(review.getByTestId('backup-needs-setup')).toContainText(
    'Extra Headers JSON for “Local”',
  );
  await expect.poll(async () => (await readSettings(extensionWorker)).theme).toBe('dark');
  expect(await readStored(extensionWorker, STORAGE_ITEMS.aiCredentials)).toEqual({
    custom: { baseUrl: 'http://localhost:8080/v1', pendingSecrets: ['extraHeaders'] },
  });
});
