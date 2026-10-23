/**
 * The backup file: every stored item the registry marks `backup: 'include'` (settings, the table
 * view, custom prompts, AI services, saved searches), as stored (`{ v, data }` under its key).
 * Credentials (`backup: 'secret'`) and device-bound or rebuildable data (`'exclude'`) are never in
 * it. Restoring replaces each item the file holds and leaves the rest alone; tags and summaries
 * travel with the JSON bookmark export instead (`bookmark-export.ts`).
 *
 * AI services' credentials are a secret item, but their endpoints are not: the file also holds
 * each service's Base URL and the provider's extra connection fields (`aiEndpoints`), and names
 * the secret fields it left out (`AI_SECRET_FIELDS`: the API key and the extra headers, which
 * often carry a key). A restore keeps this device's secrets, and marks a service that still lacks
 * one as needing setup and reports it, so the user knows what to enter again.
 *
 * Covers are kept in IndexedDB, not as a stored item: when the user includes them, the file also
 * holds a `covers` section, one cover per address, which a restore puts back only after the user
 * reviewed it (`getBackupCovers`, `reviewBackupCovers`, `restoreBackupCovers`). That code loads
 * on first use (`cover-backup.lazy.ts`), so Settings opens without it.
 */
import { z } from 'zod';
import type {
  BackupCovers,
  CoverBackupEstimate,
  CoverRestoreOutcome,
  CoverRestorePlan,
} from './cover-backup.lazy';

const loadCoverBackup = () => import('./cover-backup.lazy');

import { upgradeBackupItems } from '@/lib/storage/migrations';

/** Marks a file as a backup, so a plain settings export is still told apart. */
const BACKUP_FORMAT = 'bookmark-scout-backup';
const BACKUP_FORMAT_VERSION = 1;

type Envelope = { v: number; data: unknown };

/** One AI service's connection without its secrets, and which secrets the file left out. */
const aiEndpointSchema = z.object({
  baseUrl: z.string().optional(),
  options: z.record(z.string(), z.string()).optional(),
  leftOut: z.array(z.enum(AI_SECRET_FIELDS)).optional(),
});

const backupFileSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_FORMAT_VERSION),
  exportedAt: z.string().optional(),
  items: z.record(z.string(), z.object({ v: z.number().int().positive(), data: z.unknown() })),
  /** By service id. Absent in files from releases before endpoints were kept. */
  aiEndpoints: z.record(z.string(), aiEndpointSchema).optional(),
  /** Covers, when Include covers was checked; entries are read one by one (`readBackupCovers`). */
  covers: z.array(z.unknown()).optional(),
});

/** A backup file, read and checked by `readBackupFile`. */
export type BackupFile = z.infer<typeof backupFileSchema>;

/** What a backup holds besides the stored items. */
export type BackupExportOptions = {
  /** Include covers (the setting `backupIncludeCovers` is its default in the export dialog). */
  includeCovers?: boolean;
};

/** An AI service a restore could not fully set up, and the secret fields it still needs. */
export type ServiceNeedingSetup = { name: string; fields: AISecretField[] };

export type BackupRestoreOutcome = {
  /** The registry ids restored. */
  restored: StorageItemId[];
  /** AI services that need a secret entered again on this device. */
  needsSetup: ServiceNeedingSetup[];
};

/** Each AI service's endpoint fields, without the secrets, naming the secrets it has. */
async function exportAIEndpoints(): Promise<z.infer<typeof backupFileSchema>['aiEndpoints']> {
  const { services } = await aiServicesValue.get();
  const configs = await aiProviderConfigValue.get();
  const endpoints: Record<string, z.infer<typeof aiEndpointSchema>> = {};
  for (const { id } of services) {
    const config = configs[id] ?? {};
    const leftOut = AI_SECRET_FIELDS.filter(
      (field) => config[field] || config.pendingSecrets?.includes(field),
    );
    const options = Object.entries(config.options ?? {}).filter(([, value]) => value);
    endpoints[id] = {
      ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
      ...(options.length > 0 ? { options: Object.fromEntries(options) } : {}),
      ...(leftOut.length > 0 ? { leftOut } : {}),
    };
  }
  return endpoints;
}

