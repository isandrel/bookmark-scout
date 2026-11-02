/**
 * The manager's saved searches, kept in step with storage so changes made in another manager tab
 * show up here too. Saving, renaming, and deleting run the saved search actions as the user
 * (`saved-search-actions.ts`); putting a deleted one back (Undo) and reordering are the menu's own.
 */

/** A saved search action's answer as the menu words it: the search's name as kept, or why not. */
export type SavedSearchChange =
  | { ok: true; name: string }
  | { ok: false; error: SavedSearchError | 'failed' };

function asChange(result: unknown): SavedSearchChange {
  if (!isActionError(result)) return { ok: true, name: (result as { name: string }).name };
  const { reason } = result.error;
  return { ok: false, error: isSavedSearchError(reason) ? reason : 'failed' };
}

export function useSavedSearches() {
  const { value: searches } = useStoredValue(savedSearchesValue);
  return {
    searches,
    create: async (name: string, query: SavedSearchQuery) =>
      asChange(await runUIAction('saveSearch', { name, query }, 'manager')),
    rename: async (id: string, name: string) =>
      asChange(await runUIAction('renameSearch', { id, name }, 'manager')),
    remove: async (id: string) => asChange(await runUIAction('deleteSearch', { id }, 'manager')),
    restore: restoreSavedSearch,
    reorder: reorderSavedSearches,
  };
}
