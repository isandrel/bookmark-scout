/**
 * The popup's Recent Folders Max, which 0.3.4 also used for the right-click menu, given to the
 * menu's own count (`src/lib/storage/migrations/2026-10-context-menu-recent-max.ts`); deleted with
 * it.
 */
import { expect, test } from './fixtures';
import { readSettings, readStored, STORAGE_ITEMS, writeStoredItems } from './storage';

test('an update gives the right-click menu the recent folder count a 0.3.4 user chose for both', async ({
  extensionWorker,
}) => {
  // As 0.3.4 stored it: one count for the popup and the menu.
  await writeStoredItems(extensionWorker, [
    [STORAGE_ITEMS.settings, { language: 'en', recentFoldersMax: 3 }],
  ]);
  await extensionWorker.evaluate(() => {
    const installed = chrome.runtime.onInstalled as unknown as {
      dispatch(details: object): void;
    };
    installed.dispatch({ reason: 'update', previousVersion: '0.3.4' });
  });
  await expect
    .poll(() => readStored(extensionWorker, STORAGE_ITEMS.settings))
    .toEqual({ language: 'en', recentFoldersMax: 3, contextMenuRecentMax: 3 });
  expect(await readSettings(extensionWorker)).toMatchObject({
    recentFoldersMax: 3,
    contextMenuRecentMax: 3,
  });
});
