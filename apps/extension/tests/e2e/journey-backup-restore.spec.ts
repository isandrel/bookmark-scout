/**
 * Journey: the user changes synced and device settings in Options, adds a custom prompt, saves a
 * search in the manager, and tags a bookmark; exports a backup; loses all extension storage; and
 * imports the backup. Everything the backup holds comes back, and the API key never enters it.
 */
import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { expect, test, toastRegion } from './fixtures';
import { managerRow, managerUrl, waitForNoOverlay } from './manager-helpers';
import { openOptionsTab } from './options-helpers';
import { seedFolder } from './popup-helpers';
import {
  readSettings,
  readStored,
  STORAGE_ITEMS,
  seedAIServices,
  setSettings,
  writeStored,
} from './storage';

test.use({ viewport: { width: 1400, height: 900 } });

const API_KEY = 'sk-e2e-journey-backup-secret';

function themeChoice(page: Page, name: 'Dark' | 'Light' | 'System') {
  return page.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio', { name });
}

function savedSearchesMenu(page: Page) {
  return page.getByRole('dialog', { name: 'Saved searches' });
}

async function openSavedSearches(page: Page) {
  await page
    .getByTestId('bookmark-table-toolbar')
    .getByRole('button', { name: 'Saved searches' })
    .click();
  await expect(savedSearchesMenu(page)).toBeVisible();
  return savedSearchesMenu(page);
}

