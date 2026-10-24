/**
 * Covers in the backup file: the Covers part (in Parts in New Backups by default) writes the
 * covers stored on this device by address; Restore settings reviews what importing them would do,
 * then puts them on the bookmarks of the same address, whatever their ids, never over a cover the
 * user picked (Merge). The import is one record in the manager's History, whose Undo import puts
 * the covers back.
 */
import type { Worker } from '@playwright/test';
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
import { readCoverInfos, seedCover } from './manager-helpers';
import { seedFolder } from './popup-helpers';
import { readSettings, setSettings } from './storage';

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
  const dialog = await openBackupDialog(page);
  // Covers are in Parts in New Backups by default, marked large, with their count and size.
  await expect(partCheckbox(dialog, 'covers')).toBeChecked();
  await expect(backupPart(dialog, 'covers')).toContainText('Large');
  await expect(backupPart(dialog, 'covers').getByTestId('backup-part-meta')).toHaveText(
    /^Items: 3 · About [\d.]+ KB$/,
  );
  await selectOnlyParts(dialog, ['covers']);
  const { raw } = await saveBackup(page, dialog);
  const file = JSON.parse(raw);
  const covers = file.sections.covers.covers;
  expect(
    covers.map((cover: { url: string; source: string; savedAt: string }) => [
      cover.url,
      cover.source,
      cover.savedAt,
    ]),
  ).toEqual([
    [ALPHA, 'page', new Date(5 * DAY).toISOString()],
    [BETA, 'tab', new Date(4 * DAY).toISOString()],
    [GAMMA, 'page', new Date(3 * DAY).toISOString()],
  ]);
  expect(covers[0]).toMatchObject({ type: 'image/png', width: 600, height: 314 });
  expect(Buffer.from(covers[0].data, 'base64').byteLength).toBe(covers[0].bytes);

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
  const review = await openRestore(page, raw);
  const part = backupPart(review, 'covers');
  await expect(part.getByTestId('backup-review-counts')).toHaveText(
    'In the file: 3 · Adds 1 · Changes 0 · Same here: 1',
  );
  await expect(part).toContainText('With a bookmark of the same address here: 2');
  await expect(part).toContainText('Without a bookmark of that address here: 1');
  await importParts(review);
  await expect(review.getByTestId('backup-outcome').filter({ hasText: 'Covers' })).toContainText(
    'Added 1 · Changed 0 · Removed 0 · Kept 1 · Skipped 0',
  );

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

test('a backup without the Covers part has no covers, and restoring it offers none', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  // Parts in New Backups without covers: the box starts unchecked.
  await setSettings(extensionWorker, { language: 'en', backupExportCategories: ['settings'] });
  const seeded = await seedFolder(extensionWorker, 'E2E Cover Backup Off', [
    { title: 'Alpha', url: ALPHA },
  ]);
  await seedCover(extensionWorker, seeded.ids.Alpha ?? '', ALPHA);

  await page.goto(`chrome-extension://${extensionId}/options.html`);
  const dialog = await openBackupDialog(page);
  await expect(partCheckbox(dialog, 'covers')).not.toBeChecked();
  const { raw } = await saveBackup(page, dialog);
  expect(JSON.parse(raw).sections).not.toHaveProperty('covers');

  await clearCoverStore(extensionWorker);
  const review = await openRestore(page, raw);
  await expect(backupPart(review, 'covers')).toHaveCount(0);
  await importParts(review);
  expect(await readCoverInfos(extensionWorker)).toEqual([]);
});

test('a backup import is one record in History, and Undo import there puts back the settings and covers', async ({
  extensionId,
  extensionWorker,
  page,
  context,
}) => {
  await setSettings(extensionWorker, { language: 'en', theme: 'dark' });
  const seeded = await seedFolder(extensionWorker, 'E2E Cover History', [
    { title: 'Alpha', url: ALPHA },
  ]);
  const alpha = seeded.ids.Alpha ?? '';
  await seedCover(extensionWorker, alpha, ALPHA, undefined, { source: 'page', savedAt: 5 * DAY });
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  const dialog = await openBackupDialog(page);
  await selectOnlyParts(dialog, ['settings', 'covers']);
  const { raw, filename } = await saveBackup(page, dialog);

  // After the backup: another theme, and an older cover on Alpha.
  await setSettings(extensionWorker, { theme: 'light' });
  await clearCoverStore(extensionWorker);
  await seedCover(extensionWorker, alpha, ALPHA, undefined, { source: 'page', savedAt: 1 * DAY });
  const review = await openRestore(page, raw, filename);
  await importParts(review);
  await expect.poll(async () => (await readSettings(extensionWorker)).theme).toBe('dark');
  await expect
    .poll(async () => (await readCoverInfos(extensionWorker)).map((info) => info.savedAt))
    .toEqual([5 * DAY]);
  await review.getByRole('button', { name: 'Close' }).first().click();

  const manager = await context.newPage();
  await manager.goto(`chrome-extension://${extensionId}/bookmarks.html`);
  await manager.getByRole('button', { name: 'Bookmark history' }).click();
  const history = manager.getByTestId('history-dialog');
  await history.getByRole('radio', { name: 'Backups' }).click();
  const record = history.getByTestId('history-record');
  await expect(record).toHaveCount(1);
  await expect(record.getByTestId('history-record-label')).toHaveText('Imported backup');
  await expect(record).toContainText('Settings and Covers');
  await record.getByRole('button', { expanded: false }).click();
  await expect(record.getByTestId('history-record-facts')).toContainText(filename);
  await expect(record.getByTestId('history-data-part')).toHaveText([
    /Settings.*Merge · Added 0 · Changed 1 · Removed 0 · Skipped 0/,
    /Covers.*Merge · Added 0 · Changed 1 · Removed 0 · Skipped 0/,
  ]);
  await record.getByRole('button', { name: 'Undo import' }).click();
  await expect(toastRegion(manager).getByText('✓ Import undone', { exact: true })).toBeVisible();
  await expect.poll(async () => (await readSettings(extensionWorker)).theme).toBe('light');
  await expect
    .poll(async () => (await readCoverInfos(extensionWorker)).map((info) => info.savedAt))
    .toEqual([DAY]);
  // The undo is its own record, linked to the import, which shows as undone.
  await expect(history.getByTestId('history-record-label')).toHaveText([
    'Undone: Imported backup',
    'Imported backup',
  ]);
  await expect(history.getByTestId('history-record').nth(1)).toContainText('Undone');
});
