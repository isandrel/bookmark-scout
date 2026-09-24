/**
 * Zustand store for bookmark state management.
 * Centralizes all bookmark-related state and actions.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { BookmarkTreeNode, DragOperation } from '@/types';

const TITLE_TRUNCATE_LENGTH = 30;

function truncateBookmarkTitle(title: string | undefined, fallback: string): string {
  if (!title) {
    return fallback;
  }

  return title.length > TITLE_TRUNCATE_LENGTH
    ? `${title.slice(0, TITLE_TRUNCATE_LENGTH)}...`
    : title;
}

function buildMoveSuccessMessage(
  operation: DragOperation,
  sourceTitle: string,
  targetFolderTitle: string | null,
): string {
  return operation.type.includes('move')
    ? `"${sourceTitle}" moved to "${targetFolderTitle || 'root'}"`
    : `"${sourceTitle}" reordered to position ${operation.targetIndex + 1}`;
}

function findNodeById(nodes: BookmarkTreeNode[], id: string): BookmarkTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }

    if (node.children) {
      const foundNode = findNodeById(node.children, id);

      if (foundNode) {
        return foundNode;
      }
    }
  }

  return null;
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
  forceExpandAll: boolean;
  draggedItem: BookmarkTreeNode | null;
  creatingFolderId: string | null;
  newFolderName: string;

  // Actions
  fetchFolders: () => Promise<void>;
  setQuery: (query: string) => void;
  setDebouncedQuery: (query: string) => void;
  setExpandedFolders: (folders: string[] | ((prev: string[]) => string[])) => void;
  setForceExpandAll: (expand: boolean) => void;
  setSearchOptions: (options: Partial<SearchOptions>) => void;
  setExpandFoldersOnSearch: (expand: boolean) => void;
  setDraggedItem: (item: BookmarkTreeNode | null) => void;
  setCreatingFolderId: (id: string | null) => void;
  setNewFolderName: (name: string) => void;

  // Bookmark operations
  addBookmarkToFolder: (folderId: string) => Promise<{ success: boolean; message: string }>;
  createFolder: (parentId: string, name: string) => Promise<{ success: boolean; message: string }>;
  removeBookmark: (bookmarkId: string) => Promise<{ success: boolean; message: string }>;
  removeFolder: (folderId: string) => Promise<{ success: boolean; message: string }>;
  handleDrop: (operation: DragOperation) => Promise<{ success: boolean; message: string }>;

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
      searchOptions: { matchCase: false, wholeWord: false, useRegex: false },
      expandFoldersOnSearch: true,
      expandedFolders: [],
      preSearchExpandedFolders: null,
      forceExpandAll: false,
      draggedItem: null,
      creatingFolderId: null,
      newFolderName: '',

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
            error: err instanceof Error ? err.message : 'Failed to fetch bookmarks',
            isLoading: false,
          });
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
      setForceExpandAll: (forceExpandAll) => {
        set({ forceExpandAll });
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
      setDraggedItem: (draggedItem) => set({ draggedItem }),
      setCreatingFolderId: (creatingFolderId) => set({ creatingFolderId }),
      setNewFolderName: (newFolderName) => set({ newFolderName }),

      // Bookmark operations
      addBookmarkToFolder: async (folderId) => {
        try {
          const tab = await getCurrentTab();
          const parentFolder = await getBookmark(folderId);
          await createBookmark({
            parentId: folderId,
            title: tab.title || 'New Bookmark',
            url: tab.url || '',
          });
          await get().fetchFolders();

          const truncatedTitle = truncateBookmarkTitle(tab.title, 'New Bookmark');

          return {
            success: true,
            message: `"${truncatedTitle}" added to "${parentFolder.title}"`,
          };
        } catch (error) {
          console.error('Failed to add bookmark:', error);
          return { success: false, message: 'Failed to add bookmark. Please try again.' };
        }
      },

      createFolder: async (parentId, name) => {
        try {
          const parentFolder = await getBookmark(parentId);
          await createBookmark({ parentId, title: name.trim() });
          await get().fetchFolders();
          return {
            success: true,
            message: `New folder "${name.trim()}" added in "${parentFolder.title}"`,
          };
        } catch (error) {
          console.error('Failed to create folder:', error);
          return { success: false, message: 'Failed to create new folder. Please try again.' };
        }
      },

      removeBookmark: async (bookmarkId) => {
        try {
          const bookmark = await getBookmark(bookmarkId);
          await deleteBookmark(bookmarkId);
          await get().fetchFolders();

          const truncatedTitle = truncateBookmarkTitle(bookmark.title, 'Bookmark');

          return { success: true, message: `"${truncatedTitle}" has been removed` };
        } catch (error) {
          console.error('Failed to delete bookmark:', error);
          return { success: false, message: 'Failed to delete bookmark. Please try again.' };
        }
      },

      removeFolder: async (folderId) => {
        try {
          const folder = await getBookmark(folderId);
          await deleteBookmark(folderId);
          await get().fetchFolders();

          const truncatedTitle = truncateBookmarkTitle(folder.title, 'Folder');

          return { success: true, message: `"${truncatedTitle}" has been removed` };
        } catch (error) {
          console.error('Failed to delete folder:', error);
          return { success: false, message: 'Failed to delete folder. Please try again.' };
        }
      },

      handleDrop: async (operation) => {
        try {
          if (operation.type === 'folder-move' || operation.type === 'bookmark-move') {
            await moveBookmark(operation.sourceId, {
              parentId: operation.targetParentId,
              index: operation.targetIndex,
            });
          } else {
            await moveBookmark(operation.sourceId, { index: operation.targetIndex });
          }

          await get().fetchFolders();

          const sourceItem = await getBookmark(operation.sourceId);
          const targetFolder = operation.targetParentId
            ? await getBookmark(operation.targetParentId)
            : null;

          const message = buildMoveSuccessMessage(
            operation,
            sourceItem.title,
            targetFolder?.title ?? null,
          );

          return { success: true, message };
        } catch (error) {
          console.error('Failed to move item:', error);
          return { success: false, message: 'Failed to move item. Please try again.' };
        }
      },

      // Folder expansion helpers
      getAllChildFolderIds: (node) => {
        if (!node.children) return [];
        return node.children.reduce((acc: string[], child) => {
          if (child.children) {
            return [...acc, child.id, ...get().getAllChildFolderIds(child)];
          }
          return acc;
        }, []);
      },

      toggleExpandAllChildren: (node, e) => {
        e.stopPropagation();
        const { folders, expandedFolders, getAllChildFolderIds, setExpandedFolders } = get();

        const originalNode = findNodeById(folders, node.id);
        if (!originalNode) return;

        const childFolderIds = getAllChildFolderIds(originalNode);
        const isExpanded = childFolderIds.every((id) => expandedFolders.includes(id));

        if (isExpanded) {
          setExpandedFolders(expandedFolders.filter((id) => !childFolderIds.includes(id)));
        } else {
          setExpandedFolders([...new Set([...expandedFolders, ...childFolderIds])]);
        }
      },

      areAllChildrenExpanded: (node) => {
        const { folders, expandedFolders, getAllChildFolderIds } = get();

        const originalNode = findNodeById(folders, node.id);
        if (!originalNode) return false;

        const childFolderIds = getAllChildFolderIds(originalNode);
        return (
          childFolderIds.length > 0 && childFolderIds.every((id) => expandedFolders.includes(id))
        );
      },

      applyFilter: () => {
        const {
          folders,
          debouncedQuery,
          searchOptions,
          forceExpandAll,
          expandFoldersOnSearch,
          expandedFolders,
          preSearchExpandedFolders,
        } = get();

        if (!debouncedQuery) {
          set({
            filteredFolders: folders,
            forceExpandAll: false,
            expandedFolders: preSearchExpandedFolders ?? expandedFolders,
            preSearchExpandedFolders: null,
          });
          return;
        }

        const savedExpansion = preSearchExpandedFolders ?? expandedFolders;
        const filtered = filterBookmarkTree(folders, debouncedQuery, searchOptions);
        // "Expand all" opens every folder of the search results without dropping the filter.
        const searchExpansion = forceExpandAll
          ? getAllFolderIds(filtered)
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
