/**
 * The parts a backup file is made of (`config/data/backup.toml`, `[[categories]]`) and the
 * backup's limits. Small and free of the backup code itself, which loads on first use
 * (`services/backup*.lazy.ts`): the settings schema reads the part ids for Parts in New Backups.
 *
 * Every storage item and IndexedDB database names its part in `backup`
 * (`lib/storage/registry.ts`), or `exclude`; `tests/unit/backup-categories.test.ts` checks each
 * name against this table, so a new item cannot be left unclassified.
 */
import { z } from 'zod';
import { boundedNumber } from '@/lib/config/bounded';

const categorySchema = z.strictObject({
  id: z.string().regex(/^[a-z][A-Za-z]*$/),
  label: z.string().min(1),
  description: z.string().min(1),
  slug: z.string().regex(/^[a-z][a-z0-9-]*$/),
  device_specific: z.boolean(),
  secret: z.boolean(),
  large: z.boolean(),
});

const backupConfig = readConfig(
  'data/backup',
  z.strictObject({
    categories: z
      .array(categorySchema)
      .min(1)
      .refine((list) => new Set(list.map(({ id }) => id)).size === list.length, 'unique ids')
      .refine((list) => new Set(list.map(({ slug }) => slug)).size === list.length, 'unique slugs'),
    file: z.strictObject({
      filename_pattern: z.string().includes('{date}').includes('{parts}').includes('{protected}'),
      max_named_parts: boundedNumber({ integer: true }),
      protected_suffix: z.string().min(1),
      max_file_mb: boundedNumber({ integer: true }),
    }),
    encryption: z.strictObject({
      pbkdf2_iterations: z
        .strictObject({ value: z.number().int(), min: z.number().int(), max: z.number().int() })
        .refine(({ value, min, max }) => min <= value && value <= max, 'value within min and max'),
      min_password_length: boundedNumber({ integer: true }),
    }),
    import: z.strictObject({ max_conflicts_listed: boundedNumber({ integer: true }) }),
    undo: z.strictObject({ keep_hours: boundedNumber({ integer: true }) }),
  }),
);

/** One part of a backup, as `config/data/backup.toml` describes it. */
export type BackupCategory = {
  readonly id: string;
  /** Message keys of its name and of what it holds. */
  readonly labelKey: MessageKey;
  readonly descriptionKey: MessageKey;
  readonly slug: string;
  readonly deviceSpecific: boolean;
  readonly secret: boolean;
  readonly large: boolean;
};

/** Every part, in the order the dialogs list them and a restore applies them. */
export const BACKUP_CATEGORIES: readonly BackupCategory[] = backupConfig.categories.map(
  (category) => ({
    id: category.id,
    labelKey: category.label as MessageKey,
    descriptionKey: category.description as MessageKey,
    slug: category.slug,
    deviceSpecific: category.device_specific,
    secret: category.secret,
    large: category.large,
  }),
);

/**
 * The parts Parts in New Backups can name, and the export dialog remembers: every part but the
 * secret ones, which are never preselected.
 */
export const BACKUP_REMEMBERED_CATEGORY_IDS = BACKUP_CATEGORIES.filter(
  (category) => !category.secret,
).map(({ id }) => id) as [string, ...string[]];

export function getBackupCategory(id: string): BackupCategory | undefined {
  return BACKUP_CATEGORIES.find((category) => category.id === id);
}

/** The name of part `id`, in the current language. */
export function getBackupCategoryLabel(id: string): string {
  const category = getBackupCategory(id);
  if (!category) throw new Error(`Unknown backup part ${id}`);
  return t(category.labelKey);
}

/** The backup's limits and password protection parameters. */
export const BACKUP_LIMITS = {
  filenamePattern: backupConfig.file.filename_pattern,
  maxNamedParts: backupConfig.file.max_named_parts,
  protectedSuffix: backupConfig.file.protected_suffix,
  maxFileBytes: backupConfig.file.max_file_mb * BYTES_PER_MB,
  /** Iterations a new file uses, and the range a file being opened may ask for. */
  pbkdf2Iterations: backupConfig.encryption.pbkdf2_iterations,
  minPasswordLength: backupConfig.encryption.min_password_length,
  maxConflictsListed: backupConfig.import.max_conflicts_listed,
  undoKeepMs: backupConfig.undo.keep_hours * MS_PER_HOUR,
} as const;
