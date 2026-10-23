import { vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { closeBackupUndoDb } from '@/lib/backup-undo-store';
import { closeAuditDb } from '@/lib/bookmark-audit-store';
import { INDEXED_DATABASES } from '@/lib/storage/registry';
import { type ImportStrategy, importBackup, openBackup, type PartChoice } from '@/services/backup';

/** The fake browser has no manifest; a backup names the version that made it. */
export function stubManifestVersion(version = '0.3.4') {
  vi.spyOn(fakeBrowser.runtime, 'getManifest').mockReturnValue({
    manifest_version: 3,
    name: 'Bookmark Scout',
    version,
  });
}

/** Opens `json` as Restore settings does and imports `choices` (part id to strategy). */
export async function restoreParts(
  json: string,
  choices: Readonly<Record<string, ImportStrategy | PartChoice>>,
) {
  const opened = await openBackup(json);
  if (!opened) throw new Error('not a backup');
  return importBackup(
    opened,
    Object.fromEntries(
      Object.entries(choices).map(([id, choice]) => [
        id,
        typeof choice === 'string' ? { strategy: choice, conflicts: 'file' as const } : choice,
      ]),
    ),
    'backup.json',
  );
}

/** A backup file of format 1 (before parts), as releases up to October 2026 saved it. */
export function formatOneFile(
  items: Record<string, unknown>,
  extra: { aiEndpoints?: unknown; covers?: unknown[] } = {},
): string {
  return JSON.stringify({
    format: 'bookmark-scout-backup',
    version: 1,
    exportedAt: '2026-10-11T00:00:00.000Z',
    items,
    ...extra,
  });
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

/** Empties History and the safety copy between tests. */
export async function resetBackupDatabases() {
  await closeAuditDb();
  await closeBackupUndoDb();
  await deleteDatabase(INDEXED_DATABASES.bookmarkAudit.name);
  await deleteDatabase(INDEXED_DATABASES.backupUndo.name);
}
