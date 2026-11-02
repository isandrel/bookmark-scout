/**
 * The manager's saved searches as actions, for agents and Bookmark Scout's own pages: listing
 * them, saving a new one, renaming one, and deleting one, through the saved searches' own storage
 * and checks (`saved-searches-storage.ts`, `saved-search-query.ts`). A saved search keeps only a
 * query, never bookmarks, so none of these touch a bookmark.
 */
import { z } from 'zod';

/** Each of the saved searches' own failures, said for agents, with the reason pages word. */
function savedSearchError(error: SavedSearchError): ActionError {
  switch (error) {
    case 'empty-name':
      return actionError('invalid_input', 'The name is empty.', { reason: error });
    case 'duplicate-name':
      return actionError('invalid_input', 'Another saved search has this name.', {
        hint: 'Choose another name; listSavedSearches lists the names in use.',
        reason: error,
      });
    case 'limit':
      return actionError('not_allowed', `At most ${MAX_SAVED_SEARCHES} searches can be saved.`, {
        hint: 'Delete one first, or ask the user which to keep.',
        reason: error,
      });
    case 'invalid-query':
      return actionError('invalid_input', 'The search finds nothing to keep.', {
        hint: 'Pass search text, a folder, or a query from listSavedSearches.',
        reason: error,
      });
    case 'not-found':
      return actionError('not_found', 'There is no saved search with this id.', {
        hint: 'Call listSavedSearches for the ids.',
        reason: error,
      });
  }
}

const savedSearchOutput = z.object({
  id: z.string(),
  name: z.string(),
  search: z.string().optional().describe(agentText('saved_search_view.search')),
  folder: z.string().optional().describe(agentText('saved_search_view.folder')),
  query: savedSearchQuerySchema.describe(agentText('saved_search_view.query')),
});

/** A saved search as agents see it: its search text and folder by path, and the whole query. */
function searchView(search: SavedSearch, library: ActionLibrary) {
  const { folderId } = search.query;
  const folder = typeof folderId === 'string' ? library.folderById.get(folderId) : undefined;
  return {
    id: search.id,
    name: search.name,
    ...(search.query.filters.title ? { search: search.query.filters.title } : {}),
    ...(folder ? { folder: folder.path } : {}),
    query: search.query,
  };
}

const listSavedSearches = defineAction({
  risk: 'read',
  labelKey: 'actionName_listSavedSearches',
  targets: ['library'],
  agent: { description: agentText('list_saved_searches.agent_description') },
  input: z.object({}),
  output: z.object({ searches: z.array(savedSearchOutput) }),
  describe: () => t('askAI_toolListSavedSearches'),
  async execute() {
    const [searches, library] = await Promise.all([getSavedSearches(), loadActionLibrary()]);
    return { searches: searches.map((search) => searchView(search, library)) };
  },
});

const saveSearchInput = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(SAVED_SEARCH_NAME_MAX_LENGTH)
    .describe(agentText('save_search.name')),
  search: z.string().trim().min(1).optional().describe(agentText('save_search.search')),
  folder: z.string().min(1).optional().describe(agentText('save_search.folder')),
  query: savedSearchQuerySchema.optional().describe(agentText('save_search.query')),
});

/** The query a save keeps: the one given, or one made of the search text and folder. */
async function queryToSave(
  input: z.infer<typeof saveSearchInput>,
): Promise<SavedSearchQuery | ActionError> {
  if (input.query) {
    if (input.search || input.folder) {
      return actionError('invalid_input', 'Pass a query, or search text and a folder, not both.');
    }
    return input.query;
  }
  let folderId: string | undefined;
  if (input.folder) {
    const folder = resolveActionFolder(await loadActionLibrary(), input.folder);
    if (isActionError(folder)) return folder;
    folderId = folder.node.id;
  }
  return {
    filters: input.search ? { title: input.search } : {},
    syntaxVersion: SEARCH_SYNTAX_VERSION,
    sorting: [],
    ...(folderId ? { folderId } : {}),
  };
}

const saveSearch = defineAction({
  risk: 'write',
  labelKey: 'actionName_saveSearch',
  targets: ['library'],
  agent: { description: agentText('save_search.agent_description') },
  input: saveSearchInput,
  output: savedSearchOutput,
  describe: (input) => t('askAI_toolSaveSearch', input.name ?? ''),
  approvalPreview: {
    lines: (input) => [
      t('askAI_approvalSaveSearch', [input.name ?? '', input.search ?? input.folder ?? '']),
    ],
  },
  async precheck(input) {
    const query = await queryToSave(input);
    return isActionError(query) ? query : undefined;
  },
  async execute(input) {
    const query = await queryToSave(input);
    if (isActionError(query)) return query;
    const result = await createSavedSearch(input.name, query);
    if (!result.ok) return savedSearchError(result.error);
    return searchView(result.search, await loadActionLibrary());
  },
});

const searchId = z.string().min(1).describe(agentText('saved_search_view.id'));

const renameSearch = defineAction({
  risk: 'write',
  labelKey: 'actionName_renameSearch',
  targets: ['library'],
  agent: { description: agentText('rename_search.agent_description') },
  input: z.object({ id: searchId, name: saveSearchInput.shape.name }),
  output: savedSearchOutput,
  describe: (input) => t('askAI_toolRenameSearch', input.name ?? ''),
  async precheck(input) {
    return (await getSavedSearches()).some((search) => search.id === input.id)
      ? undefined
      : savedSearchError('not-found');
  },
  async execute(input) {
    const result = await renameSavedSearch(input.id, input.name);
    if (!result.ok) return savedSearchError(result.error);
    return searchView(result.search, await loadActionLibrary());
  },
});

const deleteSearch = defineAction({
  risk: 'write',
  labelKey: 'actionName_deleteSearch',
  targets: ['library'],
  agent: { description: agentText('delete_search.agent_description') },
  input: z.object({ id: searchId }),
  output: savedSearchOutput.describe(agentText('delete_search.deleted')),
  describe: () => t('askAI_toolDeleteSearch'),
  approvalPreview: {
    stored: {
      id: (input) => (typeof input.id === 'string' && input.id ? input.id : undefined),
      async load(id) {
        const search = (await getSavedSearches()).find((entry) => entry.id === id);
        return search ? { lines: [t('askAI_approvalDeleteSearch', search.name)] } : null;
      },
      missingKey: 'askAI_savedSearchMissing',
    },
  },
  async precheck(input) {
    return (await getSavedSearches()).some((search) => search.id === input.id)
      ? undefined
      : savedSearchError('not-found');
  },
  async execute(input) {
    const search = (await getSavedSearches()).find((entry) => entry.id === input.id);
    if (!search) return savedSearchError('not-found');
    await deleteSavedSearch(input.id);
    return searchView(search, await loadActionLibrary());
  },
});

export const SAVED_SEARCH_ACTIONS = {
  listSavedSearches,
  saveSearch,
  renameSearch,
  deleteSearch,
};
