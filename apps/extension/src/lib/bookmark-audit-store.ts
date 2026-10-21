/**
 * The Bookmark Audit History's storage: one record per change Bookmark Scout made to bookmarks
 * (and, later, per change seen from elsewhere), kept on this device in IndexedDB so it outlives
 * the browser session, unlike the Ctrl+Z history (`services/bookmark-history.ts`, session
 * storage). It is a local activity record, not a tamper-proof audit: it can be cleared, and it
 * knows nothing from before it started or from while the extension was off.
 *
 * Why IndexedDB and not `storage.local`: a record of a large cleanup names every item it touched,
 * and `storage.local` is capped near 10 MB for the whole extension. IndexedDB in the extension's
 * origin has the browser's ordinary quota, needs no extra permission, and is never synced. The
 * database is listed in `INDEXED_DATABASES` (`storage/registry.ts`) next to the storage items.
 *
 * Summaries (`operations`) and item rows (`details`) are separate stores, so the list stays cheap
 * and the rows load only when a record is opened. Every write is read back before it counts:
 * `putAuditOperation` throws when the record cannot be stored as written, so a destructive change
 * can refuse to start without one (fail closed). Pages hear about writes from other pages and the
 * background through `AUDIT_CHANNEL` (a BroadcastChannel; IndexedDB has no change events).
 *
 * No React here: the background writes records too.
 */
import { type DBSchema, type IDBPDatabase, openDB } from 'idb';
import { z } from 'zod';

const auditConfig = readConfig(
  'bookmarks/audit',
  z.strictObject({
    retention_days: z.number().int().positive(),
    max_operations: z.number().int().positive(),
    max_items_per_operation: z.number().int().positive(),
    interrupted_after_ms: z.number().int().positive(),
  }),
);

export const AUDIT_LIMITS = {
  retentionMs: auditConfig.retention_days * MS_PER_DAY,
  maxOperations: auditConfig.max_operations,
  maxItemsPerOperation: auditConfig.max_items_per_operation,
  interruptedAfterMs: auditConfig.interrupted_after_ms,
} as const;

/** The shape version of stored records; a reader refuses records of a newer version. */
export const AUDIT_SCHEMA_VERSION = 1;

/**
 * Where a change came from, as far as it is known. Extension surfaces are known because the
 * extension made the change; `source_unknown` (a browser event no own change explains) and
 * `reconciliation` (a difference found after a gap) never claim a writer.
 */
export const AUDIT_SOURCES = [
  'manager',
  'tools',
  'popup',
  'sidepanel',
  'options',
  'quick_save',
  'context_menu',
  'ask_ai',
  'local_agent',
  'import',
  'background',
  'source_unknown',
  'reconciliation',
] as const;
export type AuditSource = (typeof AUDIT_SOURCES)[number];

export const AUDIT_ACTORS = ['user', 'ask_ai', 'local_agent', 'system', 'unknown'] as const;
export type AuditActor = (typeof AUDIT_ACTORS)[number];

/**
 * `prepared`: reserved before the first write. `verified_success`: everything planned was done
 * and read back as intended. `partially_applied`: some was done, some skipped or failed.
 * `failed`: nothing was done. `needs_review`: interrupted, or the result did not read back as
 * intended. `observed`: a change seen from elsewhere.
 */
export const AUDIT_STATES = [
  'prepared',
  'verified_success',
  'partially_applied',
  'failed',
  'needs_review',
  'conflicted',
  'observed',
] as const;
export type AuditState = (typeof AUDIT_STATES)[number];

/** States a record keeps until the user resolves it: age and Clear never remove these. */
export const UNRESOLVED_AUDIT_STATES: readonly AuditState[] = [
  'prepared',
  'needs_review',
  'conflicted',
];

const labelSchema = z.object({
  action: z.enum(['add', 'edit', 'move', 'delete', 'sort', 'change', 'import']),
  title: z.string().optional(),
  count: z.number().int().nonnegative().optional(),
  /** Message key of the Tools sidebar tool that made the change. */
  tool: z.string().optional(),
});
export type AuditLabel = z.infer<typeof labelSchema>;

const countsSchema = z.object({
  planned: z.number().int().nonnegative(),
  applied: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});
export type AuditCounts = z.infer<typeof countsSchema>;

