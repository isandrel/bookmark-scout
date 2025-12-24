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
          element.classList.add('drop-target');

          const existingIndicator = element.parentElement?.querySelector('.drop-indicator');
          if (existingIndicator) existingIndicator.remove();

          const indicator = document.createElement('div');
          indicator.className = 'drop-indicator';

          const rect = element.getBoundingClientRect();
          const mouseY = location.current.input.clientY;
          const relativeY = mouseY - rect.top;
          const closestEdge = relativeY < rect.height / 2 ? 'top' : 'bottom';

          if (closestEdge === 'top') {
            indicator.style.top = '-1px';
          } else {
            indicator.style.bottom = '-1px';
          }

          element.dataset.closestEdge = closestEdge;
          element.parentElement?.appendChild(indicator);
        }
      },
      onDragLeave: () => {
        element.classList.remove('drop-target');
        element.parentElement?.querySelector('.drop-indicator')?.remove();
        delete element.dataset.closestEdge;
      },
      onDrop: ({ source }) => {
        const sourceData = source.data as { type: 'folder' | 'bookmark'; node: BookmarkTreeNode };
        if (sourceData.node.id !== node.id) {
          const closestEdge = element.dataset.closestEdge as 'top' | 'bottom' | undefined;
          const isDroppingIntoFolder = node.children !== undefined;

          let operationType: DragOperation['type'];
          if (sourceData.type === 'folder') {
            operationType = isDroppingIntoFolder ? 'folder-move' : 'folder-reorder';
          } else {
            operationType = isDroppingIntoFolder ? 'bookmark-move' : 'bookmark-reorder';
          }

          onDrop({
            type: operationType,
            sourceId: sourceData.node.id,
            sourceParentId: sourceData.node.parentId || 'root',
            sourceIndex: sourceData.node.index || 0,
            targetId: node.id,
            targetParentId: node.parentId || 'root',
            targetIndex: closestEdge === 'bottom' ? (node.index || 0) + 1 : node.index || 0,
          });
        }

        element.classList.remove('drop-target');
        element.parentElement?.querySelector('.drop-indicator')?.remove();
        delete element.dataset.closestEdge;
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

  return (
    <AccordionItem
      key={node.id}
      value={node.id}
      className={`border-none accordion-item ${isDragging ? 'opacity-50' : ''}`}
    >
      <AccordionTrigger className="hover:no-underline py-1 px-2 hover:bg-accent rounded-md h-8 folder-item">
        <div className="flex items-center w-full">
          <div
            ref={(el) => {
              elementRef.current = el;
              setupDragDrop(el);
            }}
            className="flex items-center flex-1 min-w-0 cursor-grab active:cursor-grabbing"
          >
            <Folder className="w-4 h-4 mr-2 shrink-0 text-muted-foreground" />
            {/* biome-ignore lint/security/noDangerouslySetInnerHtml: Intentional for search highlighting */}
            <span className="truncate text-sm" dangerouslySetInnerHTML={{ __html: node.title }} />
          </div>
          <div className="flex items-center gap-1 ml-2 shrink-0 action-button">
            {hasChildren && (
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={(e) => onToggleExpandAllChildren(node, e)}
                title={isAllChildrenExpanded ? 'Collapse all subfolders' : 'Expand all subfolders'}
              >
                {isAllChildrenExpanded ? (
                  <ChevronsUp className="h-3 w-3" />
                ) : (
                  <ChevronsDown className="h-3 w-3" />
                )}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={(e) => {
                e.stopPropagation();
                onAddBookmark(node.id);
              }}
            >
              <BookmarkPlus className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={(e) => {
                e.stopPropagation();
                onAddFolder(node.id);
              }}
            >
              <FolderPlus className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-destructive hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteFolder(node.id);
              }}
            >
              <Trash2 className="h-3 w-3" />
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
