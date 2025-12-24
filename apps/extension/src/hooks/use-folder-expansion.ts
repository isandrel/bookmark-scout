/**
 * Hook for managing folder expansion state.
 * Handles expand/collapse of bookmark folders.
 */

import { useCallback, useState } from 'react';
import type { BookmarkTreeNode } from '@/types';

interface UseFolderExpansionReturn {
  /** Currently expanded folder IDs */
  expandedFolders: string[];
  /** Set expanded folders */
  setExpandedFolders: React.Dispatch<React.SetStateAction<string[]>>;
  /** Get all child folder IDs recursively */
  getAllChildFolderIds: (node: BookmarkTreeNode) => string[];
  /** Get all folder IDs from a tree */
  getAllFolderIds: (nodes: BookmarkTreeNode[]) => string[];
  /** Toggle expand/collapse all children of a folder */
  toggleExpandAllChildren: (
    node: BookmarkTreeNode,
    folders: BookmarkTreeNode[],
    e: React.MouseEvent,
  ) => void;
  /** Check if all children are expanded */
  areAllChildrenExpanded: (node: BookmarkTreeNode, folders: BookmarkTreeNode[]) => boolean;
}

export function useFolderExpansion(): UseFolderExpansionReturn {
  const [expandedFolders, setExpandedFolders] = useState<string[]>([]);

  const getAllChildFolderIds = useCallback((node: BookmarkTreeNode): string[] => {
    if (!node.children) return [];

    return node.children.reduce((acc: string[], child) => {
      if (child.children) {
        return [...acc, child.id, ...getAllChildFolderIds(child)];
      }
      return acc;
    }, []);
  }, []);

  const getAllFolderIds = useCallback((nodes: BookmarkTreeNode[]): string[] => {
    return nodes.reduce((acc: string[], node) => {
      if (node.children) {
        return [...acc, node.id, ...getAllFolderIds(node.children)];
      }
      return acc;
    }, []);
  }, []);

  const findNodeInTree = useCallback(
    (nodes: BookmarkTreeNode[], targetId: string): BookmarkTreeNode | null => {
      for (const node of nodes) {
        if (node.id === targetId) return node;
        if (node.children) {
          const found = findNodeInTree(node.children, targetId);
          if (found) return found;
        }
      }
      return null;
    },
    [],
  );

  const toggleExpandAllChildren = useCallback(
    (node: BookmarkTreeNode, folders: BookmarkTreeNode[], e: React.MouseEvent) => {
      e.stopPropagation();

      const originalNode = findNodeInTree(folders, node.id);
      if (!originalNode) return;

      const childFolderIds = getAllChildFolderIds(originalNode);
      const isCurrentlyExpanded = childFolderIds.every((id) => expandedFolders.includes(id));

      if (isCurrentlyExpanded) {
        setExpandedFolders((prev) => prev.filter((id) => !childFolderIds.includes(id)));
      } else {
        setExpandedFolders((prev) => [...new Set([...prev, ...childFolderIds])]);
      }
    },
    [expandedFolders, getAllChildFolderIds, findNodeInTree],
  );

  const areAllChildrenExpanded = useCallback(
    (node: BookmarkTreeNode, folders: BookmarkTreeNode[]): boolean => {
      const originalNode = findNodeInTree(folders, node.id);
      if (!originalNode) return false;

      const childFolderIds = getAllChildFolderIds(originalNode);
      return (
        childFolderIds.length > 0 && childFolderIds.every((id) => expandedFolders.includes(id))
      );
    },
    [expandedFolders, getAllChildFolderIds, findNodeInTree],
  );

  return {
    expandedFolders,
    setExpandedFolders,
    getAllChildFolderIds,
    getAllFolderIds,
    toggleExpandAllChildren,
    areAllChildrenExpanded,
  };
}
