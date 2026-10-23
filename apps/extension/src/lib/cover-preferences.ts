/**
 * Cover Source: which kind of cover a bookmark keeps when both its page's own preview image
 * (Fetch Covers) and a picture of the tab (Capture Covers While Browsing) can be had. The choices
 * are a table in config/bookmarks/cover-preferences.toml, each listing the kinds it takes, best
 * first, so a new choice is a new entry. Use this view as the cover is the user's own pick: it is
 * never limited by the choice, and its cover is never replaced automatically (`never_replaced`).
 */
import { z } from 'zod';

/**
 * Where a cover came from: the preview image the page names (`page`, Fetch Covers, or quick save),
 * a picture of the tab the user chose (`tab`, Use this view as the cover), one taken when a
 * bookmarked page loaded (`browse`, Capture Covers While Browsing), or one quick save took
 * (`quickSave`, Save a Cover With Quick Save).
 */
export const COVER_SOURCES = ['page', 'tab', 'browse', 'quickSave'] as const;
export type CoverSource = (typeof COVER_SOURCES)[number];

/**
 * A cover saved before covers recorded where they came from. It is kept and shown as any other,
 * with no source line, and replaced as a page's own image would be (`COVER_SOURCE_KINDS`).
 * Nothing is written with it, and the stored record is not rewritten.
 */
export const UNKNOWN_COVER_SOURCE = 'unknown';
export type StoredCoverSource = CoverSource | typeof UNKNOWN_COVER_SOURCE;

/** The kinds of cover: the page's own image, or a picture of the tab. */
const COVER_KINDS = ['page', 'screenshot'] as const;
export type CoverKind = (typeof COVER_KINDS)[number];

/**
 * Which kind each stored source is. A cover saved before sources were recorded counts as a page's
 * own image, the kind Fetch Covers saved then.
 */
const COVER_SOURCE_KINDS = {
  page: 'page',
  tab: 'screenshot',
  browse: 'screenshot',
  quickSave: 'screenshot',
  unknown: 'page',
} as const satisfies Record<StoredCoverSource, CoverKind>;

const coverPreferenceConfig = readConfig(
  'bookmarks/cover-preferences',
  z.strictObject({
    never_replaced: z.array(z.enum(COVER_SOURCES)),
    preferences: z
      .record(
        z.string().regex(/^[a-z_]+$/),
        z.strictObject({
          kinds: z
            .array(z.enum(COVER_KINDS))
            .min(1)
            .refine((kinds) => new Set(kinds).size === kinds.length, 'a kind is listed twice'),
          label_key: z.string().min(1),
        }),
      )
      .refine((preferences) => Object.keys(preferences).length > 0, 'no preferences'),
  }),
);

const PREFERENCES = coverPreferenceConfig.preferences;
const NEVER_REPLACED: ReadonlySet<StoredCoverSource> = new Set(
  coverPreferenceConfig.never_replaced,
);
const [firstPreference, ...otherPreferences] = Object.keys(PREFERENCES);
if (firstPreference === undefined) throw new Error('No cover source preferences');

/** The Cover Source setting's values, in the order Options lists them. */
export const coverPreferenceSchema = z.enum([firstPreference, ...otherPreferences]);
export type CoverPreference = z.infer<typeof coverPreferenceSchema>;

function preferenceEntry(preference: CoverPreference) {
  const entry = PREFERENCES[preference];
  if (!entry) throw new Error(`Unknown cover source preference: ${preference}`);
  return entry;
}

/** The choice's name, in the current language. */
export function getCoverPreferenceLabel(preference: CoverPreference): string {
  return t(preferenceEntry(preference).label_key);
}

/** The kinds of cover `preference` takes automatically, best first. */
export function coverPreferenceKinds(preference: CoverPreference): readonly CoverKind[] {
  return preferenceEntry(preference).kinds;
}

/**
 * Quick Save Cover Source: `same` follows Cover Source; any other value is one of its choices, for
 * quick save only.
 */
export const SAME_COVER_SOURCE = 'same';
export const quickSaveCoverSourceSchema = z.enum([
  SAME_COVER_SOURCE,
  firstPreference,
  ...otherPreferences,
]);
export type QuickSaveCoverSource = z.infer<typeof quickSaveCoverSourceSchema>;

/** The Cover Source choice quick save follows. */
export function resolveQuickSaveCoverPreference(
  choice: QuickSaveCoverSource,
  coverSource: CoverPreference,
): CoverPreference {
  return choice === SAME_COVER_SOURCE ? coverSource : choice;
}

/** A Quick Save Cover Source choice's name, in the current language. */
export function getQuickSaveCoverSourceLabel(choice: QuickSaveCoverSource): string {
  return choice === SAME_COVER_SOURCE
    ? t('settings_quickSaveCoverSourceSame')
    : getCoverPreferenceLabel(choice);
}

/** Where `kind` stands in the choice's list; past the end when it is not taken. */
function rank(preference: CoverPreference, kind: CoverKind): number {
  const index = preferenceEntry(preference).kinds.indexOf(kind);
  return index === -1 ? Number.POSITIVE_INFINITY : index;
}

/** Whether `preference` takes a cover of `kind` automatically at all. */
export function acceptsCoverKind(preference: CoverPreference, kind: CoverKind): boolean {
  return rank(preference, kind) !== Number.POSITIVE_INFINITY;
}

/** Whether a cover from `source` is one no automatic cover replaces (Use this view as the cover). */
export function isKeptCover(source: StoredCoverSource): boolean {
  return NEVER_REPLACED.has(source);
}

/**
 * Whether a new cover of `kind` replaces a current cover that came from `existing`: never one the
 * user chose (`isKeptCover`), else only when `preference` takes that kind and ranks it above the
 * kind already there.
 */
export function replacesCover(
  preference: CoverPreference,
  kind: CoverKind,
  existing: StoredCoverSource,
): boolean {
  return (
    !isKeptCover(existing) &&
    acceptsCoverKind(preference, kind) &&
    rank(preference, kind) < rank(preference, COVER_SOURCE_KINDS[existing])
  );
}

/** Whether a stored cover from `source` is a picture of the tab. */
export function isScreenshotCover(source: StoredCoverSource): boolean {
  return COVER_SOURCE_KINDS[source] === 'screenshot';
}
