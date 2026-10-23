/**
 * Shared state and actions of the popup and side panel tree, so each `FolderRow` and
 * `BookmarkRow` takes only its row. The provider also owns the tree's drag and drop, and the
 * page host (`ActionPopupHost`) the rows' action buttons and menus act through.
 */
import { createContext, type ReactNode, useCallback, useContext, useMemo } from 'react';
import type { BookmarkTreeNode, DragOperation, FaviconDisplay } from '@/types';

export type PopupTreeProps = {
  /** The whole tree, to tell the browser's permanent folders from the rest. */
  folders: BookmarkTreeNode[];
  favicon: FaviconDisplay;
  /** Name typed into the new-folder input. */
  newFolderName: string;
  /** Folders the current page is being saved into; their add button is disabled meanwhile. */
  addingToFolderIds: readonly string[];
  onDrop: (operation: DragOperation) => void;
  onAddBookmark: (folderId: string) => void;
  onAddFolder: (folderId: string) => void;
  onDeleteFolder: (node: BookmarkTreeNode) => void;
  onDeleteBookmark: (node: BookmarkTreeNode) => void;
  onCreateFolder: () => void;
  onCancelCreateFolder: () => void;
  onNewFolderNameChange: (name: string) => void;
  onToggleExpandAllChildren: (node: BookmarkTreeNode) => void;
  /** Open folders, to tell whether every subfolder of a folder is open. */
  expandedIds: readonly string[];
  /** Opens bookmarks (asking first for many tabs). */
  onOpen: (urls: readonly string[], target: BookmarkOpenTarget) => void;
  /** Whether this browser lets the extension open private windows. */
  privateWindowsAllowed: boolean;
  /** Whether the tree shows the browser's order, so drops beside a row reorder (`tree-drop.ts`). */
  canReorder: boolean;
  /** Called with the dragged row's id when a drag starts, and null when it ends. */
  onDraggingChange?: (id: string | null) => void;
  /** Whether rows drag and take link drops (the Drag and Drop in the Tree setting). */
  dragAndDrop?: boolean;
  /** Links dropped from a web page on a folder row. */
  onLinksDrop?: (folder: BookmarkTreeNode, links: { url: string; title: string }[]) => void;
};

export type PopupTreeContextValue = Omit<
  PopupTreeProps,
  | 'onDrop'
  | 'folders'
  | 'canReorder'
  | 'onDraggingChange'
  | 'dragAndDrop'
  | 'onLinksDrop'
  | 'expandedIds'
  | 'onOpen'
  | 'privateWindowsAllowed'
> &
  TreeDnd & {
    /** Browsers reject moving or deleting permanent root folders and any change to managed nodes. */
    canModify: (node: BookmarkTreeNode) => boolean;
    /**
     * The node with `id` in the whole tree. While searching, the rows show only matches, but
     * "every subfolder open" is about all of a folder's subfolders.
     */
    fullNode: (id: string) => BookmarkTreeNode | undefined;
    /** What the rows' action buttons and menus act through. */
    actionHost: ActionPopupHost;
  };

const PopupTreeContext = createContext<PopupTreeContextValue | null>(null);

export function PopupTreeProvider({
  children,
  folders,
  onDrop,
  canReorder,
  onDraggingChange,
  dragAndDrop,
  onLinksDrop,
  expandedIds,
  onOpen,
  privateWindowsAllowed,
  ...actions
}: PopupTreeProps & { children: ReactNode }) {
  const canModify = useMemo(() => {
    const rootIds = getBookmarkRootIds(folders);
    return (node: BookmarkTreeNode) =>
      !node.unmodifiable && !isPermanentBookmarkFolder(node, rootIds);
  }, [folders]);
  // Bookmark rows always drag; folders only when they can be modified.
  const canMove = useCallback(
    (node: BookmarkTreeNode) => node.children === undefined || canModify(node),
    [canModify],
  );
  const dnd = useTreeDnd(onDrop, {
    canMove,
    canReorder,
    onDraggingChange,
    enabled: dragAndDrop,
    onLinksDrop,
  });
  const fullNode = useMemo(() => {
    const byId = new Map<string, BookmarkTreeNode>();
    const index = (nodes: readonly BookmarkTreeNode[]) => {
      for (const node of nodes) {
        byId.set(node.id, node);
        if (node.children) index(node.children);
      }
    };
    index(folders);
    return (id: string) => byId.get(id);
  }, [folders]);
  const { addingToFolderIds, onAddBookmark, onAddFolder, onDeleteBookmark, onDeleteFolder } =
    actions;
  const { onToggleExpandAllChildren } = actions;
  const actionHost = useMemo<ActionPopupHost>(() => {
    const expanded = new Set(expandedIds);
    const isFolder = (node: BookmarkTreeNode) => node.children !== undefined;
    const openableUrls = (node: BookmarkTreeNode) => {
      if (!isFolder(node)) {
        return !isSeparatorNode(node) && isOpenableBookmarkUrl(node.url) ? [node.url] : [];
      }
      // A folder opens the bookmarks directly in it, as the manager's Open all does.
      return (fullNode(node.id)?.children ?? node.children ?? []).flatMap((child) =>
        child.children === undefined && !isSeparatorNode(child) && isOpenableBookmarkUrl(child.url)
          ? [child.url]
          : [],
      );
    };
    return {
      canModify,
      canAddTo: (folder) => !isBookmarkTreeRoot(folder) && !folder.unmodifiable,
      hasSubfolders: (folder) => folder.children?.some(isFolder) ?? false,
      allSubfoldersExpanded: (folder) =>
        expanded.has(folder.id) &&
        (folder.children?.some(isFolder) ?? false) &&
        areAllSubfoldersExpanded(fullNode(folder.id) ?? folder, expanded),
      toggleSubfolders: onToggleExpandAllChildren,
      isSaving: (folder) => addingToFolderIds.includes(folder.id),
      addBookmark: (folder) => onAddBookmark(folder.id),
      addFolder: (folder) => onAddFolder(folder.id),
      requestDeletion: (node) => (isFolder(node) ? onDeleteFolder(node) : onDeleteBookmark(node)),
      openableUrls,
      open: (node, target) => onOpen(openableUrls(node), target),
      privateWindowsAllowed,
    };
  }, [
    addingToFolderIds,
    canModify,
    expandedIds,
    fullNode,
    onAddBookmark,
    onAddFolder,
    onDeleteBookmark,
    onDeleteFolder,
    onOpen,
    onToggleExpandAllChildren,
    privateWindowsAllowed,
  ]);

  return (
    <PopupTreeContext.Provider value={{ ...actions, ...dnd, canModify, fullNode, actionHost }}>
      {children}
    </PopupTreeContext.Provider>
  );
}

export function usePopupTree(): PopupTreeContextValue {
  const tree = useContext(PopupTreeContext);
  if (!tree) throw new Error('usePopupTree must be used inside a PopupTreeProvider');
  return tree;
}
