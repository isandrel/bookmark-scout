/**
 * BookmarkItem component.
 * Renders a single bookmark with drag-and-drop and delete functionality.
 */

import {
  draggable,
  dropTargetForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { Trash2 } from 'lucide-react';
import { useRef } from 'react';
import type { BookmarkTreeNode, DragOperation, FaviconDisplay } from '@/types';

interface BookmarkItemProps {
  node: BookmarkTreeNode;
  instanceId: symbol;
  isDragging: boolean;
  favicon: FaviconDisplay;
  onDelete: (node: BookmarkTreeNode) => void;
  onDragStart: (node: BookmarkTreeNode) => void;
  onDragEnd: () => void;
  onDrop: (operation: DragOperation) => void;
}

export function BookmarkItem({
  node,
  instanceId,
  isDragging,
  favicon,
  onDelete,
  onDragStart,
  onDragEnd,
  onDrop,
}: BookmarkItemProps) {
  const elementRef = useRef<HTMLAnchorElement>(null);

  const setupDragDrop = (element: HTMLAnchorElement | null) => {
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
        type: 'bookmark',
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

          element.parentElement?.appendChild(indicator);
        }
      },
      onDragLeave: () => {
        element.classList.remove('drop-target');
        element.parentElement?.querySelector('.drop-indicator')?.remove();
      },
      onDrop: ({ source, location }) => {
        const sourceData = source.data as { type: 'folder' | 'bookmark'; node: BookmarkTreeNode };
        if (sourceData.node.id !== node.id) {
          // Use the drop position itself: onDrag may not have fired for a quick drop.
          const rect = element.getBoundingClientRect();
          const closestEdge =
            location.current.input.clientY - rect.top < rect.height / 2 ? 'top' : 'bottom';
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
      },
      getData: () => ({
        type: 'bookmark',
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
    <div
      className={`group bookmark-item relative flex h-8 items-center rounded-md px-2 py-1 transition-colors duration-150 hover:bg-muted focus-within:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-ring ${isDragging ? 'opacity-50' : ''}`}
    >
      <a
        ref={(el) => {
          elementRef.current = el;
          setupDragDrop(el);
        }}
        href={node.url}
        data-popup-tree-row="bookmark"
        target="_blank"
        rel="noopener noreferrer"
        data-slot="drag-handle"
        className="flex min-w-0 flex-1 cursor-grab items-center focus-visible:outline-none active:cursor-grabbing"
      >
        {/* Empty chevron slot, so the icon and title line up with folders at the same depth. */}
        <span aria-hidden="true" data-slot="tree-indent" className="mr-1 size-4 shrink-0" />
        {favicon.show && (
          <SiteIcon
            url={node.url ?? ''}
            size={favicon.size}
            className="mr-2 shrink-0 rounded-sm bookmark-favicon"
          />
        )}
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
      </a>
      {/* Overlays the row's end only while hovered or focused, like the folder actions. */}
      <div
        data-slot="bookmark-actions"
        className="pointer-events-none absolute inset-y-0.5 right-0.5 flex items-center rounded-r-sm bg-muted px-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:bg-accent group-focus-within:opacity-100"
      >
        <Button
          variant="ghost"
          size="icon-xs"
          className="pointer-events-auto text-destructive-text hover:bg-destructive-wash hover:text-destructive-text"
          onClick={() => onDelete(node)}
          title={t('popup_deleteBookmark')}
          aria-label={t('popup_deleteBookmark')}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
