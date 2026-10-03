/**
 * Zustand store for bookmark state management.
 * Centralizes all bookmark-related state and actions.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { BookmarkTreeNode, DragOperation } from '@/types';

/** Outcome of a bookmark operation, with a localized description for the toast. */
export type BookmarkOperationResult = {
  success: boolean;
  message: string;
  /** Nothing was changed on purpose, e.g. the page is already saved in that folder. */
  skipped?: boolean;
  /** Nothing happened and nothing needs to be said: a repeated click or a drop in place. */
  silent?: boolean;
};

/** `expand`/`collapse` open or close every folder of the search results; `null` is automatic. */
export type SearchExpansion = 'expand' | 'collapse' | null;

const SILENT_RESULT: BookmarkOperationResult = {
  success: false,
  skipped: true,
  silent: true,
  message: '',
};

/** Adds and folder creations still running, so a double click or held key saves once. */
const inFlightOperations = new Set<string>();

async function runOnce(
  key: string,
  operation: () => Promise<BookmarkOperationResult>,
): Promise<BookmarkOperationResult> {
  if (inFlightOperations.has(key)) return SILENT_RESULT;
  inFlightOperations.add(key);
  try {
    return await operation();
  } finally {
    inFlightOperations.delete(key);
  }
}

function isMoveToOtherFolder(operation: DragOperation): boolean {
  return operation.type.endsWith('-move') || operation.sourceParentId !== operation.targetParentId;
}

async function buildMoveSuccessMessage(
  operation: DragOperation,
  source: Pick<Browser.bookmarks.BookmarkTreeNode, 'title' | 'index'>,
  targetFolderTitle: string | null,
): Promise<string> {
  const title = await quoteToastItemTitle(source.title);
  // Report where the item actually landed: moving down within a folder shifts the index by one.
  const position = (source.index ?? operation.targetIndex) + 1;
  return isMoveToOtherFolder(operation)
    ? t('toast_itemMovedDesc', [title, getBookmarkDisplayTitle(targetFolderTitle)])
    : t('toast_itemReorderedDesc', [title, String(position)]);
}

interface BookmarkState {
  // State
  folders: BookmarkTreeNode[];
  filteredFolders: BookmarkTreeNode[];
  isLoading: boolean;
  error: string | null;
  query: string;
  debouncedQuery: string;
  searchOptions: SearchOptions;
  expandFoldersOnSearch: boolean;
  expandedFolders: string[];
  /** Expansion the user had before searching; restored when the query is cleared. */
  preSearchExpandedFolders: string[] | null;
  /** Expand all / Collapse all chosen during a search; overrides the automatic expansion. */
  searchExpansion: SearchExpansion;
  creatingFolderId: string | null;
  newFolderName: string;
  /** Folders the current page is being saved into; their add controls are disabled. */
  addingToFolderIds: string[];

  // Actions
  fetchFolders: () => Promise<void>;
  /** Reload the tree without the loading skeleton, keeping expansion and search state. */
  refreshFolders: () => Promise<void>;
  setQuery: (query: string) => void;
  setDebouncedQuery: (query: string) => void;
  setExpandedFolders: (folders: string[] | ((prev: string[]) => string[])) => void;
  setSearchExpansion: (expansion: SearchExpansion) => void;
  setSearchOptions: (options: Partial<SearchOptions>) => void;
  setExpandFoldersOnSearch: (expand: boolean) => void;
  setCreatingFolderId: (id: string | null) => void;
  setNewFolderName: (name: string) => void;

  // Bookmark operations
  addBookmarkToFolder: (folderId: string) => Promise<BookmarkOperationResult>;
  createFolder: (parentId: string, name: string) => Promise<BookmarkOperationResult>;
  handleDrop: (operation: DragOperation) => Promise<BookmarkOperationResult>;

  // Folder expansion helpers
  getAllChildFolderIds: (node: BookmarkTreeNode) => string[];
  toggleExpandAllChildren: (node: BookmarkTreeNode, e: React.MouseEvent) => void;
  areAllChildrenExpanded: (node: BookmarkTreeNode) => boolean;

  applyFilter: () => void;
}

