/**
 * Hook for bookmark drag-and-drop functionality.
 */

import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { getReorderDestinationIndex } from '@atlaskit/pragmatic-drag-and-drop-hitbox/util/get-reorder-destination-index';
import * as liveRegion from '@atlaskit/pragmatic-drag-and-drop-live-region';
import { useCallback, useEffect, useState } from 'react';
import type { BookmarkTreeNode, DragData, DragOperation } from '@/types';

interface UseBookmarkDragDropReturn {
  /** Currently dragged item */
  draggedItem: BookmarkTreeNode | null;
  /** Unique instance ID for this drag session */
  instanceId: symbol;
  /** Handle drag start */
  handleDragStart: (node: BookmarkTreeNode) => void;
  /** Handle drag end */
  handleDragEnd: () => void;
}

export function useBookmarkDragDrop(
  onDrop: (operation: DragOperation) => Promise<boolean>,
): UseBookmarkDragDropReturn {
  const [draggedItem, setDraggedItem] = useState<BookmarkTreeNode | null>(null);
  const [instanceId] = useState(() => Symbol('bookmark-drag-instance'));

  const handleDragStart = useCallback((node: BookmarkTreeNode) => {
    setDraggedItem(node);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedItem(null);
  }, []);

  // Setup drag and drop monitoring
  useEffect(() => {
    return combine(
      monitorForElements({
        canMonitor({ source }) {
          return source.data.instanceId === instanceId;
        },
        onDrop(args) {
          const { location, source } = args;
          if (!location.current.dropTargets.length) {
            return;
          }

          const sourceData = source.data as unknown as DragData;
          const sourceNode = sourceData.node;
          const target = location.current.dropTargets[0];
          const targetData = target.data as unknown as DragData;
          const targetNode = targetData.node;

          const closestEdge = extractClosestEdge(target.data);

          const targetIndex = getReorderDestinationIndex({
            startIndex: sourceNode.index || 0,
            indexOfTarget: targetNode.index || 0,
            closestEdgeOfTarget: closestEdge,
            axis: 'vertical',
          });

          const isDroppingIntoFolder = targetNode.children !== undefined;

          let operationType: DragOperation['type'];
          if (sourceData.type === 'folder') {
            operationType = isDroppingIntoFolder ? 'folder-move' : 'folder-reorder';
          } else {
            operationType = isDroppingIntoFolder ? 'bookmark-move' : 'bookmark-reorder';
          }

          const operation: DragOperation = {
            type: operationType,
            sourceId: sourceNode.id,
            sourceParentId: sourceNode.parentId || 'root',
            sourceIndex: sourceNode.index || 0,
            targetId: targetNode.id,
            targetParentId: targetNode.parentId || 'root',
            targetIndex,
          };

          onDrop(operation);
        },
      }),
    );
  }, [instanceId, onDrop]);

  // Cleanup live region on unmount
  useEffect(() => {
    return liveRegion.cleanup();
  }, []);

  return {
    draggedItem,
    instanceId,
    handleDragStart,
    handleDragEnd,
  };
}
