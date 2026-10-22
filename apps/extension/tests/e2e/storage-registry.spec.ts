import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { managerUrl } from './manager-helpers';
import { seedFolder } from './popup-helpers';
import {
  readSettings,
  readStored,
  STORAGE_ITEMS,
  seedAIServices,
  setSettings,
  writeStoredItems,
} from './storage';

async function openBehaviorOptions(page: Page, extensionId: string) {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByRole('tab', { name: 'Behavior' }).click();
  await expect(page.locator('[data-setting="confirmBeforeDelete"]')).toBeVisible();
}

/**
 * Returns every sync storage read on the page a second late, as it was when the read began, so
 * saves started together would each work from a copy the other is about to replace.
 */
async function slowSyncReads(page: Page) {
  await page.evaluate(() => {
    const area = chrome.storage.sync;
    const get = area.get.bind(area) as (keys?: unknown) => Promise<Record<string, unknown>>;
    Object.defineProperty(area, 'get', {
      configurable: true,
      value: async (keys?: unknown) => {
        const result = await get(keys);
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        return result;
      },
    });
  });
}

test('the service worker and extension pages share Web Locks', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  // A lock the page holds keeps the service worker's request for the same name waiting.
  // Resolves once the lock is granted, so the worker is asked only after the page holds it.
  await page.evaluate(
    () =>
      new Promise<void>((granted) => {
        void navigator.locks.request('sync:settings', () => {
          granted();
          return new Promise(() => undefined);
        });
      }),
  );
  expect(
    await extensionWorker.evaluate(async () => {
      const held = await navigator.locks.query();
      return held.held?.map((lock) => lock.name);
    }),
  ).toContain('sync:settings');
  expect(
    await extensionWorker.evaluate(() =>
      navigator.locks.request('sync:settings', { ifAvailable: true }, (lock) => lock !== null),
    ),
  ).toBe(false);
});

test('two Options tabs saving different settings at once both keep their change', async ({
  context,
  extensionId,
  extensionWorker,
}) => {
  await setSettings(extensionWorker, { language: 'en' });
  const first = await context.newPage();
  const second = await context.newPage();
  await openBehaviorOptions(first, extensionId);
  await openBehaviorOptions(second, extensionId);
  await slowSyncReads(first);
  await slowSyncReads(second);

  await Promise.all([
    first.locator('[data-setting="confirmBeforeDelete"]').getByRole('switch').click(),
    second.locator('[data-setting="groupByFolders"]').getByRole('switch').click(),
  ]);

  // Each save reads the settings inside a Web Lock shared by every page, so neither write is
  // computed from a copy the other one has already replaced.
  await expect
    .poll(() => readSettings(extensionWorker), { timeout: 10_000 })
    .toMatchObject({ confirmBeforeDelete: false, groupByFolders: false });
  await first.waitForTimeout(1_500);
  expect(await readSettings(extensionWorker)).toMatchObject({
    language: 'en',
    confirmBeforeDelete: false,
    groupByFolders: false,
  });
});

// Chrome cannot update an unpacked extension in a test, so the update's `onInstalled` event is
// dispatched in the service worker, reaching the listeners the background registered at start.
test('an update from 0.3.3 removes only older keys, keeps what 0.3.3 stored, and opens no welcome page', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  // What a 0.3.3 profile holds (more of it in tests/unit/upgrade-from-0.3.3.test.ts), and data
  // from a release before it under a key this release does not list.
  const folder = await seedFolder(extensionWorker, 'E2E Update', [
    { title: 'Beta', url: 'https://e2e.invalid/beta' },
    { title: 'Alpha', url: 'https://e2e.invalid/alpha' },
  ]);
  await writeStoredItems(extensionWorker, [
    [STORAGE_ITEMS.settings, { language: 'en', sortOrder: 'date' }],
    [
      STORAGE_ITEMS.tableView,
      {
        columnVisibility: { id: false },
        columnOrder: ['select', 'title', 'url', 'dateAdded'],
        sorting: [{ id: 'title', desc: false }],
        browserOrder: false,
      },
    ],
  ]);
  await seedAIServices(extensionWorker, [
    { provider: 'openai', name: 'Work', credentials: { apiKey: 'sk-synthetic' } },
  ]);
  const legacyKey = 'bookmark-scout-settings';
  const keysIn = (area: 'local' | 'sync') =>
    extensionWorker.evaluate(
      async (name) => Object.keys(await chrome.storage[name].get(null)).sort(),
      area,
    );
  await extensionWorker.evaluate(
    (key) => chrome.storage.sync.set({ [key]: { theme: 'dark' } }),
    legacyKey,
  );
  const kept = {
    local: await keysIn('local'),
    sync: (await keysIn('sync')).filter((key) => key !== legacyKey),
  };
  expect(kept.sync).toHaveLength(2);

  await extensionWorker.evaluate(() => {
    const installed = chrome.runtime.onInstalled as unknown as {
      dispatch(details: object): void;
    };
    installed.dispatch({ reason: 'update', previousVersion: '0.3.3' });
  });

  await expect.poll(() => keysIn('sync')).toEqual(kept.sync);
  expect(await keysIn('local')).toEqual(kept.local);
  expect(await readSettings(extensionWorker)).toEqual({ language: 'en', sortOrder: 'date' });
  expect(await readStored(extensionWorker, STORAGE_ITEMS.aiCredentials)).toEqual({
    openai: { apiKey: 'sk-synthetic' },
  });

  // The manager shows the view 0.3.3 saved.
  await page.goto(managerUrl(extensionId, folder.folderId));
  await expect(page.getByTestId('table-order-status')).toHaveText('Order: Title, sorted ascending');
  await expect(page.locator('tbody tr').first()).toContainText('Alpha');
  // The welcome page is for a first install only.
  expect(context.pages().map((open) => new URL(open.url()).pathname)).not.toContain(
    '/welcome.html',
  );
});