/**
 * Gives the restored AI services the endpoints the file holds, keeping this device's secrets,
 * and marks each that still lacks a secret it had (or one its provider requires).
 */
async function restoreAIEndpoints(
  endpoints: z.infer<typeof backupFileSchema>['aiEndpoints'],
): Promise<ServiceNeedingSetup[]> {
  const { services } = await aiServicesValue.get();
  const needsSetup: ServiceNeedingSetup[] = [];
  await aiProviderConfigValue.update((configs) => {
    const next = { ...configs };
    for (const service of services) {
      const endpoint = endpoints?.[service.id];
      const current = configs[service.id] ?? {};
      const wanted = new Set<AISecretField>(endpoint?.leftOut ?? []);
      if (providerRequiresApiKey(service.provider)) wanted.add('apiKey');
      const missing = AI_SECRET_FIELDS.filter((field) => wanted.has(field) && !current[field]);
      const secrets = Object.fromEntries(
        AI_SECRET_FIELDS.flatMap((field) => (current[field] ? [[field, current[field]]] : [])),
      );
      next[service.id] = {
        ...(endpoint ? secrets : current),
        ...(endpoint?.baseUrl ? { baseUrl: endpoint.baseUrl } : {}),
        ...(endpoint?.options ? { options: endpoint.options } : {}),
        ...(missing.length > 0 ? { pendingSecrets: missing } : {}),
      };
      if (missing.length > 0) needsSetup.push({ name: service.name, fields: missing });
    }
    return next;
  });
  return needsSetup;
}

/** Every item in a backup, by registry id, with the stored value or collection that holds it. */
const BACKUP_ITEMS: Partial<
  Record<StorageItemId, StoredValue<unknown> | StoredCollection<unknown>>
> = {
  settings: settingsOverrideValues.sync,
  settingsList: settingsListItems,
  deviceSettings: settingsOverrideValues.device,
  tableView: bookmarkTableViewValue,
  promptIndex: promptLibraryIndexValue,
  prompt: customPromptItems,
  aiServices: aiServicesValue,
  savedSearches: savedSearchesValue,
  bookmarkRules: bookmarkRulesValue,
  aboutMe: aboutMeValue,
} as Partial<Record<StorageItemId, StoredValue<unknown> | StoredCollection<unknown>>>;

/** The registry ids a backup holds: every item with `backup: 'include'`. */
export function getBackupItemIds(): StorageItemId[] {
  return (Object.entries(STORAGE_ITEMS) as [StorageItemId, StorageItem][])
    .filter(([, item]) => item.backup === 'include')
    .map(([id]) => id);
}

function backupSource(id: StorageItemId) {
  const source = BACKUP_ITEMS[id];
  if (!source) throw new Error(`${id} is backed up but has no backup source`);
  return source;
}

const isCollection = (
  source: StoredValue<unknown> | StoredCollection<unknown>,
): source is StoredCollection<unknown> => 'entry' in source;

/** The backup file's JSON; covers only when `includeCovers` (no `covers` section otherwise). */
export async function exportBackup(
  now = new Date(),
  { includeCovers = false }: BackupExportOptions = {},
): Promise<string> {
  const items: Record<string, Envelope> = {};
  for (const id of getBackupItemIds()) {
    const source = backupSource(id);
    if (isCollection(source)) {
      const ids = await source.listIds();
      const entries = await source.getMany(ids);
      for (const entryId of ids) {
        if (entries[entryId] === null) continue;
        items[storageKey(source.item, entryId)] = toStoredEnvelope(source.item, entries[entryId]);
      }
    } else {
      items[source.key] = toStoredEnvelope(source.item, await source.get());
    }
  }
  const covers = includeCovers ? await (await loadCoverBackup()).exportBackupCovers() : [];
  return JSON.stringify(
    {
      format: BACKUP_FORMAT,
      version: BACKUP_FORMAT_VERSION,
      exportedAt: now.toISOString(),
      items,
      aiEndpoints: await exportAIEndpoints(),
      ...(covers.length > 0 ? { covers } : {}),
    },
    null,
    2,
  );
}