export const useBookmarkStore = create<BookmarkState>()(
  devtools(
    (set, get) => ({
      // Initial state
      folders: [],
      filteredFolders: [],
      isLoading: true,
      error: null,
      query: '',
      debouncedQuery: '',
      searchOptions: { ...DEFAULT_SEARCH_OPTIONS },
      expandFoldersOnSearch: defaultSettings.expandFoldersOnSearch,
      expandedFolders: [],
      preSearchExpandedFolders: null,
      searchExpansion: null,
      creatingFolderId: null,
      newFolderName: '',
      addingToFolderIds: [],

      // Fetch folders from Chrome API
      fetchFolders: async () => {
        set({ isLoading: true, error: null });
        try {
          const data = await fetchBookmarkTree();
          set({ folders: data, filteredFolders: data, isLoading: false });
          // Re-filter so a refresh during an active search keeps showing search results.
          if (get().debouncedQuery) get().applyFilter();
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : t('error_unknown'),
            isLoading: false,
          });
        }
      },

      refreshFolders: async () => {
        try {
          const data = await fetchBookmarkTree();
          set({ folders: data, filteredFolders: data });
          if (get().debouncedQuery) get().applyFilter();
        } catch (error) {
          bookmarkLogger.error({ error }, 'Failed to refresh bookmarks');
        }
      },

      // Setters
      setQuery: (query) => set({ query }),
      setDebouncedQuery: (debouncedQuery) => {
        set({ debouncedQuery });
        get().applyFilter();
      },
      setExpandedFolders: (folders) => {
        if (typeof folders === 'function') {
          set((state) => ({ expandedFolders: folders(state.expandedFolders) }));
        } else {
          set({ expandedFolders: folders });
        }
      },
      setSearchExpansion: (searchExpansion) => {
        set({ searchExpansion });
        get().applyFilter();
      },
      setSearchOptions: (options) => {
        set((state) => ({ searchOptions: { ...state.searchOptions, ...options } }));
        get().applyFilter();
      },
      setExpandFoldersOnSearch: (expandFoldersOnSearch) => {
        if (get().expandFoldersOnSearch === expandFoldersOnSearch) return;
        set({ expandFoldersOnSearch });
        if (get().debouncedQuery) get().applyFilter();
      },
      setCreatingFolderId: (creatingFolderId) => set({ creatingFolderId }),
      setNewFolderName: (newFolderName) => set({ newFolderName }),

      // Bookmark operations
      addBookmarkToFolder: async (folderId) => {
        let tab: Browser.tabs.Tab;
        try {
          tab = await getCurrentTab();
        } catch (error) {
          bookmarkLogger.error({ error }, 'Failed to add bookmark');
          return { success: false, message: t('toast_errorAddingBookmarkDesc') };
        }

        // The duplicate check below cannot see a save that has not finished yet, so a double
        // click, or two clicks before the first save lands, must not start a second save.
        return runOnce(`add\n${folderId}\n${tab.url ?? ''}`, async () => {
          set((state) => ({ addingToFolderIds: [...state.addingToFolderIds, folderId] }));
          try {
            const parentFolder = await getBookmark(folderId);
            const truncatedTitle = await quoteToastItemTitle(tab.title);
            const folderTitle = getBookmarkDisplayTitle(parentFolder.title);

            // Saving the same page into the same folder twice only creates a duplicate.
            const siblings = tab.url ? await getBookmarkChildren(folderId) : [];
            if (siblings.some((child) => child.url === tab.url)) {
              return {
                success: false,
                skipped: true,
                message: t('toast_bookmarkAlreadyInFolderDesc', [truncatedTitle, folderTitle]),
              };
            }

            await createBookmark({
              parentId: folderId,
              title: tab.title || t('popup_untitled'),
              url: tab.url || '',
            });
            await get().refreshFolders();

            return {
              success: true,
              message: t('toast_bookmarkAddedDesc', [truncatedTitle, folderTitle]),
            };
          } catch (error) {
            bookmarkLogger.error({ error }, 'Failed to add bookmark');
            return { success: false, message: t('toast_errorAddingBookmarkDesc') };
          } finally {
            set((state) => ({
              addingToFolderIds: state.addingToFolderIds.filter((id) => id !== folderId),
            }));
          }
        });
      },

      createFolder: (parentId, name) =>
        runOnce(`folder\n${parentId}\n${name.trim()}`, async () => {
          try {
            const parentFolder = await getBookmark(parentId);
            await createBookmark({ parentId, title: name.trim() });
            await get().refreshFolders();
            return {
              success: true,
              message: t('toast_folderCreatedDesc', [
                name.trim(),
                getBookmarkDisplayTitle(parentFolder.title),
              ]),
            };
          } catch (error) {
            bookmarkLogger.error({ error }, 'Failed to create folder');
            return { success: false, message: t('toast_errorCreatingFolderDesc') };
          }
        }),

      handleDrop: async (operation) => {
        // Browsers reject moving a folder into itself or its own subtree with a generic error.
        const source = findNode(get().folders, operation.sourceId);
        if (source?.children && findNode([source], operation.targetParentId)) {
          return { success: false, message: t('toast_cannotMoveIntoDescendant') };
        }

        try {
          const before = await getBookmark(operation.sourceId);
          // Always pass the parent: dropping beside an item in another folder moves it there.
          await moveBookmark(operation.sourceId, {
            parentId: operation.targetParentId,
            index: operation.targetIndex,
          });

          await get().refreshFolders();

          const sourceItem = await getBookmark(operation.sourceId);
          // Dropping an item onto its own position (e.g. just below itself) changes nothing.
          if (sourceItem.parentId === before.parentId && sourceItem.index === before.index) {
            return SILENT_RESULT;
          }
          const targetFolder = operation.targetParentId
            ? await getBookmark(operation.targetParentId)
            : null;

          const message = await buildMoveSuccessMessage(
            operation,
            sourceItem,
            targetFolder?.title ?? null,
          );

          return { success: true, message };
        } catch (error) {
          bookmarkLogger.error({ error }, 'Failed to move item');
          return { success: false, message: t('toast_errorMovingItemDesc') };
        }
      },

      // Folder expansion helpers
      getAllChildFolderIds: (node) => folderIds(node.children ?? []),

      toggleExpandAllChildren: (node, e) => {
        e.stopPropagation();
        const { folders, expandedFolders, setExpandedFolders } = get();

        const originalNode = findNode(folders, node.id);
        if (!originalNode) return;

        const childFolderIds = folderIds(originalNode.children ?? []);
        if (get().areAllChildrenExpanded(node)) {
          // Collapse the subfolders but leave the folder itself open.
          const collapsed = new Set(childFolderIds);
          setExpandedFolders(expandedFolders.filter((id) => !collapsed.has(id)));
        } else {
          setExpandedFolders([...new Set([...expandedFolders, node.id, ...childFolderIds])]);
        }
      },

      areAllChildrenExpanded: (node) => {
        const { folders, expandedFolders } = get();

        const originalNode = findNode(folders, node.id);
        if (!originalNode) return false;

        const childFolderIds = folderIds(originalNode.children ?? []);
        const expanded = new Set(expandedFolders);
        return (
          childFolderIds.length > 0 &&
          expanded.has(node.id) &&
          childFolderIds.every((id) => expanded.has(id))
        );
      },

      applyFilter: () => {
        const {
          folders,
          debouncedQuery,
          searchOptions,
          searchExpansion: expansionOverride,
          expandFoldersOnSearch,
          expandedFolders,
          preSearchExpandedFolders,
        } = get();

        if (!debouncedQuery) {
          set({
            filteredFolders: folders,
            searchExpansion: null,
            expandedFolders: preSearchExpandedFolders ?? expandedFolders,
            preSearchExpandedFolders: null,
          });
          return;
        }

        const savedExpansion = preSearchExpandedFolders ?? expandedFolders;
        const filtered = filterBookmarkTree(folders, debouncedQuery, searchOptions);
        // Expand all / Collapse all apply to the search results without dropping the filter,
        // and win over the automatic expansion so they work while expandFoldersOnSearch is on.
        const searchExpansion =
          expansionOverride === 'expand'
            ? folderIds(filtered)
            : expansionOverride === 'collapse'
              ? []
              : expandFoldersOnSearch
                ? getSearchExpandedFolderIds(filtered)
                : savedExpansion;
        set({
          filteredFolders: filtered,
          expandedFolders: searchExpansion,
          preSearchExpandedFolders: savedExpansion,
        });
      },
    }),
    { name: 'bookmark-store' },
  ),
);
