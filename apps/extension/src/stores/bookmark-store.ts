/**
 * Zustand store for bookmark state management.
 * Centralizes all bookmark-related state and actions.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { BookmarkTreeNode, DragOperation } from '@/types';

const TITLE_TRUNCATE_LENGTH = 30;

/** Outcome of a bookmark operation, with a localized description for the toast. */
export type BookmarkOperationResult = {
  success: boolean;
  message: string;
  /** Nothing was changed on purpose, e.g. the page is already saved in that folder. */
  skipped?: boolean;
};

function truncateBookmarkTitle(title: string | undefined): string {
  if (!title) {
    return t('popup_untitled');
  }

  return title.length > TITLE_TRUNCATE_LENGTH
    ? `${title.slice(0, TITLE_TRUNCATE_LENGTH)}...`
    : title;
}

function isMoveToOtherFolder(operation: DragOperation): boolean {
  return operation.type.endsWith('-move') || operation.sourceParentId !== operation.targetParentId;
}

function buildMoveSuccessMessage(
  operation: DragOperation,
  sourceTitle: string,
  targetFolderTitle: string | null,
): string {
  const title = truncateBookmarkTitle(sourceTitle);
  return isMoveToOtherFolder(operation)
    ? t('toast_itemMovedDesc', [title, targetFolderTitle || t('popup_untitled')])
    : t('toast_itemReorderedDesc', [title, String(operation.targetIndex + 1)]);
}

function findNodeById(nodes: readonly BookmarkTreeNode[], id: string): BookmarkTreeNode | null {
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

function collectChildFolderIds(node: BookmarkTreeNode, ids: string[] = []): string[] {
  for (const child of node.children ?? []) {
    if (child.children) {
      ids.push(child.id);
      collectChildFolderIds(child, ids);
    }
  }
  return ids;
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
  /** Reload the tree without the loading skeleton, keeping expansion and search state. */
  refreshFolders: () => Promise<void>;
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
  addBookmarkToFolder: (folderId: string) => Promise<BookmarkOperationResult>;
  createFolder: (parentId: string, name: string) => Promise<BookmarkOperationResult>;
  removeBookmark: (bookmarkId: string) => Promise<BookmarkOperationResult>;
  removeFolder: (folderId: string) => Promise<BookmarkOperationResult>;
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
          console.error('Failed to refresh bookmarks:', error);
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
          const truncatedTitle = truncateBookmarkTitle(tab.title);

          // Saving the same page into the same folder twice only creates a duplicate.
          const siblings = tab.url ? await getBookmarkChildren(folderId) : [];
          if (siblings.some((child) => child.url === tab.url)) {
            return {
              success: false,
              skipped: true,
              message: t('toast_bookmarkAlreadyInFolderDesc', [
                truncatedTitle,
                parentFolder.title || t('popup_untitled'),
              ]),
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
            message: t('toast_bookmarkAddedDesc', [
              truncatedTitle,
              parentFolder.title || t('popup_untitled'),
            ]),
          };
        } catch (error) {
          console.error('Failed to add bookmark:', error);
          return { success: false, message: t('toast_errorAddingBookmarkDesc') };
        }
      },

      createFolder: async (parentId, name) => {
        try {
          const parentFolder = await getBookmark(parentId);
          await createBookmark({ parentId, title: name.trim() });
          await get().refreshFolders();
          return {
            success: true,
            message: t('toast_folderCreatedDesc', [
              name.trim(),
              parentFolder.title || t('popup_untitled'),
            ]),
          };
        } catch (error) {
          console.error('Failed to create folder:', error);
          return { success: false, message: t('toast_errorCreatingFolderDesc') };
        }
      },

      removeBookmark: async (bookmarkId) => {
        try {
          const bookmark = await getBookmark(bookmarkId);
          await deleteBookmark(bookmarkId);
          await get().refreshFolders();

          return {
            success: true,
            message: t('toast_itemRemovedDesc', truncateBookmarkTitle(bookmark.title)),
          };
        } catch (error) {
          console.error('Failed to delete bookmark:', error);
          return { success: false, message: t('toast_errorDeletingBookmarkDesc') };
        }
      },

      removeFolder: async (folderId) => {
        try {
          const folder = await getBookmark(folderId);
          await deleteBookmark(folderId);
          await get().refreshFolders();

          return {
            success: true,
            message: t('toast_itemRemovedDesc', truncateBookmarkTitle(folder.title)),
          };
        } catch (error) {
          console.error('Failed to delete folder:', error);
          return { success: false, message: t('toast_errorDeletingFolderDesc') };
        }
      },

      handleDrop: async (operation) => {
        // Browsers reject moving a folder into itself or its own subtree with a generic error.
        const source = findNodeById(get().folders, operation.sourceId);
        if (source?.children && findNodeById([source], operation.targetParentId)) {
          return { success: false, message: t('toast_cannotMoveIntoDescendant') };
        }

        try {
          // Always pass the parent: dropping beside an item in another folder moves it there.
          await moveBookmark(operation.sourceId, {
            parentId: operation.targetParentId,
            index: operation.targetIndex,
          });

          await get().refreshFolders();

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
          return { success: false, message: t('toast_errorMovingItemDesc') };
        }
      },

      // Folder expansion helpers
      getAllChildFolderIds: (node) => collectChildFolderIds(node),

      toggleExpandAllChildren: (node, e) => {
        e.stopPropagation();
        const { folders, expandedFolders, setExpandedFolders } = get();

        const originalNode = findNodeById(folders, node.id);
        if (!originalNode) return;

        const childFolderIds = collectChildFolderIds(originalNode);
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

        const originalNode = findNodeById(folders, node.id);
        if (!originalNode) return false;

        const childFolderIds = collectChildFolderIds(originalNode);
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