export const auditOperationSchema = z.object({
  id: z.string().min(1),
  schemaVersion: z.literal(AUDIT_SCHEMA_VERSION),
  startedAt: z.number(),
  finishedAt: z.number().optional(),
  label: labelSchema,
  source: z.enum(AUDIT_SOURCES),
  actor: z.enum(AUDIT_ACTORS),
  /** A name the agent gave itself; never verified, and shown as such. */
  actorLabel: z.string().max(200).optional(),
  state: z.enum(AUDIT_STATES),
  counts: countsSchema,
  verification: z
    .object({
      status: z.enum(['passed', 'failed', 'not_run']),
      mismatchCount: z.number().int().nonnegative().optional(),
    })
    .optional(),
  /** The Ctrl+Z history entry for this change, while the session keeps it. */
  undoHistoryId: z.string().optional(),
  /** Set on the record of an undo or redo; its label is that of the change it replays. */
  replay: z.enum(['undo', 'redo']).optional(),
  /** The record this one undoes or redoes. */
  relatedOperationId: z.string().optional(),
  /** Set on a record once a later undo of it ran: which record, and whether all came back. */
  undo: z.object({ operationId: z.string(), at: z.number(), complete: z.boolean() }).optional(),
  originConfidence: z.enum(['verified_internal', 'unattributed_event', 'inferred_net_diff']),
  /** Codes of what went wrong, never raw error text (which may hold bookmark data). */
  errorCodes: z.array(z.string().max(64)).max(20).optional(),
  /**
   * For differences found after a gap: when the bookmarks were last seen as recorded. The
   * changes happened at unknown times between this and `startedAt`.
   */
  observedSince: z.number().optional(),
});
export type AuditOperation = z.infer<typeof auditOperationSchema>;

const placeSchema = z.object({
  parentId: z.string().optional(),
  index: z.number().int().optional(),
  title: z.string().optional(),
  url: z.string().optional(),
});

export const auditItemSchema = z.object({
  /** The bookmark's browser id (the new one when the change created it). */
  id: z.string(),
  change: z.enum(['create', 'remove', 'update', 'move']),
  outcome: z.enum(['applied', 'skipped', 'failed', 'conflicted']),
  title: z.string(),
  url: z.string().optional(),
  type: z.enum(BOOKMARK_NODE_KINDS),
  before: placeSchema.optional(),
  after: placeSchema.optional(),
  /** Items inside a removed or created folder, at every depth. */
  descendants: z.number().int().nonnegative().optional(),
  /** Why it was skipped or failed: `deleted`, `changed`, `failed`. */
  reason: z.string().max(64).optional(),
});
export type AuditItem = z.infer<typeof auditItemSchema>;

export const auditDetailsSchema = z.object({
  operationId: z.string(),
  items: z.array(auditItemSchema),
  /** Rows left out because the batch was larger than `max_items_per_operation`. */
  omitted: z.number().int().nonnegative(),
});
export type AuditDetails = z.infer<typeof auditDetailsSchema>;

/**
 * What the bookmarks were when last seen, one record per item, so a change seen from elsewhere
 * can say what it was before (`services/bookmark-observer.ts`). Order within a folder is not kept.
 */
export type BaselineNode = {
  id: string;
  parentId: string;
  title: string;
  url?: string;
  type: 'bookmark' | 'folder' | 'separator';
};

/**
 * A write Bookmark Scout is about to make, noted before the call so the background can tell its
 * own changes from changes made elsewhere when the browser reports them.
 */
export type BookmarkWriteIntent = {
  key?: number;
  kind: 'create' | 'update' | 'move' | 'remove';
  /** The item, except for a create (the browser gives the id). */
  id?: string;
  /** Where a create or move goes. */
  parentId?: string;
  title?: string;
  url?: string;
  at: number;
};

/** What the observer keeps between events: when it last saw the bookmarks, the open burst. */
export type ObserverMeta = {
  key: 'observer';
  /** When the baseline last matched the bookmarks (an event, or a reconciliation). */
  lastSeenAt: number;
  /** The record changes from elsewhere are being added to, while they keep coming. */
  openRecord?: { id: string; lastEventAt: number };
};

/**
 * A recovery point: an item removed by a recorded change, with everything inside it, its tags and
 * summaries, and where it was, stored and read back before the removal. It lets the History bring
 * the item back after the session's undo is gone (with new ids), as long as the record is kept.
 */
export type RecoveryCheckpoint = {
  key?: number;
  operationId: string;
  /** Where it was: its folder, position, and the siblings it sat between. */
  at: { parentId: string; index: number; previousId?: string; nextId?: string };
  node: RecoverableBookmarkNode;
  createdAt: number;
};

interface AuditDb extends DBSchema {
  operations: {
    key: string;
    value: AuditOperation;
    indexes: { startedAt: number };
  };
  details: { key: string; value: AuditDetails };
  baseline: { key: string; value: BaselineNode; indexes: { parentId: string } };
  intents: { key: number; value: BookmarkWriteIntent };
  meta: { key: string; value: ObserverMeta };
  checkpoints: { key: number; value: RecoveryCheckpoint; indexes: { operationId: string } };
}

