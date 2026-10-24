/**
 * Backup file converters: each turns a backup file of one format into the next, so a file any
 * release saved still restores (`services/backup-file.lazy.ts`). Unlike a storage migration a
 * converter is never removed. Kept apart from `./index.ts`, which every page loads, so only the
 * restore loads them.
 */
import { backupParts } from './2026-10-backup-parts';
import { type Envelope, upgradeBackupItems } from './index';

/**
 * Turns a backup file of format `from` into format `to`, the next one. Unlike a storage
 * migration, a converter is never removed: a file saved today may be restored years later. It may
 * call `upgradeItems` (`upgradeBackupItems`) on stored items the file holds.
 */
export type BackupFileConverter = {
  readonly id: string;
  readonly from: number;
  readonly to: number;
  convert(
    file: unknown,
    upgradeItems: (items: Record<string, Envelope>) => Record<string, Envelope>,
  ): unknown;
};

/** Every backup file converter, oldest format first. */
export const BACKUP_FILE_CONVERTERS: readonly BackupFileConverter[] = [backupParts];

/**
 * A backup file of format `version` as format `current`, through each converter in turn; throws
 * `error_invalidBackupFile` when no converter goes from a format on the way.
 */
export function upgradeBackupFile(file: unknown, version: number, current: number): unknown {
  let upgraded = file;
  for (let at = version; at < current; ) {
    const converter = BACKUP_FILE_CONVERTERS.find(({ from }) => from === at);
    if (!converter) throw new Error(t('error_invalidBackupFile'));
    upgraded = converter.convert(upgraded, upgradeBackupItems);
    at = converter.to;
  }
  return upgraded;
}
