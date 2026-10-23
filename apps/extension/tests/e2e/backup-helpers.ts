/**
 * Driving Back up settings and Restore settings in Options (`BackupDialogs.lazy.tsx`): the export
 * dialog's parts, saving the file, and the import dialog.
 */
import { readFile } from 'node:fs/promises';
import type { Locator, Page } from '@playwright/test';
import { expect } from './fixtures';

/** Opens Back up settings and waits for each part's count. */
export async function openBackupDialog(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Back up settings' }).click();
  const dialog = page.getByTestId('backup-export-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Counting…')).toHaveCount(0);
  return dialog;
}

/** A part's row in either dialog, by part id. */
export function backupPart(dialog: Locator, id: string): Locator {
  return dialog.locator(`[data-part="${id}"]`);
}

/** The checkbox that selects a part, the first in its row. */
export function partCheckbox(dialog: Locator, id: string): Locator {
  return backupPart(dialog, id).getByRole('checkbox').first();
}

/** Selects exactly `ids` among the parts that are not secret. */
export async function selectOnlyParts(dialog: Locator, ids: readonly string[]) {
  await dialog.getByRole('button', { name: 'Select none' }).click();
  for (const id of ids) await partCheckbox(dialog, id).check();
}

/** Clicks Save backup and returns the saved file's text and name. */
export async function saveBackup(page: Page, dialog: Locator) {
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Save backup' }).click();
  const download = await downloadPromise;
  await expect(dialog).toHaveCount(0);
  return {
    raw: await readFile(await download.path(), 'utf8'),
    filename: download.suggestedFilename(),
  };
}

/** Picks `raw` in Restore settings and returns the import dialog. */
export async function openRestore(page: Page, raw: string, name = 'backup.json') {
  await page.getByLabel('Restore settings', { exact: true }).setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(raw),
  });
  const dialog = page.getByTestId('backup-import-dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Waits for every part's review, then clicks Import. */
export async function importParts(dialog: Locator) {
  await expect(dialog.getByText('Counting…')).toHaveCount(0);
  await dialog.getByRole('button', { name: /^Import \(\d+\)$/ }).click();
  await expect(dialog.getByTestId('backup-import-result')).toBeVisible();
}
