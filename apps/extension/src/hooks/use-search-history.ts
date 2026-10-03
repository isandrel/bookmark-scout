import { useCallback, useEffect } from 'react';

/**
 * Recent searches gated by the `searchHistory` setting. Turning the setting off also clears
 * stored entries, because hiding them alone would still retain possibly sensitive queries.
 */
export function useSearchHistory(enabled: boolean, settingLoading: boolean) {
  const { value: history } = useStoredValue(searchHistoryValue);

  useEffect(() => {
    if (!settingLoading && !enabled) void clearSearchHistory();
  }, [enabled, settingLoading]);

  const record = useCallback(
    async (query: string) => {
      if (!enabled || settingLoading || !query.trim()) return;
      await addSearchHistoryEntry(query);
    },
    [enabled, settingLoading],
  );

  const clear = useCallback(() => clearSearchHistory(), []);

  return { history: enabled && !settingLoading ? history : [], record, clear };
}
