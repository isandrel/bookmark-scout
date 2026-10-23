/**
 * The move of every synced list setting to an item of its own
 * (`src/lib/storage/migrations/2026-10-sync-list-shards.ts`); deleted with it.
 */
import { storageAreaKey } from '../../src/lib/storage/registry';
import { expect, test } from './fixtures';
import { readSettings, readStored, STORAGE_ITEMS, writeStoredItems } from './storage';

/**
 * The one item every list setting shared in builds after 0.3.4, which the migration owns; spelled
 * here because specs cannot load the migration module.
 */
const OLD_LISTS_ITEM = { area: 'sync', name: 'settings.lists', v: 1, backup: 'exclude' } as const;

test('an update copies lists kept together, or on this device, into an item each, and a change writes only its own', async ({
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

  // Options shows the lists as they were, and removing a name writes that list's item alone.
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
  ).toEqual([[storageAreaKey(STORAGE_ITEMS.settingsList, 'urlCleanerRemoveParams')]]);
  expect(await readStored(extensionWorker, OLD_LISTS_ITEM)).toEqual(oldLists);
});
