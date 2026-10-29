/**
 * The Options page's settings search (`text-match.ts` rules): a setting matches when every word
 * of the query is in its label, its description, or its id (`popupWidth`, which stays the same in
 * every language), each word in any of them. The page marks the words where it shows the text
 * they were found in, and says where the rest were found when they are in text it does not show
 * (a setting's id, or the description of a setting drawn without one).
 */

/** The texts a setting is searched by, in the order a note about hidden matches lists them. */
export const SETTING_SEARCH_SOURCES = ['label', 'description', 'id'] as const;

export type SettingSearchSource = (typeof SETTING_SEARCH_SOURCES)[number];

export type SettingSearchMatch = Record<SettingSearchSource, TextMatch & { text: string }>;

function settingSearchTexts(fieldKey: keyof Settings): Record<SettingSearchSource, string> {
  const meta = getSettingsFieldMeta()[fieldKey];
  return { label: meta.label, description: meta.description, id: fieldKey };
}

/** Where the query is in a setting's texts; undefined when the setting does not match. */
export function matchSetting(
  fieldKey: keyof Settings,
  query: TextQuery,
): SettingSearchMatch | undefined {
  const texts = settingSearchTexts(fieldKey);
  const match = Object.fromEntries(
    SETTING_SEARCH_SOURCES.map((source) => [
      source,
      { text: texts[source], ...findTextMatches(texts[source], query) },
    ]),
  ) as SettingSearchMatch;
  const found = new Set(SETTING_SEARCH_SOURCES.flatMap((source) => [...match[source].terms]));
  return found.size === query.terms.length ? match : undefined;
}

/**
 * The texts a row does not show that explain its match: those holding a word that none of the
 * shown texts holds. Empty when every word is visible where the row shows it.
 */
export function hiddenSettingMatches(
  match: SettingSearchMatch,
  shown: readonly SettingSearchSource[],
): SettingSearchSource[] {
  const visible = new Set(shown.flatMap((source) => [...match[source].terms]));
  return SETTING_SEARCH_SOURCES.filter(
    (source) =>
      !shown.includes(source) && [...match[source].terms].some((term) => !visible.has(term)),
  );
}
