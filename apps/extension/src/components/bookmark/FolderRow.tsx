/**
 * A folder row of the popup tree, with drag and drop and its action buttons. Its children are
 * separate rows of `PopupTree`; shared state and actions come from `PopupTreeProvider`.
 */

import {
  BookmarkPlus,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  Folder,
  FolderPlus,
  Trash2,
} from 'lucide-react';

/**
 * A held Enter repeats keydown, and each repeat would activate the focused button again: after
 * a new folder is saved, focus returns here and the still-held key would reopen the input.
 */
function ignoreKeyRepeat(event: React.KeyboardEvent<HTMLButtonElement>) {
  if (event.repeat) event.preventDefault();
}

/** The new-folder input shown in place of a temporary node. */
export function NewFolderRow() {
  const { newFolderName, onNewFolderNameChange, onCreateFolder, onCancelCreateFolder } =
    usePopupTree();
  return (
    <NewFolderInput
      value={newFolderName}
      onChange={onNewFolderNameChange}
      onSubmit={onCreateFolder}
      onCancel={onCancelCreateFolder}
    />
  );
}

/** One folder row; render it inside a `PopupTreeProvider`. */
export function FolderRow({
  row,
  expandedIds,
  onToggle,
}: {
  row: PopupTreeRow;
  /** Open folders, to tell whether every subfolder is open. */
  expandedIds: ReadonlySet<string>;
  onToggle: () => void;
}) {
  const {
    canModify,
    rowRef,
    draggingId,
    addingToFolderIds,
    onAddBookmark,
    onAddFolder,
    onDeleteFolder,
    onToggleExpandAllChildren,
    fullNode,
  } = usePopupTree();
  const { node } = row;

  const canAddChildren = !isBookmarkTreeRoot(node) && !node.unmodifiable;
  // Count total items in folder (folders + bookmarks)
  const itemCount = node.children?.length ?? 0;
  const hasSubfolders = node.children?.some((child) => child.children !== undefined) ?? false;
  const allSubfoldersExpanded =
    hasSubfolders && row.expanded && areAllSubfoldersExpanded(fullNode(node.id) ?? node, expandedIds);
  const isAddingBookmark = addingToFolderIds.includes(node.id);
  const expandAllLabel = allSubfoldersExpanded
    ? t('popup_collapseAllSubfolders')
    : t('popup_expandAllSubfolders');

  return (
    // Actions sit beside the row, not inside it, so no button is nested in the tree item.
    <div className="group folder-item relative flex h-8 items-center rounded-md transition-colors duration-150 hover:bg-muted focus-within:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-ring">
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: the tree's key handler opens, closes, and saves (usePopupTreeKeys). */}
      <div
        role="treeitem"
        tabIndex={0}
        aria-level={row.level}
        aria-posinset={row.posInSet}
        aria-setsize={row.setSize}
        // An empty folder has nothing to expand, so it is a leaf.
        aria-expanded={itemCount > 0 ? row.expanded : undefined}
        data-panel-open={row.expanded || undefined}
        {...{
          [POPUP_TREE_ROW_ID_ATTRIBUTE]: node.id,
          [POPUP_TREE_FOLDER_ATTRIBUTE]: node.id,
          [POPUP_TREE_ROW_ATTRIBUTE]: 'folder',
          [POPUP_TREE_CAN_SAVE_ATTRIBUTE]: canAddChildren || undefined,
        }}
        // Long names are cut off, so hovering shows the whole name.
        title={getBookmarkDisplayTitle(node.title)}
        onClick={onToggle}
        className="group/trigger flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-sm font-medium focus-visible:outline-none"
      >
        <span
          data-slot="tree-indicator"
          aria-hidden="true"
          className={cn(
            'flex size-4 shrink-0 items-center justify-center transition-transform duration-200 group-data-[panel-open]/trigger:rotate-90 motion-reduce:transition-none',
            itemCount === 0 && 'invisible',
          )}
        >
          <ChevronRight data-slot="tree-chevron" className="size-4 text-muted-foreground" />
        </span>
        <span
          ref={rowRef(node, 'folder')}
          data-slot="drag-handle"
          className={cn(
            'relative flex min-w-0 flex-1 cursor-grab items-center active:cursor-grabbing',
            draggingId === node.id && 'dragging',
          )}
        >
          <Folder
            data-slot="folder-icon"
            className="mr-2 size-4 shrink-0 text-muted-foreground group-focus-within:text-primary"
          />
          {node.title.trim() ? (
            <HighlightedText
              showTitle={false}
              className="truncate text-sm"
              text={node.title}
              ranges={node.searchMatchRanges}
            />
          ) : (
            <span className="truncate text-sm italic text-muted-foreground">
              {getBookmarkDisplayTitle(node.title)}
            </span>
          )}
          {itemCount > 0 && (
            <span className="ml-2 shrink-0 text-xs text-muted-foreground tabular-nums">
              {t('popup_folderItemCount', String(itemCount))}
            </span>
          )}
        </span>
      </div>
      {/*
        Overlays the row's end only while the row is hovered or holds focus, so it reserves no
        blank space. Only the buttons take pointer events; the gaps fall through to the row.
      */}
      <div
        data-slot="folder-actions"
        className="pointer-events-none absolute inset-y-0.5 right-0.5 flex items-center gap-0.5 rounded-r-sm bg-muted px-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:bg-accent group-focus-within:opacity-100 [&>button]:pointer-events-auto [&>button]:hover:bg-card"
      >
        {hasSubfolders && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={(e) => onToggleExpandAllChildren(node, e)}
            title={expandAllLabel}
            aria-label={expandAllLabel}
            aria-pressed={allSubfoldersExpanded}
          >
            {allSubfoldersExpanded ? (
              <ChevronsUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronsDown className="h-3.5 w-3.5" />
            )}
          </Button>
        )}
        {canAddChildren && (
          <>
            <Button
              variant="ghost"
              size="icon-xs"
              className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
              onClick={(e) => {
                e.stopPropagation();
                if (!isAddingBookmark) onAddBookmark(node.id);
              }}
              onKeyDown={ignoreKeyRepeat}
              aria-disabled={isAddingBookmark || undefined}
              title={t('popup_addBookmark')}
              aria-label={t('popup_addBookmark')}
            >
              <BookmarkPlus className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={(e) => {
                e.stopPropagation();
                onAddFolder(node.id);
              }}
              onKeyDown={ignoreKeyRepeat}
              title={t('popup_addFolder')}
              aria-label={t('popup_addFolder')}
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
        {canModify(node) && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-destructive-text hover:bg-destructive-wash hover:text-destructive-text"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteFolder(node);
            }}
            title={t('popup_deleteFolder')}
            aria-label={t('popup_deleteFolder')}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
