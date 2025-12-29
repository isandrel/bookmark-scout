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
import { Button } from '@/components/ui/button';
import { getFaviconUrl } from '@/services';
import type { BookmarkTreeNode, DragOperation } from '@/types';

interface BookmarkItemProps {
  node: BookmarkTreeNode;
  instanceId: symbol;
  isDragging: boolean;
  onDelete: (id: string) => void;
  onDragStart: (node: BookmarkTreeNode) => void;
  onDragEnd: () => void;
  onDrop: (operation: DragOperation) => void;
}

export function BookmarkItem({
  node,
  instanceId,
  isDragging,
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
      className={`group flex items-center justify-between h-8 py-1 px-2 hover:bg-accent rounded-md transition-all duration-150 hover:scale-[1.01] origin-left bookmark-item ${isDragging ? 'opacity-50' : ''}`}
    >
      <a
        ref={(el) => {
          elementRef.current = el;
          setupDragDrop(el);
        }}
        href={node.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center flex-1 min-w-0 cursor-grab active:cursor-grabbing"
      >
        <img src={getFaviconUrl(node.url ?? '')} alt="" className="w-4 h-4 mr-2 shrink-0 rounded-sm" />
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: Intentional for search highlighting */}
        <span className="truncate text-sm" dangerouslySetInnerHTML={{ __html: node.title }} />
      </a>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 ml-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
        onClick={() => onDelete(node.id)}
        title="Delete bookmark"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