test('a backup made after changes in Options and the manager restores them, without the API key', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en', aiEnabled: true });
  await seedAIServices(extensionWorker, [
    { provider: 'openai', name: 'Work', credentials: { apiKey: API_KEY } },
  ]);
  const later = await seedFolder(extensionWorker, 'Later Shelf', []);
  const docs = await seedFolder(extensionWorker, 'E2E Journey Docs', [
    { title: 'Backup Alpha Docs', url: 'https://docs.e2e.invalid/alpha' },
    { title: 'Backup Beta Notes', url: 'https://notes.e2e.invalid/beta' },
  ]);

  // Options: a synced setting (theme), a synced choice and its device-only folder (quick save).
  await openOptionsTab(page, extensionId, 'Appearance');
  await themeChoice(page, 'Dark').click();
  await page.getByRole('tab', { name: 'Saving & Search', exact: true }).click();
  await page
    .getByRole('radiogroup', { name: 'Quick Save Folder' })
    .getByRole('radio', { name: 'Chosen folder' })
    .click();
  await page.getByRole('combobox', { name: 'Folder to Save To' }).click();
  await page.getByRole('combobox', { name: 'Search...' }).fill('Later Shelf');
  await page.getByRole('option', { name: /Later Shelf$/ }).click();

  // Options: a custom prompt for Auto-Tagging.
  await page.getByRole('tab', { name: 'AI Tools', exact: true }).click();
  const promptRow = page.getByTestId('prompt-task').filter({ hasText: 'Auto-Tagging' });
  await promptRow.getByRole('button', { name: 'Customize' }).click();
  const editor = page.getByRole('dialog', { name: /New prompt/ });
  await editor.getByLabel('Name').fill('Journey tags');
  await editor.getByRole('textbox', { name: 'Prompt', exact: true }).fill('JOURNEY PROMPT');
  await editor.getByRole('button', { name: 'Save prompt' }).click();
  await expect(editor).toHaveCount(0);
  await expect(promptRow.getByRole('combobox')).toHaveText('Journey tags');

  await expect
    .poll(() => readSettings(extensionWorker))
    .toMatchObject({
      theme: 'dark',
      quickSaveFolderStrategy: 'fixed',
      quickSaveFixedFolder: later.folderId,
    });
  expect(await readStored(extensionWorker, STORAGE_ITEMS.deviceSettings)).toMatchObject({
    quickSaveFixedFolder: later.folderId,
  });

  // Manager: a saved search, and tags on a bookmark.
  const manager = await context.newPage();
  await manager.goto(managerUrl(extensionId, docs.folderId));
  await manager.getByPlaceholder('Search titles, addresses, folders, and tags').fill('Docs');
  await expect(managerRow(manager, 'Backup Beta Notes')).toHaveCount(0);
  const menu = await openSavedSearches(manager);
  await expect(menu.getByLabel('Name for the current search')).toBeFocused();
  await manager.keyboard.type('Docs only');
  await manager.keyboard.press('Enter');
  await expect(
    toastRegion(manager).getByText('✓ Saved search "Docs only"', { exact: true }),
  ).toBeVisible();
  await manager.keyboard.press('Escape');
  await waitForNoOverlay(manager);

  await manager.goto(managerUrl(extensionId, docs.folderId));
  await managerRow(manager, 'Backup Alpha Docs').getByRole('button', { name: 'Open menu' }).click();
  await manager.getByRole('menuitem', { name: 'View Details' }).click();
  const details = manager.getByRole('dialog', { name: 'Bookmark Details' });
  await details.getByTestId('bookmark-metadata-tags').fill('journey-tag');
  await details.getByRole('button', { name: 'Save Metadata' }).click();
  await expect(details.getByText('Metadata saved.')).toBeVisible();
  await expect
    .poll(() => readStored(extensionWorker, STORAGE_ITEMS.bookmarkMetadata))
    .toEqual({ [docs.ids['Backup Alpha Docs']]: { tags: ['journey-tag'] } });

  // Export from Options.
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Back up settings' }).click();
  const download = await downloadPromise;
  await expect(toastRegion(page).getByText('✓ Backup exported', { exact: true })).toBeVisible();
  const raw = await readFile(await download.path(), 'utf8');
  expect(raw).not.toContain(API_KEY);
  // Tags are keyed by this device's bookmark ids, so the backup leaves them out by design
  // (`backup: 'exclude'` in the storage registry); bookmark exports carry them instead.
  expect(raw).not.toContain('journey-tag');
  expect(raw).toContain('Journey tags');
  expect(raw).toContain('Docs only');

  // Every bit of extension storage is lost.
  await extensionWorker.evaluate(async () => {
    await Promise.all([chrome.storage.sync.clear(), chrome.storage.local.clear()]);
  });
  await writeStored(extensionWorker, STORAGE_ITEMS.settings, { language: 'en' });
  expect(await readSettings(extensionWorker)).toEqual({ language: 'en' });
  expect(await readStored(extensionWorker, STORAGE_ITEMS.aiServices)).toBeUndefined();

  await page.getByLabel('Restore settings', { exact: true }).setInputFiles({
    name: 'bookmark-scout-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(raw),
  });
  await expect(toastRegion(page).getByText('✓ Backup restored', { exact: true })).toBeVisible();

  // Ground truth: both settings scopes, the prompt, the saved search, and the service are back.
  await expect
    .poll(() => readSettings(extensionWorker))
    .toMatchObject({
      theme: 'dark',
      aiEnabled: true,
      quickSaveFolderStrategy: 'fixed',
      quickSaveFixedFolder: later.folderId,
    });
  expect(await readStored(extensionWorker, STORAGE_ITEMS.deviceSettings)).toMatchObject({
    quickSaveFixedFolder: later.folderId,
  });
  const index = await readStored<{ ids: string[]; active: Record<string, string> }>(
    extensionWorker,
    STORAGE_ITEMS.promptIndex,
  );
  expect(index?.active.auto_tagging).toBeDefined();
  expect(
    await readStored(extensionWorker, STORAGE_ITEMS.prompt, index?.active.auto_tagging),
  ).toMatchObject({ name: 'Journey tags', task: 'auto_tagging' });
  expect(await readStored(extensionWorker, STORAGE_ITEMS.savedSearches)).toEqual(
    expect.arrayContaining([expect.objectContaining({ name: 'Docs only' })]),
  );
  expect(await readStored(extensionWorker, STORAGE_ITEMS.aiServices)).toMatchObject({
    services: [{ provider: 'openai', name: 'Work' }],
  });
  // The key was never in the file, so it stays lost and the service waits for it; tags were never
  // in it either.
  expect(await readStored(extensionWorker, STORAGE_ITEMS.aiCredentials)).toEqual({
    openai: { pendingSecrets: ['apiKey'] },
  });
  expect(await readStored(extensionWorker, STORAGE_ITEMS.bookmarkMetadata)).toBeUndefined();

  // The open pages show the restored values.
  await page.getByRole('tab', { name: 'Appearance', exact: true }).click();
  await expect(themeChoice(page, 'Dark')).toBeChecked();
  await manager.goto(managerUrl(extensionId, docs.folderId));
  const restored = await openSavedSearches(manager);
  await restored.getByRole('button', { name: 'Docs only', exact: true }).click();
  await expect(manager.getByPlaceholder('Search titles, addresses, folders, and tags')).toHaveValue(
    'Docs',
  );
  await expect(managerRow(manager, 'Backup Alpha Docs')).toHaveCount(1);
  await expect(managerRow(manager, 'Backup Beta Notes')).toHaveCount(0);
});
