/**
 * Cover Source: which kind of cover a bookmark keeps when both its page's own preview image
 * (Fetch Covers) and a picture of the tab (Capture Covers While Browsing) can be had. The choices
 * are a table in config/bookmarks/cover-preferences.toml, each listing the kinds it takes, best
 * first, so a new choice is a new entry. Use this view as the cover is the user's own pick and is
 * never limited by it.
 */
import { z } from 'zod';

/** The kinds of cover: the page's own image, or a picture of the tab. */
const COVER_KINDS = ['page', 'screenshot'] as const;
type CoverKind = (typeof COVER_KINDS)[number];

/** Which kind each stored source is. */
const COVER_SOURCE_KINDS = {
  page: 'page',
  tab: 'screenshot',
  browse: 'screenshot',
} as const satisfies Record<CoverSource, CoverKind>;

const coverPreferenceConfig = readConfig(
  'bookmarks/cover-preferences',
  z.strictObject({
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

/** Where `kind` stands in the choice's list; past the end when it is not taken. */
function rank(preference: CoverPreference, kind: CoverKind): number {
  const index = preferenceEntry(preference).kinds.indexOf(kind);
  return index === -1 ? Number.POSITIVE_INFINITY : index;
}

/** Whether `preference` takes a cover of `kind` automatically at all. */
export function acceptsCoverKind(preference: CoverPreference, kind: CoverKind): boolean {
  return rank(preference, kind) !== Number.POSITIVE_INFINITY;
}

/**
 * Whether a new cover of `kind` replaces a current cover that came from `existing`: only when
 * `preference` takes that kind and ranks it above the kind already there.
 */
export function replacesCover(
  preference: CoverPreference,
  kind: CoverKind,
  existing: CoverSource,
): boolean {
  return (
    acceptsCoverKind(preference, kind) &&
    rank(preference, kind) < rank(preference, COVER_SOURCE_KINDS[existing])
  );
}

/** Whether a stored cover from `source` is a picture of the tab. */
export function isScreenshotCover(source: CoverSource): boolean {
  return COVER_SOURCE_KINDS[source] === 'screenshot';
}
