/**
 * A folder row of the popup tree, with drag and drop and its action buttons (`PopupRowButtons`).
 * Its children are separate rows of `PopupTree`; shared state and actions come from
 * `PopupTreeProvider`.
 */

import { ChevronRight, Folder } from 'lucide-react';

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
export function FolderRow({ row, onToggle }: { row: PopupTreeRow; onToggle: () => void }) {
  const { rowRef, draggingId, actionHost } = usePopupTree();
  const { node } = row;

  const canAddChildren = actionHost.canAddTo(node);
  // Count total items in folder (folders + bookmarks)
  const itemCount = node.children?.length ?? 0;

  return (
    // Actions sit beside the row, not inside it, so no button is nested in the tree item.
    <div className="group folder-item relative flex h-(--popup-tree-row) items-center rounded-md transition-colors duration-150 hover:bg-muted focus-within:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-ring">
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
        className="group/trigger flex h-(--popup-tree-row) min-w-0 flex-1 cursor-pointer items-center gap-1 rounded-md px-2 py-(--popup-tree-row-pad) text-sm font-medium focus-visible:outline-none"
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
        <PopupRowButtons kind="folder" node={node} />
      </div>
    </div>
  );
}
