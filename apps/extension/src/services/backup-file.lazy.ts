/**
 * The backup file (format 2): a readable manifest, then one section per part the user selected
 * (`backup-categories.lazy.ts`), each checked against its part's schema on import.
 *
 * ```json
 * { "format": "bookmark-scout-backup", "formatVersion": 2, "app": "bookmark-scout",
 *   "appVersion": "0.3.5", "createdAt": "2026-10-23T09:00:00.000Z",
 *   "categories": [{ "id": "settings", "count": 12, "bytes": 3456 }, ...],
 *   "sections": { "settings": { ... } },
 *   "protected": { "encryption": { ... }, "data": "<base64>" } }
 * ```
 *
 * With a password, the sections of the protected parts (every part, or only the AI service keys)
 * are encrypted together into `protected` (`lib/backup-crypto.ts`); the manifest stays readable so
 * Restore settings shows what the file holds before asking for the password, and it is
 * authenticated with the encrypted text, so a changed manifest fails like a wrong password.
 *
 * A part this release does not know (from a newer release) is listed as not supported and
 * skipped. Older files (format 1, before parts) are converted by the storage migrations'
 * converters (`upgradeBackupFile`), the one conversion path. A newer format is refused.
 *
 * Restoring takes a safety copy of every part it changes first (`lib/backup-undo-store.ts`), so
 * Undo import can put them back, and is recorded in History (`services/bookmark-audit.ts`) as one
 * record of kind `data` with each part's counts and read-back; Undo import is recorded as its undo.
 */
import { z } from 'zod';
import { upgradeBackupFile } from '@/lib/storage/migrations/backup-files';
import {
  type ConflictChoice,
  getCategoryHandler,
  type ImportContext,
  type PartChoice,
  type PartEstimate,
  type PartOutcome,
  type PartReview,
} from './backup-categories.lazy';

/** Marks a file as a backup, so a plain settings export is still told apart. */
export const BACKUP_FORMAT = 'bookmark-scout-backup';
/** Raised only when the structure changes; a new part is not a new format. */
export const BACKUP_FORMAT_VERSION = 2;
/** Names the program that wrote the file. */
const BACKUP_APP = 'bookmark-scout';

const manifestPartSchema = z.object({
  id: z.string().min(1),
  /** Entries and bytes when saved; files converted from format 1 leave them out. */
  count: z.number().int().nonnegative().optional(),
  bytes: z.number().int().nonnegative().optional(),
  protected: z.boolean().optional(),
});

/** Not strict: a newer release may add fields this one ignores. */
const backupFileSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  formatVersion: z.literal(BACKUP_FORMAT_VERSION),
  app: z.string().optional(),
  appVersion: z.string().optional(),
  createdAt: z.string().optional(),
  categories: z.array(manifestPartSchema),
  sections: z.record(z.string(), z.unknown()).default({}),
  protected: z.object({ encryption: backupEncryptionSchema, data: z.string().min(1) }).optional(),
});

type BackupFileJson = z.infer<typeof backupFileSchema>;
type ManifestPart = z.infer<typeof manifestPartSchema>;

/** The manifest fields the password protection authenticates, in a fixed order. */
function manifestText(
  file: Pick<
    BackupFileJson,
    'format' | 'formatVersion' | 'app' | 'appVersion' | 'createdAt' | 'categories'
  >,
): string {
  return JSON.stringify([
    file.format,
    file.formatVersion,
    file.app ?? null,
    file.appVersion ?? null,
    file.createdAt ?? null,
    file.categories.map((part) => [
      part.id,
      part.count ?? null,
      part.bytes ?? null,
      part.protected === true,
    ]),
  ]);
}

/** Which parts a password protects: none, only the secret ones, or every part. */
export type BackupProtection = 'none' | 'secrets' | 'all';

export type BackupExportRequest = {
  /** Part ids; saved in the config's order whatever the order here. */
  categories: readonly string[];
  protection: BackupProtection;
  /** Needed unless `protection` is `none`. Never stored. */
  password?: string;
};

export type BuiltBackup = { json: string; filename: string; parts: ManifestPart[] };