export const AUDIT_DB_NAME = INDEXED_DATABASES.bookmarkAudit.name;
/** 2 added the baseline, write intents, and observer state; 3 recovery checkpoints. */
const AUDIT_DB_VERSION = 3;

/** Broadcast name pages listen on to refresh when any context writes a record. */
export const AUDIT_CHANNEL = 'bookmark-scout-audit';

/** The audit store could not be opened, written, or read back as written. */
export class AuditStoreError extends Error {
  constructor(readonly code: 'unavailable' | 'write-failed' | 'corrupt') {
    super(t('error_auditStore'));
    this.name = 'AuditStoreError';
  }
}

let database: Promise<IDBPDatabase<AuditDb>> | undefined;

function openAuditDb(): Promise<IDBPDatabase<AuditDb>> {
  // Opened inside a promise, so a factory that throws right away rejects like any other failure.
  database ??= Promise.resolve()
    .then(() =>
      openDB<AuditDb>(AUDIT_DB_NAME, AUDIT_DB_VERSION, {
        upgrade(db, oldVersion) {
          if (oldVersion < 1) {
            const operations = db.createObjectStore('operations', { keyPath: 'id' });
            operations.createIndex('startedAt', 'startedAt');
            db.createObjectStore('details', { keyPath: 'operationId' });
          }
          if (oldVersion < 2) {
            const baseline = db.createObjectStore('baseline', { keyPath: 'id' });
            baseline.createIndex('parentId', 'parentId');
            db.createObjectStore('intents', { keyPath: 'key', autoIncrement: true });
            db.createObjectStore('meta', { keyPath: 'key' });
          }
          if (oldVersion < 3) {
            const checkpoints = db.createObjectStore('checkpoints', {
              keyPath: 'key',
              autoIncrement: true,
            });
            checkpoints.createIndex('operationId', 'operationId');
          }
        },
        // Another context opened a newer version: let it, and reopen on the next call.
        blocking() {
          void database?.then((db) => db.close());
          database = undefined;
        },
      }),
    )
    .catch((error: unknown) => {
      database = undefined;
      console.error('Bookmark audit history is unavailable:', error);
      throw new AuditStoreError('unavailable');
    });
  return database;
}

/** Closes the database, for tests that delete it between cases. */
export async function closeAuditDb(): Promise<void> {
  const open = database;
  database = undefined;
  (await open?.catch(() => undefined))?.close();
}

/** The database, for the observer's own stores (`services/bookmark-observer.ts`). */
export function openAuditDatabase(): Promise<IDBPDatabase<AuditDb>> {
  return openAuditDb();
}

export function notifyAuditChanged(): void {
  try {
    const channel = new BroadcastChannel(AUDIT_CHANNEL);
    channel.postMessage('changed');
    channel.close();
  } catch {
    // No BroadcastChannel (some test environments): pages refresh on their next read.
  }
}

/**
 * Stores `operation` and reads it back; throws `AuditStoreError` unless the stored record is
 * exactly what was written, so callers can rely on it before changing bookmarks.
 */
export async function putAuditOperation(operation: AuditOperation): Promise<void> {
  const record = auditOperationSchema.parse(operation);
  const db = await openAuditDb();
  try {
    await db.put('operations', record);
    const stored = await db.get('operations', record.id);
    if (JSON.stringify(stored) !== JSON.stringify(record)) throw new Error('read-back mismatch');
  } catch (error) {
    console.error('Failed to store a bookmark audit record:', error);
    throw new AuditStoreError('write-failed');
  }
  notifyAuditChanged();
}

/** Changes a stored record in one transaction; resolves to the record as stored, or undefined. */
export async function patchAuditOperation(
  id: string,
  patch: (current: AuditOperation) => AuditOperation,
): Promise<AuditOperation | undefined> {
  const db = await openAuditDb();
  const transaction = db.transaction('operations', 'readwrite');
  const current = parseOperation(await transaction.store.get(id));
  if (!current) {
    await transaction.done;
    return undefined;
  }
  const next = auditOperationSchema.parse(patch(current));
  await transaction.store.put(next);
  await transaction.done;
  notifyAuditChanged();
  return next;
}

/** Stores a record's item rows, keeping at most `max_items_per_operation`. */
export async function putAuditDetails(operationId: string, items: readonly AuditItem[]) {
  const kept = items.slice(0, AUDIT_LIMITS.maxItemsPerOperation);
  const details = auditDetailsSchema.parse({
    operationId,
    items: kept,
    omitted: items.length - kept.length,
  });
  const db = await openAuditDb();
  await db.put('details', details);
}

