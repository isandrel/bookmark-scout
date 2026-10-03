/**
 * Shared state and actions of the popup and side panel tree, so each `FolderItem` and
 * `BookmarkItem` takes only its node. The provider also owns the tree's drag and drop.
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
  areAllChildrenExpanded: (node: BookmarkTreeNode) => boolean;
  onDrop: (operation: DragOperation) => void;
  onAddBookmark: (folderId: string) => void;
  onAddFolder: (folderId: string) => void;
  onDeleteFolder: (node: BookmarkTreeNode) => void;
  onDeleteBookmark: (node: BookmarkTreeNode) => void;
  onCreateFolder: () => void;
  onCancelCreateFolder: () => void;
  onNewFolderNameChange: (name: string) => void;
  onToggleExpandAllChildren: (node: BookmarkTreeNode, event: React.MouseEvent) => void;
};

export type PopupTreeContextValue = Omit<PopupTreeProps, 'onDrop' | 'folders'> &
  TreeDnd & {
    /** Browsers reject moving or deleting permanent root folders and any change to managed nodes. */
    canModify: (node: BookmarkTreeNode) => boolean;
  };

const PopupTreeContext = createContext<PopupTreeContextValue | null>(null);

export function PopupTreeProvider({
  children,
  folders,
  onDrop,
  instanceId,
  ...actions
}: PopupTreeProps & {
  children: ReactNode;
  /** Shares one drag scope between several providers; see `useTreeDnd`. */
  instanceId?: symbol;
}) {
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
  const dnd = useTreeDnd(onDrop, { instanceId, canMove });

  return (
    <PopupTreeContext.Provider value={{ ...actions, ...dnd, canModify }}>
      {children}
    </PopupTreeContext.Provider>
  );
}

/** The tree's context; null outside a `PopupTreeProvider`. */
export function useOptionalPopupTree(): PopupTreeContextValue | null {
  return useContext(PopupTreeContext);
}

export function usePopupTree(): PopupTreeContextValue {
  const tree = useOptionalPopupTree();
  if (!tree) throw new Error('usePopupTree must be used inside a PopupTreeProvider');
  return tree;
}
