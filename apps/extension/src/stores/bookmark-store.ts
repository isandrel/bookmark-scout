/**
 * Zustand store for bookmark state management.
 * Centralizes all bookmark-related state and actions.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  createBookmark,
  deleteBookmark,
  fetchBookmarkTree,
  getBookmark,
  getCurrentTab,
  moveBookmark,
} from '@/services';
import type { BookmarkTreeNode, DragOperation } from '@/types';

export interface SearchOptions {
  matchCase: boolean;
  wholeWord: boolean;
  useRegex: boolean;
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
  expandedFolders: string[];
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

  // Filter helpers
  filterFolders: (nodes: BookmarkTreeNode[], searchQuery: string) => BookmarkTreeNode[];
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
      expandedFolders: [],
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

          const truncatedTitle = tab.title
            ? tab.title.length > 30
              ? `${tab.title.slice(0, 30)}...`
              : tab.title
            : 'New Bookmark';

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

          const truncatedTitle = bookmark.title
            ? bookmark.title.length > 30
              ? `${bookmark.title.slice(0, 30)}...`
              : bookmark.title
            : 'Bookmark';

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

          const truncatedTitle = folder.title
            ? folder.title.length > 30
              ? `${folder.title.slice(0, 30)}...`
              : folder.title
            : 'Folder';

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

          const message = operation.type.includes('move')
            ? `"${sourceItem.title}" moved to "${targetFolder?.title || 'root'}"`
            : `"${sourceItem.title}" reordered to position ${operation.targetIndex + 1}`;

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

        const findNode = (nodes: BookmarkTreeNode[], id: string): BookmarkTreeNode | null => {
          for (const n of nodes) {
            if (n.id === id) return n;
            if (n.children) {
              const found = findNode(n.children, id);
              if (found) return found;
            }
          }
          return null;
        };

        const originalNode = findNode(folders, node.id);
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

        const findNode = (nodes: BookmarkTreeNode[], id: string): BookmarkTreeNode | null => {
          for (const n of nodes) {
            if (n.id === id) return n;
            if (n.children) {
              const found = findNode(n.children, id);
              if (found) return found;
            }
          }
          return null;
        };

        const originalNode = findNode(folders, node.id);
        if (!originalNode) return false;

        const childFolderIds = getAllChildFolderIds(originalNode);
        return (
          childFolderIds.length > 0 && childFolderIds.every((id) => expandedFolders.includes(id))
        );
      },

      // Filter helpers
      filterFolders: (nodes, searchQuery) => {
        const { forceExpandAll, searchOptions } = get();

        if (!searchQuery) return nodes;

        if (forceExpandAll) {
          const deepCopy = (node: BookmarkTreeNode): BookmarkTreeNode => ({
            ...node,
            children: node.children ? node.children.map(deepCopy) : undefined,
            isOpen: true,
          });
          return nodes.map(deepCopy);
        }

        // Build match function based on search options
        const createMatcher = (query: string): ((text: string) => boolean) => {
          try {
            if (searchOptions.useRegex) {
              const flags = searchOptions.matchCase ? '' : 'i';
              const pattern = searchOptions.wholeWord ? `\\b${query}\\b` : query;
              const regex = new RegExp(pattern, flags);
              return (text: string) => regex.test(text);
            } else {
              let pattern = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape special chars
              if (searchOptions.wholeWord) {
                pattern = `\\b${pattern}\\b`;
              }
              const flags = searchOptions.matchCase ? '' : 'i';
              const regex = new RegExp(pattern, flags);
              return (text: string) => regex.test(text);
            }
          } catch {
            // Invalid regex, fall back to simple includes
            return (text: string) =>
              searchOptions.matchCase
                ? text.includes(query)
                : text.toLowerCase().includes(query.toLowerCase());
          }
        };

        const matches = createMatcher(searchQuery);

        // Build highlight function
        const highlightText = (text: string, query: string): string => {
          try {
            let pattern: string;
            if (searchOptions.useRegex) {
              pattern = searchOptions.wholeWord ? `\\b(${query})\\b` : `(${query})`;
            } else {
              const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              pattern = searchOptions.wholeWord ? `\\b(${escaped})\\b` : `(${escaped})`;
            }
            const flags = searchOptions.matchCase ? 'g' : 'gi';
            return text.replace(new RegExp(pattern, flags), '<b>$1</b>');
          } catch {
            return text;
          }
        };

        const filtered: BookmarkTreeNode[] = [];
        for (const node of nodes) {
          const nodeMatches = matches(node.title);

          if (node.children) {
            const filteredChildren = get().filterFolders(node.children, searchQuery);

            if (nodeMatches || filteredChildren.length > 0) {
              const childrenToInclude = nodeMatches
                ? node.children.map((child) => {
                    if (child.children && matches(child.title)) {
                      return {
                        ...child,
                        title: highlightText(child.title, searchQuery),
                        isOpen: true,
                      };
                    }
                    return child;
                  })
                : filteredChildren;

              const shouldExpand =
                !nodeMatches ||
                node.children?.some((child) => child.children && matches(child.title));

              filtered.push({
                ...node,
                title: nodeMatches ? highlightText(node.title, searchQuery) : node.title,
                children: childrenToInclude,
                isOpen: shouldExpand,
              });
            }
          } else if (nodeMatches) {
            filtered.push({
              ...node,
              title: highlightText(node.title, searchQuery),
            });
          }
        }
        return filtered;
      },

      applyFilter: () => {
        const { folders, debouncedQuery, filterFolders, forceExpandAll } = get();

        if (debouncedQuery) {
          const filtered = filterFolders(folders, debouncedQuery);
          set({ filteredFolders: filtered });

          const getExpandableFolderIds = (nodes: BookmarkTreeNode[]): string[] => {
            return nodes.reduce((acc: string[], node) => {
              if (node.children && (node.isOpen || forceExpandAll)) {
                return [...acc, node.id, ...getExpandableFolderIds(node.children)];
              }
              return acc;
            }, []);
          };

          set({ expandedFolders: getExpandableFolderIds(filtered) });
        } else {
          set({ filteredFolders: folders, expandedFolders: [], forceExpandAll: false });
        }
      },
    }),
    { name: 'bookmark-store' },
  ),
);