function parseJson(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

const isMarkedBackup = (parsed: unknown) =>
  isPlainObject(parsed) && parsed.format === BACKUP_FORMAT;

/** Whether `json` is a backup file rather than another JSON file, such as a settings export. */
export function isBackupFile(json: string): boolean {
  return isMarkedBackup(parseJson(json));
}

/**
 * Reads a file the user chose, parsing it once (a backup with covers can be large): null for JSON
 * that is no backup, such as a settings export; throws `error_invalidBackupFile` for a backup this
 * release cannot read.
 */
export function readBackupFile(json: string): BackupFile | null {
  const parsed = parseJson(json);
  if (!isMarkedBackup(parsed)) return null;
  const file = backupFileSchema.safeParse(parsed);
  if (!file.success) throw new Error(t('error_invalidBackupFile'));
  return file.data;
}

/** The covers a backup file holds, checked entry by entry; undefined when it holds none. */
export async function getBackupCovers(file: BackupFile): Promise<BackupCovers | undefined> {
  if (!file.covers || file.covers.length === 0) return undefined;
  return (await loadCoverBackup()).readBackupCovers(file.covers);
}

/** What Include covers would add to a backup made now (`estimateCoverBackup`). */
export async function estimateBackupCovers(): Promise<CoverBackupEstimate> {
  return (await loadCoverBackup()).estimateCoverBackup();
}

/** The review of restoring a backup's covers on this device now (`previewCoverRestore`). */
export async function reviewBackupCovers(covers: BackupCovers): Promise<CoverRestorePlan> {
  return (await loadCoverBackup()).previewCoverRestore(covers);
}

/** Restores a backup's covers after the review (`applyCoverRestore`). */
export async function restoreBackupCovers(covers: BackupCovers): Promise<CoverRestoreOutcome> {
  return (await loadCoverBackup()).applyCoverRestore(covers);
}

/**
 * Restores a backup: each item the file holds replaces the stored one, after the same parsing a
 * stored value gets (data from an older release is migrated); a collection's entries the file
 * lacks are removed. An item a newer release wrote is skipped, as are keys this release does not
 * back up. Collection entries are written first and removed last, so an index never lists an
 * entry that is not stored. Then the AI services get their endpoints back (`restoreAIEndpoints`).
 * Resolves to the registry ids restored and the AI services that need a secret entered again.
 * Covers are restored separately, after their review (`restoreBackupCovers`).
 */
export async function restoreBackup(file: string | BackupFile): Promise<BackupRestoreOutcome> {
  const read = typeof file === 'string' ? readBackupFile(file) : file;
  if (!read) throw new Error(t('error_invalidBackupFile'));
  // Settings an earlier release's file holds where they are no longer stored.
  const parsed = { ...read, items: upgradeBackupItems(read.items) };
  const ids = getBackupItemIds();
  const sources = ids.map((id) => [id, backupSource(id)] as const);
  const restored = new Set<StorageItemId>();
  const removals: (() => Promise<void>)[] = [];

  for (const [id, source] of sources) {
    if (!isCollection(source)) continue;
    const prefix = storageKey(source.item, '');
    const inFile = Object.entries(parsed.items).filter(
      ([key]) => key.startsWith(prefix) && key.length > prefix.length,
    );
    const fileIds = new Set(inFile.map(([key]) => key.slice(prefix.length)));
    for (const [key, envelope] of inFile) {
      if (envelope.v > source.item.v) continue;
      const entry = source.entry(key.slice(prefix.length));
      await entry.set(entry.parseStored(envelope));
    }
    const storedIds = await source.listIds();
    removals.push(async () => {
      for (const entryId of storedIds) {
        if (!fileIds.has(entryId)) await source.entry(entryId).clear();
      }
    });
    restored.add(id);
  }

  for (const [id, source] of sources) {
    if (isCollection(source)) continue;
    const envelope = parsed.items[source.key];
    if (!envelope || envelope.v > source.item.v) continue;
    await source.set(source.parseStored(envelope));
    restored.add(id);
  }

  for (const remove of removals) await remove();
  const needsSetup = restored.has('aiServices') ? await restoreAIEndpoints(parsed.aiEndpoints) : [];
  return { restored: ids.filter((id) => restored.has(id)), needsSetup };
}
