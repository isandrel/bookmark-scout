/**
 * Covers in the backup file: Back up settings asks whether to include the covers stored on this
 * device (Include Covers in Backups is the box's default) and writes them by address; Restore
 * settings reviews what restoring them would do, then puts them on the bookmarks of the same
 * address, whatever their ids, never over a cover the user picked.
 */
import { readFile } from 'node:fs/promises';
import type { Page, Worker } from '@playwright/test';
import { expect, test, toastRegion } from './fixtures';
import { readCoverInfos, seedCover } from './manager-helpers';
import { seedFolder } from './popup-helpers';
import { setSettings } from './storage';

const DAY = 86_400_000;
const ALPHA = 'https://alpha.e2e.invalid/story';
const BETA = 'https://beta.e2e.invalid/notes';
const GAMMA = 'https://gamma.e2e.invalid/';

/** Deletes every stored cover, as Delete covers in Options does. */
async function clearCoverStore(worker: Worker) {
  await worker.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('bookmark-scout-covers', 1);
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(['info', 'images'], 'readwrite');
      transaction.objectStore('info').clear();
      transaction.objectStore('images').clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  });
}

/** Clicks Back up settings, answers its dialog, and returns the saved file's JSON. */
async function backUp(page: Page, includeCovers: boolean) {
  await page.getByRole('button', { name: 'Back up settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Back up settings' });
  const box = dialog.getByRole('checkbox', { name: 'Include covers' });
  if ((await box.isChecked()) !== includeCovers) await box.click();
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Save backup' }).click();
  const download = await downloadPromise;
  await expect(dialog).toHaveCount(0);
  return { raw: await readFile(await download.path(), 'utf8'), dialog };
}

async function restore(page: Page, raw: string) {
  await page.getByLabel('Restore settings', { exact: true }).setInputFiles({
    name: 'bookmark-scout-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(raw),
  });
}

test('a backup with covers restores them by address on matching bookmarks after a review, keeping a picked cover', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en' });
  const seeded = await seedFolder(extensionWorker, 'E2E Cover Backup', [
    { title: 'Alpha', url: ALPHA },
    { title: 'Beta', url: BETA },
    { title: 'Gamma', url: GAMMA },
  ]);
  const ids = seeded.ids as Record<'Alpha' | 'Beta' | 'Gamma', string>;
  await seedCover(extensionWorker, ids.Alpha, ALPHA, undefined, {
    source: 'page',
    savedAt: 5 * DAY,
  });
  await seedCover(extensionWorker, ids.Beta, BETA, undefined, { source: 'tab', savedAt: 4 * DAY });
  await seedCover(extensionWorker, ids.Gamma, GAMMA, undefined, {
    source: 'page',
    savedAt: 3 * DAY,
  });

  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByRole('button', { name: 'Back up settings' }).click();
  const choice = page.getByTestId('backup-covers-choice');
  // Include Covers in Backups is on by default, and the dialog says what covers add.
  await expect(choice.getByRole('checkbox', { name: 'Include covers' })).toBeChecked();
  await expect(choice).toContainText('Covers: 3, adding about');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const { raw } = await backUp(page, true);
  await expect(
    toastRegion(page).getByText(
      'The file holds your settings, prompts, AI services, saved searches, and covers (3). API keys are never included.',
      { exact: true },
    ),
  ).toBeVisible();
  const file = JSON.parse(raw);
  expect(
    file.covers.map((cover: { url: string; source: string; savedAt: string }) => [
      cover.url,
      cover.source,
      cover.savedAt,
    ]),
  ).toEqual([
    [ALPHA, 'page', new Date(5 * DAY).toISOString()],
    [BETA, 'tab', new Date(4 * DAY).toISOString()],
    [GAMMA, 'page', new Date(3 * DAY).toISOString()],
  ]);
  expect(file.covers[0]).toMatchObject({ type: 'image/png', width: 600, height: 314 });
  expect(Buffer.from(file.covers[0].data, 'base64').byteLength).toBe(file.covers[0].bytes);

  // Another computer, as far as covers go: none stored, Beta saved again under a new id, Gamma
  // missing, and a cover Alpha's user picked there (older than the file's page image).
  await clearCoverStore(extensionWorker);
  await extensionWorker.evaluate(
    async ({ beta, gamma }) => {
      await chrome.bookmarks.remove(beta);
      await chrome.bookmarks.remove(gamma);
    },
    { beta: ids.Beta, gamma: ids.Gamma },
  );
  const again = await seedFolder(extensionWorker, 'E2E Cover Backup Again', [
    { title: 'Beta', url: BETA },
  ]);
  const newBeta = again.ids.Beta ?? '';
  expect(newBeta).not.toBe(ids.Beta);
  await seedCover(
    extensionWorker,
    ids.Alpha,
    ALPHA,
    { width: 700, height: 400 },
    {
      source: 'tab',
      savedAt: 1 * DAY,
    },
  );

  await page.reload();
  await restore(page, raw);
  const review = page.getByRole('dialog', { name: 'Restore backup' });
  await expect(review.getByTestId('backup-covers-review')).toContainText(
    [
      'Covers in the file: 3',
      'With a bookmark of the same address here: 2',
      'Without a bookmark of that address here: 1',
      'Bookmarks getting a cover: 1',
      'Covers replaced by a newer one: 0',
      'Covers kept (picked with Use this view as the cover, or newer than the file’s): 1',
    ].join(''),
  );
  await expect(review.getByRole('checkbox', { name: 'Restore covers' })).toBeChecked();
  await review.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(
    toastRegion(page).getByText(
      'Your settings, prompts, AI services, and saved searches were restored. Backups have no API keys: add any that are missing in Settings > AI. Covers restored: 1. Kept as they were: 1. Without a bookmark here: 1. Left out: 0.',
      { exact: true },
    ),
  ).toBeVisible();

  const infos = await readCoverInfos(extensionWorker);
  expect(
    infos
      .map(({ bookmarkId, url, width, source, savedAt }) => ({
        bookmarkId,
        url,
        width,
        source,
        savedAt,
      }))
      .sort((a, b) => a.url.localeCompare(b.url)),
  ).toEqual([
    // The picked cover stays, though the file's is newer.
    { bookmarkId: ids.Alpha, url: ALPHA, width: 700, source: 'tab', savedAt: DAY },
    { bookmarkId: newBeta, url: BETA, width: 600, source: 'tab', savedAt: 4 * DAY },
  ]);
});

test('a backup without covers has no covers section, and restoring it asks nothing', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  // Include Covers in Backups off: the box starts unchecked.
  await setSettings(extensionWorker, { language: 'en', backupIncludeCovers: false });
  const seeded = await seedFolder(extensionWorker, 'E2E Cover Backup Off', [
    { title: 'Alpha', url: ALPHA },
  ]);
  await seedCover(extensionWorker, seeded.ids.Alpha ?? '', ALPHA);

  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByRole('button', { name: 'Back up settings' }).click();
  await expect(
    page
      .getByRole('dialog', { name: 'Back up settings' })
      .getByRole('checkbox', { name: 'Include covers' }),
  ).not.toBeChecked();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const { raw } = await backUp(page, false);
  await expect(
    toastRegion(page).getByText(
      'The file holds your settings, prompts, AI services, and saved searches. API keys are never included.',
      { exact: true },
    ),
  ).toBeVisible();
  expect(JSON.parse(raw)).not.toHaveProperty('covers');

  await clearCoverStore(extensionWorker);
  await restore(page, raw);
  await expect(toastRegion(page).getByText('✓ Backup restored', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await readCoverInfos(extensionWorker)).toEqual([]);
});
