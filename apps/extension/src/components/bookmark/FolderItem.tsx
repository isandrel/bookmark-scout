/**
 * FolderItem component.
 * Renders a folder with drag-and-drop, accordion, and action buttons.
 */

import {
  draggable,
  dropTargetForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { BookmarkPlus, ChevronsDown, ChevronsUp, Folder, FolderPlus, Trash2 } from 'lucide-react';
import { useRef } from 'react';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import type { BookmarkTreeNode, DragOperation } from '@/types';
import { BookmarkItem } from './BookmarkItem';
import { NewFolderInput } from './NewFolderInput';

interface FolderItemProps {
  node: BookmarkTreeNode;
  instanceId: symbol;
  isDragging: boolean;
  isAllChildrenExpanded: boolean;
  creatingFolderId: string | null;
  newFolderName: string;
  folders: BookmarkTreeNode[];
  onDragStart: (node: BookmarkTreeNode) => void;
  onDragEnd: () => void;
  onDrop: (operation: DragOperation) => void;
  onAddBookmark: (folderId: string) => void;
  onAddFolder: (folderId: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onDeleteBookmark: (bookmarkId: string) => void;
  onCreateFolder: () => void;
  onCancelCreateFolder: () => void;
  onNewFolderNameChange: (name: string) => void;
  onToggleExpandAllChildren: (node: BookmarkTreeNode, e: React.MouseEvent) => void;
}

export function FolderItem({
  node,
  instanceId,
  isDragging,
  isAllChildrenExpanded,
  creatingFolderId,
  newFolderName,
  folders,
  onDragStart,
  onDragEnd,
  onDrop,
  onAddBookmark,
  onAddFolder,
  onDeleteFolder,
  onDeleteBookmark,
  onCreateFolder,
  onCancelCreateFolder,
  onNewFolderNameChange,
  onToggleExpandAllChildren,
}: FolderItemProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const hasChildren = node.children && node.children.length > 0;

  // Handle temporary folder (new folder being created)
  if (node.isTemporary) {
    return (
      <NewFolderInput
        value={newFolderName}
        onChange={onNewFolderNameChange}
        onSubmit={onCreateFolder}
        onCancel={onCancelCreateFolder}
      />
    );
  }

  const setupDragDrop = (element: HTMLDivElement | null) => {
    if (!element) return;

    const cleanup = draggable({
      element,
      onDragStart: () => {
        onDragStart(node);
        element.classList.add('dragging');
      },
      onDrag: () => {
        onDragEnd();
        element.classList.remove('dragging');
      },
      getInitialData: () => ({
        type: 'folder',
        node,
        instanceId,
      }),
    });

    const dropTargetCleanup = dropTargetForElements({
      element,
      onDrag: ({ source, location }) => {
        const sourceData = source.data as { node: BookmarkTreeNode };
        if (sourceData.node.id !== node.id) {
          const existingIndicator = element.querySelector('.drop-indicator');
          if (existingIndicator) existingIndicator.remove();

          const rect = element.getBoundingClientRect();
          const mouseY = location.current.input.clientY;
          const relativeY = mouseY - rect.top;
          const percentY = relativeY / rect.height;

          // 3-zone detection: top 25% | center 50% | bottom 25%
          let dropZone: 'top' | 'center' | 'bottom';
          if (percentY < 0.25) {
            dropZone = 'top';
          } else if (percentY > 0.75) {
            dropZone = 'bottom';
          } else {
            dropZone = 'center';
          }

          element.dataset.dropZone = dropZone;

          if (dropZone === 'center') {
            // Highlight folder for drop-INTO
            element.classList.add('drop-target');
            element.classList.add('drop-into-folder');
          } else {
            // Show indicator line for reorder
            element.classList.add('drop-target');
            element.classList.remove('drop-into-folder');
            
            const indicator = document.createElement('div');
            indicator.className = 'drop-indicator';
            if (dropZone === 'top') {
              indicator.style.top = '-1px';
            } else {
              indicator.style.bottom = '-1px';
            }
            element.appendChild(indicator);
          }
        }
      },
      onDragLeave: () => {
        element.classList.remove('drop-target');
        element.classList.remove('drop-into-folder');
        element.querySelector('.drop-indicator')?.remove();
        delete element.dataset.dropZone;
      },
      onDrop: ({ source }) => {
        const sourceData = source.data as { type: 'folder' | 'bookmark'; node: BookmarkTreeNode };
        if (sourceData.node.id !== node.id) {
          const dropZone = element.dataset.dropZone as 'top' | 'center' | 'bottom' | undefined;
          const isFolder = node.children !== undefined;

          // Determine if we're dropping INTO the folder (center zone) or beside it (edge zones)
          const isDroppingIntoFolder = isFolder && dropZone === 'center';

          let operationType: DragOperation['type'];
          let targetParentId: string;
          let targetIndex: number;

          if (isDroppingIntoFolder) {
            // Dropping INTO the folder - item becomes child of this folder
            operationType = sourceData.type === 'folder' ? 'folder-move' : 'bookmark-move';
            targetParentId = node.id; // The folder we're dropping into
            targetIndex = node.children?.length ?? 0; // Append to end of folder
          } else if (dropZone === 'top' || dropZone === 'bottom') {
            // Dropping beside the folder (reorder within same parent)
            operationType = sourceData.type === 'folder' ? 'folder-reorder' : 'bookmark-reorder';
            targetParentId = node.parentId || 'root';
            targetIndex = dropZone === 'bottom' ? (node.index || 0) + 1 : node.index || 0;
          } else {
            // Fallback: treat as move into folder if it's a folder
            operationType = sourceData.type === 'folder' ? 'folder-move' : 'bookmark-move';
            targetParentId = isFolder ? node.id : (node.parentId || 'root');
            targetIndex = isFolder ? (node.children?.length ?? 0) : (node.index || 0);
          }

          onDrop({
            type: operationType,
            sourceId: sourceData.node.id,
            sourceParentId: sourceData.node.parentId || 'root',
            sourceIndex: sourceData.node.index || 0,
            targetId: node.id,
            targetParentId,
            targetIndex,
          });
        }

        element.classList.remove('drop-target');
        element.classList.remove('drop-into-folder');
        element.querySelector('.drop-indicator')?.remove();
        delete element.dataset.dropZone;
      },
      getData: () => ({
        type: 'folder',
        node,
        instanceId,
      }),
    });

    return () => {
      cleanup();
      dropTargetCleanup();
    };
  };

  // Count total items in folder (folders + bookmarks)
  const itemCount = node.children?.length ?? 0;

  return (
    <AccordionItem
      key={node.id}
      value={node.id}
      className={`border-none accordion-item ${isDragging ? 'opacity-50' : ''}`}
    >
      <AccordionTrigger className="group hover:no-underline py-1 px-2 hover:bg-accent rounded-md h-8 folder-item transition-all duration-150 hover:scale-[1.01] origin-left">
        <div className="flex items-center w-full">
          <div
            ref={(el) => {
              elementRef.current = el;
              setupDragDrop(el);
            }}
            className="flex items-center flex-1 min-w-0 cursor-grab active:cursor-grabbing relative"
          >
            <Folder className="w-4 h-4 mr-2 shrink-0 text-amber-500 dark:text-amber-400" />
            {/* biome-ignore lint/security/noDangerouslySetInnerHtml: Intentional for search highlighting */}
            <span className="truncate text-sm" title={node.title.replace(/<[^>]*>/g, '')} dangerouslySetInnerHTML={{ __html: node.title }} />
            {itemCount > 0 && (
              <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                ({itemCount})
              </span>
            )}
          </div>
          <div className="flex items-center gap-0.5 ml-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            {hasChildren && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={(e) => onToggleExpandAllChildren(node, e)}
                title={isAllChildrenExpanded ? 'Collapse all subfolders' : 'Expand all subfolders'}
              >
                {isAllChildrenExpanded ? (
                  <ChevronsUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronsDown className="h-3.5 w-3.5" />
                )}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                onAddBookmark(node.id);
              }}
              title="Add current page"
            >
              <BookmarkPlus className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                onAddFolder(node.id);
              }}
              title="Add folder"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteFolder(node.id);
              }}
              title="Delete folder"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="pl-6 py-0 accordion-content">
        {node.children?.map((child) =>
          child.isTemporary ? (
            <NewFolderInput
              key={child.id}
              value={newFolderName}
              onChange={onNewFolderNameChange}
              onSubmit={onCreateFolder}
              onCancel={onCancelCreateFolder}
            />
          ) : child.children ? (
            <FolderItem
              key={child.id}
              node={child}
              instanceId={instanceId}
              isDragging={false}
              isAllChildrenExpanded={false}
              creatingFolderId={creatingFolderId}
              newFolderName={newFolderName}
              folders={folders}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDrop={onDrop}
              onAddBookmark={onAddBookmark}
              onAddFolder={onAddFolder}
              onDeleteFolder={onDeleteFolder}
              onDeleteBookmark={onDeleteBookmark}
              onCreateFolder={onCreateFolder}
              onCancelCreateFolder={onCancelCreateFolder}
              onNewFolderNameChange={onNewFolderNameChange}
              onToggleExpandAllChildren={onToggleExpandAllChildren}
            />
          ) : (
            <BookmarkItem
              key={child.id}
              node={child}
              instanceId={instanceId}
              isDragging={false}
              onDelete={onDeleteBookmark}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDrop={onDrop}
            />
          ),
        )}
      </AccordionContent>
    </AccordionItem>
  );
}
