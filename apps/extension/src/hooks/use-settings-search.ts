/**
 * The Options page's current settings search, for the rows and panels that mark what it matched
 * (`SettingSearchText`, `SettingSearchNote`): the compiled query and the user's Settings Search
 * settings. Outside a search there is none, and they draw plain text.
 */
import { createContext, useContext } from 'react';

export type SettingsSearchState = {
  query: TextQuery;
  /** Search In: the texts a setting is matched by. */
  sources: readonly SettingSearchSource[];
  /** Highlight Matches: mark the words in what the results show. */
  highlight: boolean;
  /** Explain Hidden Matches: the "Found in" notes under rows. */
  notes: boolean;
};

export const SettingsSearchContext = createContext<SettingsSearchState | undefined>(undefined);

/** The settings search in progress, if any. */
export function useSettingsSearch(): SettingsSearchState | undefined {
  return useContext(SettingsSearchContext);
}

/** Where the search in progress matched a setting; undefined without a search or a match. */
export function useSettingSearchMatch(fieldKey: keyof Settings): SettingSearchMatch | undefined {
  const search = useSettingsSearch();
  return search ? matchSetting(fieldKey, search.query, search.sources) : undefined;
}
