/**
 * Back up settings and Restore settings (Settings, bottom bar): a backup file made of the parts
 * the user selects (`config/data/backup.toml`: settings, this device's settings, views, prompts,
 * Smart Rules, AI services, AI service keys, covers), with what each holds, how many, and its
 * size; optionally protected with a password. Restoring reads the file without changing anything,
 * shows what each part would add, change, keep, or remove, lets the user pick parts, Merge or
 * Replace, and each conflict, takes a safety copy, then imports, with Undo import afterwards. Each
 * import and its undo is a record in History (the Audit History, `kind: 'data'`), whose Undo is
 * the same Undo import.
 *
 * This is the small part every Settings page loads. The work is in `backup-file.lazy.ts` (the
 * file format and the import), `backup-categories.lazy.ts` (each part), `cover-backup.lazy.ts`
 * (covers), and `lib/backup-crypto.ts` (the password), loaded on first use so Settings opens
 * without them.
 *
 * Nothing is sent anywhere: the file is saved by the browser's download, and read from a file the
 * user picks or drops.
 */
import type {
  BackupExportRequest,
  BackupUndoOutcome,
  BackupUndoUnavailable,
  BuiltBackup,
  ImportOutcome,
  OpenedBackup,
  OpenedPart,
  PartChoice,
  PartEstimate,
  PartReview,
} from './backup-file.lazy';

const loadBackupFile = () => import('./backup-file.lazy');

export type {
  BackupNote,
  ConflictChoice,
  ConflictEntry,
  ImportStrategy,
  ServiceNeedingSetup,
} from './backup-categories.lazy';
export type {
  BackupExportRequest,
  BackupProtection,
  BackupUndoOutcome,
  BackupUndoUnavailable,
  BuiltBackup,
  ImportOutcome,
  OpenedBackup,
  OpenedPart,
  PartChoice,
  PartEstimate,
  PartOutcome,
  PartReview,
} from './backup-file.lazy';

/** Every part's count and size in a backup made now. */
export async function estimateBackupParts(): Promise<Record<string, PartEstimate>> {
  return (await loadBackupFile()).estimateBackup();
}

/** The backup file with the parts and password protection the user chose. */
export async function makeBackupFile(
  request: BackupExportRequest,
  now?: Date,
): Promise<BuiltBackup> {
  return (await loadBackupFile()).buildBackupFile(request, now);
}

/**
 * Reads a file the user chose: null when it is no backup (a plain settings file); throws for a
 * backup that cannot be read. Changes nothing.
 */
export async function openBackup(text: string): Promise<OpenedBackup | null> {
  return (await loadBackupFile()).openBackupFile(text);
}

/** Opens the password-protected parts; rejects on a wrong password or a changed file. */
export async function unlockBackup(opened: OpenedBackup, password: string): Promise<OpenedBackup> {
  return (await loadBackupFile()).unlockBackupFile(opened, password);
}

/** What importing each readable part would do now (a dry run). */
export async function reviewBackupImport(
  opened: OpenedBackup,
  selected?: readonly string[],
): Promise<Record<string, PartReview>> {
  return (await loadBackupFile()).reviewBackup(opened, selected);
}

/** Imports the parts chosen, after taking the safety copy Undo import restores. */
export async function importBackup(
  opened: OpenedBackup,
  choices: Readonly<Record<string, PartChoice>>,
  fileName?: string,
): Promise<ImportOutcome> {
  return (await loadBackupFile()).applyBackup(opened, choices, fileName);
}

/**
 * Undo import of the import History recorded as `operationId`: the one path for the import
 * result, the Undo import button, and History.
 */
export async function undoBackupImport(operationId: string): Promise<BackupUndoOutcome> {
  return (await loadBackupFile()).undoImportFromSnapshot(operationId);
}

/** Whether Undo import can still undo the import `operation` recorded, and why not. */
export async function getBackupUndoAvailability(
  operation: Pick<AuditOperation, 'id' | 'startedAt' | 'undo'>,
): Promise<{ available: true } | { available: false; reason: BackupUndoUnavailable }> {
  return (await loadBackupFile()).checkUndoAvailability(operation);
}

/** Whether a part of an opened file can be imported: known here, unlocked, and readable. */
export function isImportablePart(part: OpenedPart): boolean {
  return part.known && !part.locked && !part.invalid;
}
