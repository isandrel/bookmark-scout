/**
 * The safety copy Restore settings takes before it changes anything (`INDEXED_DATABASES.backupUndo`):
 * what each part it imports held before, so Undo import can put it back. One copy at a time, the
 * last restore's, named by its History record (a `kind: 'data'` record in the Audit History); it
 * expires after `[undo] keep_hours` in `config/data/backup.toml` and is then
 * removed on the next read. IndexedDB, not extension storage: covers are images, and a copy with
 * them can be far larger than extension storage allows.
 *
 * When the AI service keys were restored, the copy holds the keys they replaced: on this device
 * only, next to where the keys are stored anyway, and never in a backup, a log, or a message.
 */
import { type DBSchema, type IDBPDatabase, openDB } from 'idb';
import { z } from 'zod';

/**
 * What Undo import needs: the History record of the import it undoes, when, from which file, the
 * parts in import order, and their copies.
 */
export type BackupUndoRecord = {
  operationId: string;
  createdAt: number;
  fileName?: string;
  parts: string[];
  /** By part id: what `CategoryHandler.snapshot` copied. */
  snapshots: Record<string, unknown>;
};

const recordSchema = z.object({
  operationId: z.string().min(1),
  createdAt: z.number().finite(),
  fileName: z.string().optional(),
  parts: z.array(z.string()),
  snapshots: z.record(z.string(), z.unknown()),
});

/** The one record's key. */
const LAST_IMPORT = 'last';

interface UndoDb extends DBSchema {
  imports: { key: string; value: BackupUndoRecord & { id: string } };
}

const UNDO_DB_VERSION = 1;

/** Broadcast after every change, so another Settings tab shows or hides Undo import. */
export const BACKUP_UNDO_CHANNEL = 'bookmark-scout-backup-undo';

let database: Promise<IDBPDatabase<UndoDb>> | undefined;

function openUndoDb(): Promise<IDBPDatabase<UndoDb>> {
  database ??= openDB<UndoDb>(INDEXED_DATABASES.backupUndo.name, UNDO_DB_VERSION, {
    upgrade(db) {
      db.createObjectStore('imports', { keyPath: 'id' });
    },
    blocking() {
      void database?.then((db) => db.close());
      database = undefined;
    },
    terminated() {
      database = undefined;
    },
  }).catch((error: unknown) => {
    database = undefined;
    throw error;
  });
  return database;
}

function announce(): void {
  try {
    const channel = new BroadcastChannel(BACKUP_UNDO_CHANNEL);
    channel.postMessage('changed');
    channel.close();
  } catch {
    // No BroadcastChannel: other pages see the change on their next read.
  }
}

/** Stores `record` as the last import's copy, replacing any earlier one. */
export async function saveBackupUndo(record: BackupUndoRecord): Promise<void> {
  const db = await openUndoDb();
  await db.put('imports', { id: LAST_IMPORT, ...record });
  announce();
}

/** The last import's copy while Undo import is offered; an expired one is removed. */
export async function getBackupUndo(now = Date.now()): Promise<BackupUndoRecord | undefined> {
  const db = await openUndoDb();
  const parsed = recordSchema.safeParse(await db.get('imports', LAST_IMPORT));
  if (!parsed.success) return undefined;
  if (now - parsed.data.createdAt >= BACKUP_LIMITS.undoKeepMs || parsed.data.createdAt > now) {
    await clearBackupUndo();
    return undefined;
  }
  return parsed.data;
}

/** Removes the copy, after Undo import or once it expired. */
export async function clearBackupUndo(): Promise<void> {
  const db = await openUndoDb();
  await db.delete('imports', LAST_IMPORT);
  announce();
}

/** Calls back after each change to the copy, from any page; returns the unsubscribe. */
export function watchBackupUndo(callback: () => void): () => void {
  let channel: BroadcastChannel | undefined;
  try {
    channel = new BroadcastChannel(BACKUP_UNDO_CHANNEL);
    channel.onmessage = () => callback();
  } catch {
    return () => undefined;
  }
  return () => channel?.close();
}

/** Closes the database, for tests that delete it between cases. */
export async function closeBackupUndoDb(): Promise<void> {
  const open = database;
  database = undefined;
  (await open?.catch(() => undefined))?.close();
}
