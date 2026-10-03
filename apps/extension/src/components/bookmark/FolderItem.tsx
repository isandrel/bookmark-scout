/**
 * FolderItem component.
 * Renders a folder of the popup tree with drag-and-drop, accordion, and action buttons. Shared
 * state and actions come from `PopupTreeProvider`.
 */

import { BookmarkPlus, ChevronsDown, ChevronsUp, Folder, FolderPlus, Trash2 } from 'lucide-react';
import type { BookmarkTreeNode } from '@/types';

/**
 * Props PopupPage still passes to each top-level folder. Without a provider around it, a folder
 * builds one from them; the drag props are superseded by the provider's own drag state.
 * @deprecated Render `PopupTreeProvider` once around the tree and pass only `node`.
 */
type LegacyFolderItemProps = PopupTreeProps & {
  instanceId?: symbol;
  isDragging?: boolean;
  creatingFolderId?: string | null;
  onDragStart?: (node: BookmarkTreeNode) => void;
  onDragEnd?: () => void;
};

type FolderItemProps =
  | { node: BookmarkTreeNode }
  | ({ node: BookmarkTreeNode } & LegacyFolderItemProps);

/**
 * A held Enter repeats keydown, and each repeat would activate the focused button again: after
 * a new folder is saved, focus returns here and the still-held key would reopen the input.
 */
function ignoreKeyRepeat(event: React.KeyboardEvent<HTMLButtonElement>) {
  if (event.repeat) event.preventDefault();
}

export function FolderItem(props: FolderItemProps) {
  const tree = useOptionalPopupTree();
  if (tree || !('folders' in props)) return <FolderRow node={props.node} />;
  const {
    node,
    isDragging: _isDragging,
    creatingFolderId: _creatingFolderId,
    onDragStart: _onDragStart,
    onDragEnd: _onDragEnd,
    ...treeProps
  } = props;
  return (
    <PopupTreeProvider {...treeProps}>
      <FolderRow node={node} />
    </PopupTreeProvider>
  );
}

/** The new-folder input shown in place of a temporary node. */
function NewFolderRow() {
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

function FolderRow({ node }: { node: BookmarkTreeNode }) {
  const {
    canModify,
    rowRef,
    draggingId,
    addingToFolderIds,
    areAllChildrenExpanded,
    onAddBookmark,
    onAddFolder,
    onDeleteFolder,
    onToggleExpandAllChildren,
  } = usePopupTree();

  if (node.isTemporary) return <NewFolderRow />;

  const canAddChildren = !isBookmarkTreeRoot(node) && !node.unmodifiable;
  // Count total items in folder (folders + bookmarks)
  const itemCount = node.children?.length ?? 0;
  const hasSubfolders = node.children?.some((child) => child.children !== undefined) ?? false;
  const allSubfoldersExpanded = hasSubfolders && areAllChildrenExpanded(node);
  const isAddingBookmark = addingToFolderIds.includes(node.id);
  const expandAllLabel = allSubfoldersExpanded
    ? t('popup_collapseAllSubfolders')
    : t('popup_expandAllSubfolders');

  return (
    <AccordionItem value={node.id} className="border-none accordion-item">
      {/* Actions sit beside the trigger, not inside it, so no button is nested in a button. */}
      <div className="group folder-item relative flex h-8 items-center rounded-md transition-colors duration-150 hover:bg-muted focus-within:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-ring">
        <div className="flex-1 min-w-0">
          <AccordionTrigger
            className="h-8 rounded-md px-2 py-1 hover:no-underline focus-visible:outline-none"
            data-folder-trigger={node.id}
            data-popup-tree-row="folder"
            data-can-save={canAddChildren || undefined}
            hideIndicator={itemCount === 0}
          >
            <div
              ref={rowRef(node, 'folder')}
              data-slot="drag-handle"
              className={cn(
                'flex items-center flex-1 min-w-0 cursor-grab active:cursor-grabbing relative',
                draggingId === node.id && 'dragging',
              )}
            >
              <Folder
                data-slot="folder-icon"
                className="mr-2 size-4 shrink-0 text-muted-foreground group-focus-within:text-primary"
              />
              {node.title.trim() ? (
                <HighlightedText
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
            </div>
          </AccordionTrigger>
        </div>
        {/*
          Overlays the row's end only while the row is hovered or holds focus, so it reserves no
          blank space. Only the buttons take pointer events; the gaps fall through to the trigger.
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
      {/* One indent step is the chevron slot plus its gap, so children start under the folder icon. */}
      <AccordionContent className="pl-5 py-0 accordion-content">
        {node.children?.map((child) =>
          child.children || child.isTemporary ? (
            <FolderRow key={child.id} node={child} />
          ) : (
            <BookmarkItem key={child.id} node={child} />
          ),
        )}
      </AccordionContent>
    </AccordionItem>
  );
}