function parseOperation(value: unknown): AuditOperation | undefined {
  const parsed = auditOperationSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export async function getAuditOperation(id: string): Promise<AuditOperation | undefined> {
  return parseOperation(await (await openAuditDb()).get('operations', id));
}

/** A record's item rows; `corrupt` when they were stored but no longer read as valid. */
export async function getAuditDetails(
  operationId: string,
): Promise<AuditDetails | 'missing' | 'corrupt'> {
  const value = await (await openAuditDb()).get('details', operationId);
  if (value === undefined) return 'missing';
  const parsed = auditDetailsSchema.safeParse(value);
  return parsed.success ? parsed.data : 'corrupt';
}

/**
 * Records newest first. `corrupt` counts stored records that no longer read as valid (or are of
 * a newer version); they are left in place and reported, not hidden or rewritten.
 */
export async function listAuditOperations(): Promise<{
  operations: AuditOperation[];
  corrupt: number;
}> {
  const db = await openAuditDb();
  const values = await db.getAllFromIndex('operations', 'startedAt');
  const operations: AuditOperation[] = [];
  let corrupt = 0;
  for (const value of values.reverse()) {
    const operation = parseOperation(value);
    if (operation) operations.push(operation);
    else corrupt += 1;
  }
  return { operations, corrupt };
}

const isUnresolved = (operation: AuditOperation) =>
  UNRESOLVED_AUDIT_STATES.includes(operation.state);

/**
 * Removes finished records older than the retention period, then the oldest finished ones over
 * `max_operations`. Unresolved records are never removed here.
 */
export async function pruneAuditOperations(now: number = Date.now()): Promise<number> {
  const { operations } = await listAuditOperations();
  // Oldest first (the list is newest first).
  const finished = operations.filter((operation) => !isUnresolved(operation)).reverse();
  const remove = new Set(
    finished
      .filter((operation) => now - operation.startedAt > AUDIT_LIMITS.retentionMs)
      .map((operation) => operation.id),
  );
  let remaining = operations.length - remove.size;
  for (const operation of finished) {
    if (remaining <= AUDIT_LIMITS.maxOperations) break;
    if (remove.has(operation.id)) continue;
    remove.add(operation.id);
    remaining -= 1;
  }
  return removeOperations([...remove]);
}

async function removeOperations(ids: readonly string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const db = await openAuditDb();
  const transaction = db.transaction(['operations', 'details', 'checkpoints'], 'readwrite');
  for (const id of ids) {
    void transaction.objectStore('operations').delete(id);
    void transaction.objectStore('details').delete(id);
    // A record's recovery points go with it, never before it.
    const checkpoints = transaction.objectStore('checkpoints');
    void checkpoints
      .index('operationId')
      .getAllKeys(id)
      .then((keys) => {
        for (const key of keys) void checkpoints.delete(key);
      });
  }
  await transaction.done;
  notifyAuditChanged();
  return ids.length;
}

/**
 * Stores a recovery point and reads it back; throws `AuditStoreError` unless it was stored as
 * written, so the item is never removed without one.
 */
export async function putRecoveryCheckpoint(checkpoint: RecoveryCheckpoint): Promise<void> {
  const db = await openAuditDb();
  try {
    const key = await db.add('checkpoints', checkpoint);
    const stored = await db.get('checkpoints', key);
    if (JSON.stringify(stored?.node) !== JSON.stringify(checkpoint.node)) {
      throw new Error('read-back mismatch');
    }
  } catch (error) {
    console.error('Failed to store a recovery point:', error);
    throw new AuditStoreError('write-failed');
  }
}

/** A record's recovery points, in the order the items were removed. */
export async function getRecoveryCheckpoints(operationId: string): Promise<RecoveryCheckpoint[]> {
  const db = await openAuditDb();
  return db.getAllFromIndex('checkpoints', 'operationId', operationId);
}

/** How many recovery points a record has (0 when none or the store cannot be read). */
export async function countRecoveryCheckpoints(operationId: string): Promise<number> {
  const db = await openAuditDb();
  return db.countFromIndex('checkpoints', 'operationId', operationId);
}

/** Removes one record and its rows (a reserved record that turned out to change nothing). */
export async function removeAuditOperation(id: string): Promise<void> {
  await removeOperations([id]);
}

/**
 * Clears the history the user asked to clear: every finished record. Records that still need
 * review stay, so clearing never removes what an unfinished change may need. Resolves to how
 * many were removed and how many were kept.
 */
export async function clearAuditHistory(): Promise<{ removed: number; kept: number }> {
  const { operations } = await listAuditOperations();
  const removable = operations.filter((operation) => !isUnresolved(operation));
  const removed = await removeOperations(removable.map((operation) => operation.id));
  return { removed, kept: operations.length - removable.length };
}
