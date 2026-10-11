import { readFile } from 'node:fs/promises';
import { expect, test, toastRegion } from './fixtures';
import {
  readSettings,
  readStored,
  removeStored,
  STORAGE_ITEMS,
  seedAIServices,
  setSettings,
  writeStored,
  writeStoredItems,
} from './storage';

test('Export saves a backup without API keys, and Import restores it', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en', theme: 'dark', quickSaveFixedFolder: '1' });
  await seedAIServices(extensionWorker, [
    { provider: 'openai', name: 'Work', credentials: { apiKey: 'sk-e2e-backup-secret' } },
  ]);
  const prompt = {
    id: 'p1',
    task: 'auto_tagging',
    name: 'Backed up',
    system: 'Tag it',
    updatedAt: Date.now(),
  };
  await writeStoredItems(extensionWorker, [
    [STORAGE_ITEMS.prompt, prompt, 'p1'],
    [STORAGE_ITEMS.promptIndex, { ids: ['p1'], active: { auto_tagging: 'p1' } }],
    [STORAGE_ITEMS.searchHistory, ['private query']],
  ]);

  await page.goto(`chrome-extension://${extensionId}/options.html`);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  const download = await downloadPromise;
  await expect(toastRegion(page).getByText('✓ Backup exported', { exact: true })).toBeVisible();
  expect(download.suggestedFilename()).toBe('bookmark-scout-backup.json');
  const raw = await readFile(await download.path(), 'utf8');
  expect(raw).not.toContain('sk-e2e-backup-secret');
  expect(raw).not.toContain('private query');
  expect(JSON.parse(raw).items).toHaveProperty(['sync:prompts.prompt/p1']);

  // Lose everything the backup holds, keep the key, then restore.
  await removeStored(extensionWorker, STORAGE_ITEMS.prompt, 'p1');
  await removeStored(extensionWorker, STORAGE_ITEMS.promptIndex);
  await removeStored(extensionWorker, STORAGE_ITEMS.aiServices);
  await writeStored(extensionWorker, STORAGE_ITEMS.settings, { language: 'en' });
  await removeStored(extensionWorker, STORAGE_ITEMS.deviceSettings);

  await page.getByLabel('Import', { exact: true }).setInputFiles({
    name: 'bookmark-scout-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(raw),
  });
  await expect(toastRegion(page).getByText('✓ Backup restored', { exact: true })).toBeVisible();
  await expect
    .poll(() => readSettings(extensionWorker))
    .toMatchObject({ theme: 'dark', quickSaveFixedFolder: '1' });
  expect(await readStored(extensionWorker, STORAGE_ITEMS.prompt, 'p1')).toMatchObject({
    name: 'Backed up',
  });
  expect(await readStored(extensionWorker, STORAGE_ITEMS.aiServices)).toMatchObject({
    services: [{ provider: 'openai', name: 'Work' }],
  });
  expect(await readStored(extensionWorker, STORAGE_ITEMS.aiCredentials)).toEqual({
    openai: { apiKey: 'sk-e2e-backup-secret' },
  });
});
