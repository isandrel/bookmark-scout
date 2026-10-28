/**
 * The move of every synced list setting to an item of its own
 * (`src/lib/storage/migrations/2026-10-sync-list-shards.ts`); deleted with it.
 */
import { storageAreaKey } from '../../src/lib/storage/registry';
import {
  backupPart,
  openBackupDialog,
  openRestore,
  saveBackup,
  selectOnlyParts,
} from './backup-helpers';
import { expect, test, toastRegion } from './fixtures';
import { readSettings, readStored, STORAGE_ITEMS, writeStoredItems } from './storage';

/**
 * The one item every list setting shared in builds after 0.3.4, which the migration owns; spelled
 * here because specs cannot load the migration module.
 */
const OLD_LISTS_ITEM = { area: 'sync', name: 'settings.lists', v: 1, backup: 'exclude' } as const;

test('an update copies lists kept together, or on this device, into an item each, a change writes its own and the copy 0.3.4 reads, and Undo after Reset All puts the copies back', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  // As 0.3.4 stored them (lists in the settings item), as later builds did (every list in one
  // item), and a menu those builds kept on this device.
  const settings = { language: 'en', privacyScannerSensitiveParams: ['e2e_secret'] };
  const oldLists = {
    urlCleanerRemoveParams: ['utm_e2e', 'ref_e2e'],
    askAiDisabledActions: ['checkLinks'],
  };
  await writeStoredItems(extensionWorker, [
    [STORAGE_ITEMS.settings, settings],
    [OLD_LISTS_ITEM, oldLists],
    [STORAGE_ITEMS.deviceSettings, { managerOrganizeMenu: ['addFolder', 'sortByName'] }],
  ]);
  await extensionWorker.evaluate(() => {
    const installed = chrome.runtime.onInstalled as unknown as {
      dispatch(details: object): void;
    };
    installed.dispatch({ reason: 'update', previousVersion: '0.3.4' });
  });

  const listKeys = () =>
    extensionWorker.evaluate(
      async (prefix) => {
        const keys = Object.keys(await chrome.storage.sync.get(null));
        return keys.filter((key) => key.startsWith(prefix)).sort();
      },
      storageAreaKey(STORAGE_ITEMS.settingsList, ''),
    );
  await expect
    .poll(listKeys)
    .toEqual(
      [
        'askAiDisabledActions',
        'managerOrganizeMenu',
        'privacyScannerSensitiveParams',
        'urlCleanerRemoveParams',
      ].map((key) => storageAreaKey(STORAGE_ITEMS.settingsList, key)),
    );
  // Devices still on an earlier release keep reading the old places, which stay as they were.
  expect(await readStored(extensionWorker, OLD_LISTS_ITEM)).toEqual(oldLists);
  expect(await readStored(extensionWorker, STORAGE_ITEMS.settings)).toEqual(settings);
  // This device's menu now syncs.
  expect(await readStored(extensionWorker, STORAGE_ITEMS.deviceSettings)).toBeUndefined();
  expect(await readSettings(extensionWorker)).toMatchObject({
    urlCleanerRemoveParams: ['utm_e2e', 'ref_e2e'],
    askAiDisabledActions: ['checkLinks'],
    managerOrganizeMenu: ['addFolder', 'sortByName'],
  });

  // Options shows the lists as they were, and removing a name writes that list's item, and the
  // copy 0.3.4 reads in the settings item, so a device still on 0.3.4 sees the change.
  await page.goto(`chrome-extension://${extensionId}/options.html?category=maintenance`);
  const params = page.locator('[data-setting="urlCleanerRemoveParams"]');
  await expect(params.locator('[data-slot="list-chip"]')).toHaveText(['utm_e2e', 'ref_e2e']);
  await extensionWorker.evaluate(() => {
    const seen: string[][] = [];
    Object.assign(globalThis, { e2eSyncWrites: seen });
    chrome.storage.sync.onChanged.addListener((changes) => seen.push(Object.keys(changes)));
  });
  await params.getByRole('button', { name: 'Remove ref_e2e' }).click();
  await expect
    .poll(async () => (await readSettings(extensionWorker)).urlCleanerRemoveParams)
    .toEqual(['utm_e2e']);
  await page.waitForTimeout(500);
  expect(
    await extensionWorker.evaluate(
      () => (globalThis as unknown as { e2eSyncWrites: string[][] }).e2eSyncWrites,
    ),
  ).toEqual([
    [storageAreaKey(STORAGE_ITEMS.settingsList, 'urlCleanerRemoveParams')],
    [storageAreaKey(STORAGE_ITEMS.settings)],
  ]);
  const withCopies = { ...settings, urlCleanerRemoveParams: ['utm_e2e'] };
  expect(await readStored(extensionWorker, STORAGE_ITEMS.settings)).toEqual(withCopies);
  expect(await readStored(extensionWorker, OLD_LISTS_ITEM)).toEqual(oldLists);

  // Reset All removes those copies too, so no device brings a list back.
  await page.getByRole('button', { name: 'Reset All' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reset All' }).click();
  await expect.poll(() => readStored(extensionWorker, STORAGE_ITEMS.settings)).toBeUndefined();

  // Its Undo puts them back as they were, so a device still on 0.3.4 sees the lists again.
  const toast = toastRegion(page).getByRole('status').filter({ hasText: 'Settings reset' });
  await toast.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => readStored(extensionWorker, STORAGE_ITEMS.settings)).toEqual(withCopies);
  await expect(params.locator('[data-slot="list-chip"]')).toHaveText(['utm_e2e']);
  expect(await readSettings(extensionWorker)).toMatchObject({
    urlCleanerRemoveParams: ['utm_e2e'],
    askAiDisabledActions: ['checkLinks'],
    privacyScannerSensitiveParams: ['e2e_secret'],
    managerOrganizeMenu: ['addFolder', 'sortByName'],
  });
});

