/**
 * The Options page's settings search (`text-match.ts` rules, folded as
 * `config/ui/settings-search.toml` says): a setting matches when every word of the query (or the
 * whole query, with Word Matching on Exact phrase) is in the texts it is searched by, each word in
 * any of them. Those texts are `SETTING_SEARCH_SOURCES`, one entry per kind (its name, description,
 * keywords, setting ID), and the user picks which are searched (Search In). The results mark the
 * words in every text they show, and say where a setting was found when the words are only in text
 * its row does not show, in the configured `note_order`.
 */
import { z } from 'zod';

const settingsSearchConfig = readConfig(
  'ui/settings-search',
  z.strictObject({
    fold: z.strictObject({
      ignore_case: z.boolean(),
      ignore_accents: z.boolean(),
      ignore_width: z.boolean(),
    }),
    note_order: z
      .array(z.enum(SETTING_SEARCH_SOURCE_IDS))
      .length(SETTING_SEARCH_SOURCE_IDS.length)
      .refine((ids) => new Set(ids).size === ids.length, 'each source once'),
  }),
);

/** How the settings search compares text: the same rules for the query and every setting. */
export const SETTINGS_SEARCH_FOLD: TextFoldRules = {
  ignoreCase: settingsSearchConfig.fold.ignore_case,
  ignoreAccents: settingsSearchConfig.fold.ignore_accents,
  ignoreWidth: settingsSearchConfig.fold.ignore_width,
};

/** One kind of text a setting can be found by. */
type SettingSearchSourceSpec = {
  /** The text in the current language; empty when the setting has none (most have no keywords). */
  read: (fieldKey: keyof Settings, meta: SettingsFieldMeta) => string;
  /** The note's lead-in when a row does not show this text ("Found in its description:"). */
  note: MessageKey;
  /** Code-like text the note sets in a monospace font. */
  code?: boolean;
};

/**
 * Every text a setting can be found by. A new source (such as an option's label) is an entry
 * here, its id in `SETTING_SEARCH_SOURCE_IDS`, and its place in `note_order`.
 */
export const SETTING_SEARCH_SOURCES = {
  label: { read: (_key, meta) => meta.label, note: 'settings_searchMatchedLabel' },
  description: {
    read: (_key, meta) => meta.description,
    note: 'settings_searchMatchedDescription',
  },
  keywords: {
    read: (_key, meta) => meta.keywords ?? '',
    note: 'settings_searchMatchedKeywordList',
  },
  // The id is the same in every language, so a setting named in docs or an issue is found anywhere.
  id: { read: (key) => key, note: 'settings_searchMatchedId', code: true },
} as const satisfies Record<SettingSearchSource, SettingSearchSourceSpec>;

/** Every source, in the order notes list them. */
export const SETTING_SEARCH_NOTE_ORDER: readonly SettingSearchSource[] =
  settingsSearchConfig.note_order;

/** Compiles what the user typed with the settings search's rules and their Word Matching. */
export function compileSettingsQuery(text: string, mode: TextQueryMode): TextQuery | undefined {
  return compileTextQuery(text, SETTINGS_SEARCH_FOLD, mode);
}

/** Where the query is in one of a setting's texts, and whether that text is searched. */
export type SettingSourceMatch = TextMatch & {
  source: SettingSearchSource;
  text: string;
  searched: boolean;
};

/** Every source of a matching setting, in note order (texts not searched never match). */
export type SettingSearchMatch = readonly SettingSourceMatch[];

/**
 * Where the query is in a setting's texts; undefined when the setting does not match. Only the
 * `searched` sources decide the match; the others are still read, because a word in text the row
 * shows explains the match whether or not that text was searched.
 */
export function matchSetting(
  fieldKey: keyof Settings,
  query: TextQuery,
  searched: readonly SettingSearchSource[],
): SettingSearchMatch | undefined {
  const meta = getSettingsFieldMeta()[fieldKey];
  const sources = SETTING_SEARCH_NOTE_ORDER.map((source): SettingSourceMatch => {
    const text = SETTING_SEARCH_SOURCES[source].read(fieldKey, meta);
    return { source, text, searched: searched.includes(source), ...findTextMatches(text, query) };
  });
  const found = new Set(
    sources.filter((match) => match.searched).flatMap((match) => [...match.terms]),
  );
  return found.size === query.terms.length ? sources : undefined;
}

/**
 * The searched texts a row does not show that explain its match: those holding a word that
 * neither the shown texts nor other visible text near the row (`alsoVisible`, word indexes) holds.
 * Empty when every word is visible.
 */
export function hiddenSettingMatches(
  match: SettingSearchMatch,
  shown: readonly SettingSearchSource[],
  alsoVisible: ReadonlySet<number> = new Set(),
): SettingSourceMatch[] {
  const visible = new Set([
    ...alsoVisible,
    ...match.filter(({ source }) => shown.includes(source)).flatMap(({ terms }) => [...terms]),
  ]);
  return match.filter(
    ({ source, searched, terms }) =>
      searched && !shown.includes(source) && [...terms].some((term) => !visible.has(term)),
  );
}
