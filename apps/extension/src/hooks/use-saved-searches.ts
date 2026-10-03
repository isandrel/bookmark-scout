/**
 * The manager's saved searches, kept in step with storage so changes made in another manager tab
 * show up here too.
 */

const selectSearches = (payload: SavedSearchesPayload) => payload.searches;

export function useSavedSearches() {
  const { value: searches } = useStoredValue(savedSearchesValue, selectSearches);
  return {
    searches,
    create: createSavedSearch,
    rename: renameSavedSearch,
    remove: deleteSavedSearch,
    restore: restoreSavedSearch,
  };
}