/** The file name for a backup of `ids` (`[file]` in `config/data/backup.toml`). */
export function formatBackupFilename(
  ids: readonly string[],
  isProtected: boolean,
  now: Date,
): string {
  const chosen = new Set(ids);
  const plain = BACKUP_CATEGORIES.filter((category) => !category.secret);
  const secret = BACKUP_CATEGORIES.filter((category) => category.secret && chosen.has(category.id));
  const selected = plain.filter((category) => chosen.has(category.id));
  let parts: string[];
  if (selected.length === plain.length) parts = ['all'];
  else if (selected.length > BACKUP_LIMITS.maxNamedParts) parts = [`${selected.length}-parts`];
  else parts = selected.map((category) => category.slug);
  parts.push(...secret.map((category) => category.slug));
  return BACKUP_LIMITS.filenamePattern
    .replace('{date}', toLocalIsoDate(now))
    .replace('{parts}', parts.join('-'))
    .replace('{protected}', isProtected ? BACKUP_LIMITS.protectedSuffix : '');
}

function isProtectedPart(id: string, protection: BackupProtection): boolean {
  if (protection === 'all') return true;
  return protection === 'secrets' && getBackupCategory(id)?.secret === true;
}

const jsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

/** Every part's count and size in a backup made now, for the export dialog. */
export async function estimateBackup(): Promise<Record<string, PartEstimate>> {
  const estimates: Record<string, PartEstimate> = {};
  for (const category of BACKUP_CATEGORIES) {
    estimates[category.id] = await getCategoryHandler(category.id).estimate();
  }
  return estimates;
}

/** The backup file with the parts `request` selects. */
export async function buildBackupFile(
  request: BackupExportRequest,
  now = new Date(),
): Promise<BuiltBackup> {
  const ids = BACKUP_CATEGORIES.map(({ id }) => id).filter((id) => request.categories.includes(id));
  if (ids.length === 0) throw new Error(t('backup_errorNothingSelected'));
  if (request.protection !== 'none' && !request.password) {
    throw new Error(t('backup_errorPasswordMissing'));
  }
  const sections: Record<string, unknown> = {};
  const protectedSections: Record<string, unknown> = {};
  const categories: ManifestPart[] = [];
  for (const id of ids) {
    const handler = getCategoryHandler(id);
    const section = await handler.export();
    const isProtected = isProtectedPart(id, request.protection);
    categories.push({
      id,
      count: handler.count(section),
      bytes: jsonBytes(section),
      ...(isProtected ? { protected: true } : {}),
    });
    if (isProtected) protectedSections[id] = section;
    else sections[id] = section;
  }
  const manifest = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    app: BACKUP_APP,
    appVersion: browser.runtime.getManifest().version,
    createdAt: now.toISOString(),
    categories,
  } as const;
  const hasProtected = Object.keys(protectedSections).length > 0;
  const file = {
    ...manifest,
    sections,
    ...(hasProtected
      ? {
          protected: await encryptBackupText(
            JSON.stringify(protectedSections),
            request.password ?? '',
            manifestText(manifest),
          ),
        }
      : {}),
  };
  return {
    json: JSON.stringify(file, null, 2),
    filename: formatBackupFilename(ids, hasProtected, now),
    parts: categories,
  };
}

/** A part as Restore settings shows it. */
export type OpenedPart = ManifestPart & {
  /** Whether this release has the part; an unknown one is listed and skipped. */
  known: boolean;
  /** Encrypted and not unlocked yet. */
  locked: boolean;
  /** Its data failed the part's checks, so it cannot be imported. */
  invalid: boolean;
};

/** A backup file read, checked, and (once unlocked) ready to review. */
export type OpenedBackup = {
  createdAt?: string;
  appVersion?: string;
  /** In the file's order. */
  parts: OpenedPart[];
  /** Each readable part's checked data, by id. */
  sections: Record<string, unknown>;
  /** The encrypted parts, until unlocked. */
  locked?: { encryption: BackupEncryption; data: string; manifest: string };
};

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** The file's format version: `formatVersion`, or format 1's `version`. */
function formatVersionOf(raw: Record<string, unknown>): number | undefined {
  const version = raw.formatVersion ?? raw.version;
  return typeof version === 'number' && Number.isInteger(version) && version > 0
    ? version
    : undefined;
}

