/**
 * The Options page's current settings search, for the rows and panels that mark what it matched
 * (`SettingSearchText`, `SettingSearchNote`). Outside a search the query is undefined and they
 * draw plain text.
 */
import { createContext, useContext } from 'react';

export const SettingsSearchContext = createContext<TextQuery | undefined>(undefined);

/** The compiled query of the settings search in progress, if any. */
export function useSettingsSearchQuery(): TextQuery | undefined {
  return useContext(SettingsSearchContext);
}

/** Where the search in progress matched a setting; undefined without a search or a match. */
export function useSettingSearchMatch(fieldKey: keyof Settings): SettingSearchMatch | undefined {
  const query = useSettingsSearchQuery();
  return query ? matchSetting(fieldKey, query) : undefined;
}
