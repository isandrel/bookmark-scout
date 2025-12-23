/**
 * Hook for filtering bookmarks based on search query.
 */

import { useCallback, useEffect, useState } from 'react';
import type { BookmarkTreeNode } from '@/types';
import { useDebounce } from './use-debounce';

interface UseBookmarkFilterReturn {
  /** Current search query */
  query: string;
  /** Set search query */
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  /** Debounced search query */
  debouncedQuery: string;
  /** Filtered bookmark folders */
  filteredFolders: BookmarkTreeNode[];
  /** Whether to force expand all folders */
  forceExpandAll: boolean;
  /** Set force expand all */
  setForceExpandAll: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useBookmarkFilter(
  folders: BookmarkTreeNode[],
  onExpandedChange: (ids: string[]) => void,
): UseBookmarkFilterReturn {
  const [query, setQuery] = useState('');
  const [filteredFolders, setFilteredFolders] = useState<BookmarkTreeNode[]>([]);
  const [forceExpandAll, setForceExpandAll] = useState(false);
  const debouncedQuery = useDebounce(query, 300);

  const handleForceExpandAll = useCallback((nodes: BookmarkTreeNode[]): BookmarkTreeNode[] => {
    const deepCopy = (node: BookmarkTreeNode): BookmarkTreeNode => ({
      ...node,
      children: node.children ? node.children.map(deepCopy) : undefined,
      isOpen: true,
    });
    return nodes.map(deepCopy);
  }, []);

  const filterFolders = useCallback(
    (nodes: BookmarkTreeNode[], searchQuery: string): BookmarkTreeNode[] => {
      if (!searchQuery) return nodes;

      if (forceExpandAll) {
        return handleForceExpandAll(nodes);
      }

      const filtered: BookmarkTreeNode[] = [];
      nodes.forEach((node) => {
        const nodeMatches = node.title.toLowerCase().includes(searchQuery.toLowerCase());

        if (node.children) {
          const filteredChildren = filterFolders(node.children, searchQuery);

          if (nodeMatches || filteredChildren.length > 0) {
            let childrenToInclude;
            if (nodeMatches) {
              childrenToInclude = node.children.map((child) => {
                if (
                  child.children &&
                  child.title.toLowerCase().includes(searchQuery.toLowerCase())
                ) {
                  return {
                    ...child,
                    title: child.title.replace(new RegExp(`(${searchQuery})`, 'gi'), '<b>$1</b>'),
                    isOpen: true,
                  };
                }
                return child;
              });
            } else {
              childrenToInclude = filteredChildren;
            }

            const shouldExpand =
              !nodeMatches ||
              (nodeMatches &&
                node.children?.some(
                  (child) =>
                    child.children && child.title.toLowerCase().includes(searchQuery.toLowerCase()),
                ));

            filtered.push({
              ...node,
              title: nodeMatches
                ? node.title.replace(new RegExp(`(${searchQuery})`, 'gi'), '<b>$1</b>')
                : node.title,
              children: childrenToInclude,
              isOpen: shouldExpand,
            });
          }
        } else if (nodeMatches) {
          filtered.push({
            ...node,
            title: node.title.replace(new RegExp(`(${searchQuery})`, 'gi'), '<b>$1</b>'),
          });
        }
      });
      return filtered;
    },
    [forceExpandAll, handleForceExpandAll],
  );

  useEffect(() => {
    if (debouncedQuery) {
      const filtered = filterFolders(folders, debouncedQuery);
      setFilteredFolders(filtered);

      const getExpandableFolderIds = (nodes: BookmarkTreeNode[]): string[] => {
        return nodes.reduce((acc: string[], node) => {
          if (node.children && (node.isOpen || forceExpandAll)) {
            return [...acc, node.id, ...getExpandableFolderIds(node.children)];
          }
          return acc;
        }, []);
      };

      onExpandedChange(getExpandableFolderIds(filtered));
    } else {
      setFilteredFolders(folders);
      onExpandedChange([]);
      setForceExpandAll(false);
    }
  }, [debouncedQuery, folders, filterFolders, forceExpandAll, onExpandedChange]);

  return {
    query,
    setQuery,
    debouncedQuery,
    filteredFolders,
    forceExpandAll,
    setForceExpandAll,
  };
}