/** `sections` checked part by part: the readable ones, and the ids that failed. */
function checkSections(sections: Record<string, unknown>) {
  const valid: Record<string, unknown> = {};
  const invalid = new Set<string>();
  for (const [id, section] of Object.entries(sections)) {
    if (!getBackupCategory(id)) continue;
    const parsed = getCategoryHandler(id).schema.safeParse(section);
    if (parsed.success) valid[id] = parsed.data;
    else invalid.add(id);
  }
  return { valid, invalid };
}

/**
 * Reads a file the user chose: null for JSON that is no backup (such as a settings export);
 * throws `error_invalidBackupFile` for a backup this release cannot read, and
 * `backup_errorNewerFormat` for one a newer release made in a newer format.
 */
export function openBackupFile(text: string): OpenedBackup | null {
  const raw = parseJson(text);
  if (!isPlainObject(raw) || raw.format !== BACKUP_FORMAT) return null;
  const version = formatVersionOf(raw);
  if (version === undefined) throw new Error(t('error_invalidBackupFile'));
  if (version > BACKUP_FORMAT_VERSION) throw new Error(t('backup_errorNewerFormat'));
  const parsed = backupFileSchema.safeParse(upgradeBackupFile(raw, version, BACKUP_FORMAT_VERSION));
  if (!parsed.success) throw new Error(t('error_invalidBackupFile'));
  const file = parsed.data;
  const { valid, invalid } = checkSections(file.sections);
  const lockedIds = new Set(
    file.protected ? file.categories.filter((part) => part.protected).map(({ id }) => id) : [],
  );
  const seen = new Set<string>();
  const parts = file.categories.flatMap((part) => {
    if (seen.has(part.id)) return [];
    seen.add(part.id);
    const known = getBackupCategory(part.id) !== undefined;
    const locked = lockedIds.has(part.id);
    return [
      {
        ...part,
        known,
        locked,
        invalid: known && !locked && (invalid.has(part.id) || !(part.id in valid)),
      },
    ];
  });
  return {
    createdAt: file.createdAt,
    appVersion: file.appVersion,
    parts,
    sections: valid,
    ...(file.protected && lockedIds.size > 0
      ? { locked: { ...file.protected, manifest: manifestText(file) } }
      : {}),
  };
}

/**
 * Opens the encrypted parts with `password`. Rejects with `BackupPasswordError` for a wrong
 * password or a changed file; the parts that were readable stay as they were.
 */
export async function unlockBackupFile(
  opened: OpenedBackup,
  password: string,
): Promise<OpenedBackup> {
  if (!opened.locked) return opened;
  const text = await decryptBackupText(
    opened.locked.encryption,
    opened.locked.data,
    password,
    opened.locked.manifest,
  );
  const decrypted = parseJson(text);
  if (!isPlainObject(decrypted)) throw new Error(t('error_invalidBackupFile'));
  const { valid, invalid } = checkSections(decrypted);
  return {
    createdAt: opened.createdAt,
    appVersion: opened.appVersion,
    sections: { ...opened.sections, ...valid },
    parts: opened.parts.map((part) =>
      part.locked
        ? {
            ...part,
            locked: false,
            invalid: part.known && (invalid.has(part.id) || !(part.id in valid)),
          }
        : part,
    ),
  };
}

function contextFor(opened: OpenedBackup, ids: readonly string[]): ImportContext {
  const id = STORAGE_ITEMS.aiServices.backup;
  return ids.includes(id) && opened.sections[id]
    ? { aiServices: opened.sections[id] as ImportContext['aiServices'] }
    : {};
}

/** In the config's order: the order a restore applies parts. */
function importOrder(ids: readonly string[]): string[] {
  return BACKUP_CATEGORIES.map(({ id }) => id).filter((id) => ids.includes(id));
}

/**
 * What importing each readable part would do on this device now (dry run: nothing changes).
 * `selected` are the parts the user means to import, which a part may depend on (keys are stored
 * by AI service).
 */
export async function reviewBackup(
  opened: OpenedBackup,
  selected: readonly string[] = opened.parts.filter(isImportablePart).map(({ id }) => id),
): Promise<Record<string, PartReview>> {
  const context = contextFor(opened, selected);
  const reviews: Record<string, PartReview> = {};
  for (const part of opened.parts) {
    if (!isImportablePart(part)) continue;
    reviews[part.id] = await getCategoryHandler(part.id).review(opened.sections[part.id], context);
  }
  return reviews;
}

