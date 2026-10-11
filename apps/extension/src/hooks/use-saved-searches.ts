/**
 * The manager's saved searches, kept in step with storage so changes made in another manager tab
 * show up here too.
 */

export function useSavedSearches() {
  const { value: searches } = useStoredValue(savedSearchesValue);
  return {
    searches,
    create: createSavedSearch,
    rename: renameSavedSearch,
    remove: deleteSavedSearch,
    restore: restoreSavedSearch,
  };
}
