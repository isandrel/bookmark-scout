import { useCallback, useEffect, useState } from 'react';

/**
 * Recent searches gated by the `searchHistory` setting. Turning the setting off also clears
 * stored entries, because hiding them alone would still retain possibly sensitive queries.
 */
export function useSearchHistory(enabled: boolean, settingLoading: boolean) {
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    if (settingLoading) return;
    if (!enabled) {
      setHistory([]);
      void clearSearchHistory();
      return;
    }

    let active = true;
    void getSearchHistory().then((entries) => {
      if (active) setHistory(entries);
    });
    const unwatch = watchSearchHistory(setHistory);
    return () => {
      active = false;
      unwatch();
    };
  }, [enabled, settingLoading]);

  const record = useCallback(
    async (query: string) => {
      if (!enabled || settingLoading || !query.trim()) return;
      setHistory(await addSearchHistoryEntry(query));
    },
    [enabled, settingLoading],
  );

  const clear = useCallback(async () => {
    setHistory([]);
    await clearSearchHistory();
  }, []);

  return { history: enabled ? history : [], record, clear };
}