export type ImportOutcome = {
  /** By part id, in the order applied. */
  outcomes: Record<string, PartOutcome>;
  /** A part that failed, with the error's message; the parts before it were imported. */
  failed?: { id: string; message: string };
  /** The import's History record, which Undo import names. */
  operationId: string;
};

/** A History record's parts with what each did. */
function auditParts(
  ids: readonly string[],
  choices: Readonly<Record<string, PartChoice>>,
  outcomes: Readonly<Record<string, PartOutcome>>,
  failedId?: string,
): AuditData['parts'] {
  return ids.flatMap((id) => {
    const outcome = outcomes[id];
    if (!outcome && id !== failedId) return [];
    return [
      {
        id,
        strategy: choices[id].strategy,
        added: outcome?.added ?? 0,
        changed: outcome?.changed ?? 0,
        removed: outcome?.removed ?? 0,
        kept: outcome?.kept ?? 0,
        skipped: outcome?.skipped ?? 0,
        ...(id === failedId ? { failed: true } : {}),
      },
    ];
  });
}

/** The History record's label of an import of `count` parts. */
const importLabel = (count: number): AuditLabel => ({ action: 'import', count });

/**
 * Imports the parts in `choices` (by id). First it reserves the import's History record (a
 * `kind: 'data'` record; an import with Replace, which removes data, does not start without one,
 * as a removal of bookmarks does not) and stores a safety copy of everything the parts may change
 * (nothing is imported if that fails). Then each part in the config's order, each read back, and
 * the record gets every part's counts and the read-back.
 */
export async function applyBackup(
  opened: OpenedBackup,
  choices: Readonly<Record<string, PartChoice>>,
  fileName?: string,
  now = Date.now(),
): Promise<ImportOutcome> {
  const ids = importOrder(
    opened.parts.filter((part) => isImportablePart(part) && part.id in choices).map(({ id }) => id),
  );
  if (ids.length === 0) throw new Error(t('backup_errorNothingSelected'));
  const name = fileName?.slice(0, INPUT_LIMITS.chars.audit_file_name);
  const planned = auditParts(
    ids,
    choices,
    Object.fromEntries(
      ids.map((id) => [
        id,
        { added: 0, changed: 0, removed: 0, kept: 0, skipped: 0, mismatches: 0, notes: [] },
      ]),
    ),
  );
  // Everything is checked before anything is written: a part that cannot be stored whole (a
  // file edited to hold an oversized list) stops the import here, with nothing changed.
  for (const id of ids) {
    try {
      await getCategoryHandler(id).check?.(opened.sections[id], choices[id]);
    } catch (error) {
      throw new Error(t('backup_errorPartTooLarge', [partName(id), getErrorMessage(error)]));
    }
  }
  let operationId: string;
  try {
    operationId = await beginAuditOperation({
      label: importLabel(ids.length),
      kind: 'data',
      data: { ...(name ? { fileName: name } : {}), parts: planned },
    });
  } catch (error) {
    if (ids.some((id) => choices[id].strategy === 'replace')) throw error;
    console.error('Importing a backup without a History record:', error);
    operationId = crypto.randomUUID();
  }
  const snapshots: Record<string, unknown> = {};
  try {
    for (const id of ids) {
      snapshots[id] = await getCategoryHandler(id).snapshot(opened.sections[id], choices[id]);
    }
    await saveBackupUndo({ operationId, createdAt: now, fileName: name, parts: ids, snapshots });
  } catch (error) {
    // Nothing was imported: the record of an import that never started goes too.
    await removeAuditOperation(operationId).catch(() => undefined);
    throw error;
  }
  const context = contextFor(opened, ids);
  const outcomes: Record<string, PartOutcome> = {};
  let failed: ImportOutcome['failed'];
  for (const id of ids) {
    try {
      outcomes[id] = await getCategoryHandler(id).apply(opened.sections[id], choices[id], context);
    } catch (error) {
      // Each part is all or nothing: one that failed partway is put back from its safety copy.
      await getCategoryHandler(id)
        .undo(snapshots[id])
        .catch((undoError: unknown) => console.error('Could not put a part back:', id, undoError));
      failed = { id, message: getErrorMessage(error) };
      break;
    }
  }
  const handlerOf = (id: string) => getCategoryHandler(id);
  await finishDataAuditOperation(operationId, {
    data: {
      ...(name ? { fileName: name } : {}),
      parts: auditParts(ids, choices, outcomes, failed?.id),
    },
    planned: ids.reduce((sum, id) => sum + handlerOf(id).count(opened.sections[id]), 0),
    failed: failed ? handlerOf(failed.id).count(opened.sections[failed.id]) : 0,
    mismatches: Object.values(outcomes).reduce((sum, outcome) => sum + outcome.mismatches, 0),
    threw: failed !== undefined,
  }).catch((error: unknown) => console.error('Failed to finish the History record:', error));
  return { outcomes, ...(failed ? { failed } : {}), operationId };
}

