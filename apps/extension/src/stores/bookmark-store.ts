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
    ? t('toast_itemMovedDesc', [title, await quoteToastItemTitle(targetFolderTitle)])
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
  /**
   * The page's first read of the tree, started once: by the popup before its first render, or on
   * mount when that did not run. Later calls share it instead of showing the skeleton again.
   */
  loadFolders: () => Promise<void>;
  /** Reload the tree without the loading skeleton, keeping expansion and search state. */
  refreshFolders: () => Promise<void>;
  /** Patch the tree with bookmark events (`useBookmarkEvents`), or reload it when that fails. */
  applyBookmarkEvents: (batch: BookmarkEventBatch) => Promise<void>;
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

function replaceTree(data: BookmarkTreeNode[]): void {
  useBookmarkStore.setState({ folders: data, filteredFolders: data, isLoading: false });
  // Re-filter so a refresh during an active search keeps showing search results.
  if (useBookmarkStore.getState().debouncedQuery) useBookmarkStore.getState().applyFilter();
}

// Reloads, event patches, and this page's own changes run one at a time, in order.
const treeSync: BookmarkTreeSync = createBookmarkTreeSync({
  getTree: (): BookmarkTreeNode[] | undefined => {
    const { isLoading, folders } = useBookmarkStore.getState();
    return isLoading ? undefined : folders;
  },
  setTree: replaceTree,
  reload: async () => {
    try {
      replaceTree(await fetchBookmarkTree());
    } catch (error) {
      if (useBookmarkStore.getState().isLoading) {
        useBookmarkStore.setState({
          error: error instanceof Error ? error.message : t('error_unknown'),
          isLoading: false,
        });
      } else {
        bookmarkLogger.error({ error }, 'Failed to refresh bookmarks');
      }
    }
  },
});

let firstLoad: Promise<void> | undefined;

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
      fetchFolders: () => {
        set({ isLoading: true, error: null });
        return treeSync.reload();
      },

      loadFolders: () => {
        firstLoad ??= get().fetchFolders();
        return firstLoad;
      },

      refreshFolders: () => treeSync.reload(),

      applyBookmarkEvents: (batch) => treeSync.applyBatch(batch),

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
            const folderTitle = await quoteToastItemTitle(parentFolder.title);

            // Saving the same page into the same folder twice only creates a duplicate.
            const siblings = tab.url ? await getBookmarkChildren(folderId) : [];
            if (siblings.some((child) => child.url === tab.url)) {
              return {
                success: false,
                skipped: true,
                message: t('toast_bookmarkAlreadyInFolderDesc', [truncatedTitle, folderTitle]),
              };
            }

            // Saving it into another folder is allowed, and the toast says it makes another copy.
            const elsewhere = tab.url
              ? (await findBookmarksByUrl(tab.url)).find((node) => node.parentId !== folderId)
              : undefined;
            const otherFolderTitle = elsewhere?.parentId
              ? await quoteToastItemTitle((await getBookmark(elsewhere.parentId)).title)
              : undefined;

            // Recorded like every other change, so the manager's undo can take it back.
            const title = tab.title || t('popup_untitled');
            const { result: created } = await recordBookmarkWrites(
              { action: 'add', title },
              (writer) => writer.create({ parentId: folderId, title, url: tab.url || '' }),
            );
            // Shown right away; its event arrives later and finds it already there.
            await treeSync.applyChanges([{ type: 'created', node: created }]);

            const added = t('toast_bookmarkAddedDesc', [truncatedTitle, folderTitle]);
            return {
              success: true,
              message: otherFolderTitle
                ? `${added} ${t('qaPopup_secondCopyNote', otherFolderTitle)}`
                : added,
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
            const title = name.trim();
            const { result: created } = await recordBookmarkWrites(
              { action: 'add', title },
              (writer) => writer.create({ parentId, title }),
            );
            await treeSync.applyChanges([{ type: 'created', node: created }]);
            return {
              success: true,
              message: t('toast_folderCreatedDesc', [
                await quoteToastItemTitle(name.trim()),
                await quoteToastItemTitle(parentFolder.title),
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
          // The drop names a place in the browser's order: before the item now at targetIndex,
          // or the end of the folder past the last one.
          const siblings = await getBookmarkChildren(operation.targetParentId);
          const beforeId = siblings[operation.targetIndex]?.id ?? null;
          // Dropping an item onto its own position (e.g. just below itself) changes nothing.
          const staysInPlace =
            before.parentId === operation.targetParentId &&
            (beforeId === before.id ||
              (siblings[(before.index ?? 0) + 1]?.id ?? null) === beforeId);
          if (staysInPlace) return SILENT_RESULT;

          // Recorded, so the manager's undo can move it back. Always pass the parent: dropping
          // beside an item in another folder moves it there.
          await recordBookmarkWrites({ action: 'move', title: before.title }, (writer) =>
            writer.moveBefore(operation.sourceId, operation.targetParentId, beforeId),
          );
          const sourceItem = await getBookmark(operation.sourceId);
          await (sourceItem.parentId !== undefined && sourceItem.index !== undefined
            ? treeSync.applyChanges([
                {
                  type: 'moved',
                  id: sourceItem.id,
                  parentId: sourceItem.parentId,
                  index: sourceItem.index,
                },
              ])
            : treeSync.reload());
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

        const expanded = new Set(expandedFolders);
        return expanded.has(node.id) && areAllSubfoldersExpanded(originalNode, expanded);
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
