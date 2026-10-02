/**
 * The manager's saved searches, kept in step with storage so changes made in another manager tab
 * show up here too.
 */

import { useCallback, useEffect, useState } from 'react';

export function useSavedSearches() {
  const [searches, setSearches] = useState<SavedSearch[]>([]);

  useEffect(() => {
    let active = true;
    void getSavedSearches().then((stored) => {
      if (active) setSearches(stored);
    });
    const unwatch = watchSavedSearches((stored) => {
      if (active) setSearches(stored);
    });
    return () => {
      active = false;
      unwatch();
    };
  }, []);

  const applyResult = useCallback((result: SavedSearchResult) => {
    if (result.ok) setSearches(result.searches);
    return result;
  }, []);

  const create = useCallback(
    async (name: string, query: SavedSearchQuery) =>
      applyResult(await createSavedSearch(name, query)),
    [applyResult],
  );
  const rename = useCallback(
    async (id: string, name: string) => applyResult(await renameSavedSearch(id, name)),
    [applyResult],
  );
  const remove = useCallback(async (id: string) => {
    setSearches(await deleteSavedSearch(id));
  }, []);
  const restore = useCallback(
    async (search: SavedSearch, index: number) =>
      applyResult(await restoreSavedSearch(search, index)),
    [applyResult],
  );

  return { searches, create, rename, remove, restore };
}