/** Why Undo import is not offered for an import's History record. */
export type BackupUndoUnavailable = 'undone' | 'expired' | 'replaced';

/**
 * Whether Undo import can still undo the import `operation` recorded: not once it was undone,
 * after `[undo] keep_hours`, or after a later import replaced its safety copy.
 */
export async function checkUndoAvailability(
  operation: Pick<AuditOperation, 'id' | 'startedAt' | 'undo'>,
  now = Date.now(),
): Promise<{ available: true } | { available: false; reason: BackupUndoUnavailable }> {
  if (operation.undo) return { available: false, reason: 'undone' };
  const record = await getBackupUndo(now);
  if (record?.operationId === operation.id) return { available: true };
  return {
    available: false,
    reason: now - operation.startedAt >= BACKUP_LIMITS.undoKeepMs ? 'expired' : 'replaced',
  };
}

/** What Undo import did. */
export type BackupUndoOutcome =
  | { undone: true; mismatches: number; operationId?: string }
  | { undone: false; reason: BackupUndoUnavailable };

/**
 * Undo import: puts back what the import `operationId` changed, part by part in reverse, from its
 * safety copy, reads each back, and records the undo in History as a replay of that import
 * (linked to it, which is marked undone). The one path for the import result's Undo, the Undo
 * import button in Settings, and History's Undo.
 */
export async function undoImportFromSnapshot(
  operationId: string,
  now = Date.now(),
): Promise<BackupUndoOutcome> {
  const original = await getAuditOperation(operationId).catch(() => undefined);
  const availability = await checkUndoAvailability(
    original ?? { id: operationId, startedAt: now },
    now,
  );
  if (!availability.available) return { undone: false, reason: availability.reason };
  const record = await getBackupUndo(now);
  if (!record) return { undone: false, reason: 'expired' };
  // The undo of an import adds what it removed and removes what it added.
  const parts = (original?.data?.parts ?? []).map((part) => ({
    ...part,
    added: part.removed,
    removed: part.added,
  }));
  const data: AuditData = { ...(record.fileName ? { fileName: record.fileName } : {}), parts };
  let undoId: string | undefined;
  try {
    undoId = await beginAuditOperation({
      label: original?.label ?? importLabel(record.parts.length),
      kind: 'data',
      replay: 'undo',
      relatedOperationId: operationId,
      data,
    });
  } catch (error) {
    console.error('Undoing an import without a History record:', error);
  }
  let mismatches = 0;
  let threw = false;
  for (const id of [...record.parts].reverse()) {
    if (!getBackupCategory(id)) continue;
    try {
      mismatches += await getCategoryHandler(id).undo(record.snapshots[id]);
    } catch (error) {
      threw = true;
      console.error('Undo import could not put a part back:', id, error);
    }
  }
  await clearBackupUndo();
  if (undoId) {
    await finishDataAuditOperation(undoId, {
      data,
      planned: parts.reduce((sum, part) => sum + part.added + part.changed + part.removed, 0),
      failed: 0,
      mismatches,
      threw,
    }).catch(() => undefined);
    await markAuditOperationUndone(operationId, undoId, mismatches === 0 && !threw).catch(
      () => undefined,
    );
  }
  return { undone: true, mismatches, ...(undoId ? { operationId: undoId } : {}) };
}

export type { ConflictChoice, PartChoice, PartEstimate, PartOutcome, PartReview };

/** A part's name, or its id for one this release does not know. */
function partName(id: string): string {
  return getBackupCategory(id) ? getBackupCategoryLabel(id) : id;
}