test('Restore settings with Replace keeps the copies 0.3.4 reads following the lists, and Undo import puts them back', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  // 0.3.4's lists in the settings item, moved by the update and kept there for 0.3.4.
  const settings = {
    language: 'en',
    privacyScannerSensitiveParams: ['e2e_secret'],
    urlCleanerRemoveParams: ['utm_e2e', 'ref_e2e'],
  };
  await writeStoredItems(extensionWorker, [[STORAGE_ITEMS.settings, settings]]);
  await extensionWorker.evaluate(() => {
    const installed = chrome.runtime.onInstalled as unknown as {
      dispatch(details: object): void;
    };
    installed.dispatch({ reason: 'update', previousVersion: '0.3.4' });
  });
  await expect
    .poll(() => readStored(extensionWorker, STORAGE_ITEMS.settingsList, 'urlCleanerRemoveParams'))
    .toEqual(['utm_e2e', 'ref_e2e']);

  await page.goto(`chrome-extension://${extensionId}/options.html?category=maintenance`);
  const backup = await openBackupDialog(page);
  await selectOnlyParts(backup, ['settings']);
  const { raw } = await saveBackup(page, backup);

  const params = page.locator('[data-setting="urlCleanerRemoveParams"]');
  await params.getByRole('button', { name: 'Remove ref_e2e' }).click();
  const changed = { ...settings, urlCleanerRemoveParams: ['utm_e2e'] };
  await expect.poll(() => readStored(extensionWorker, STORAGE_ITEMS.settings)).toEqual(changed);

  const review = await openRestore(page, raw);
  await expect(review.getByText('Counting…')).toHaveCount(0);
  await backupPart(review, 'settings').getByRole('radio', { name: 'Replace' }).click();
  await review.getByRole('button', { name: /^Import \(\d+\)$/ }).click();
  await page
    .getByRole('dialog', { name: 'Replace these parts?' })
    .getByRole('button', { name: 'Replace' })
    .click();
  await expect(review.getByTestId('backup-import-result')).toBeVisible();
  // The restored list, and the copy a device still on 0.3.4 reads, as the backup had them.
  await expect.poll(() => readStored(extensionWorker, STORAGE_ITEMS.settings)).toEqual(settings);
  expect(
    await readStored(extensionWorker, STORAGE_ITEMS.settingsList, 'urlCleanerRemoveParams'),
  ).toEqual(['utm_e2e', 'ref_e2e']);

  await review.getByRole('button', { name: 'Undo import' }).click();
  await expect(toastRegion(page).getByText('✓ Import undone', { exact: true })).toBeVisible();
  await expect.poll(() => readStored(extensionWorker, STORAGE_ITEMS.settings)).toEqual(changed);
  expect(
    await readStored(extensionWorker, STORAGE_ITEMS.settingsList, 'urlCleanerRemoveParams'),
  ).toEqual(['utm_e2e']);
});
