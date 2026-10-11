import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { readSettings, setSettings } from './storage';

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
  await page.evaluate(() => {
    void navigator.locks.request('sync:settings', () => new Promise(() => undefined));
  });
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
