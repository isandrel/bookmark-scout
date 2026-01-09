/**
 * FolderTree - Recursive tree view for bookmark folders.
 * Displays expandable folder hierarchy in sidebar.
 */

import { ChevronDown, ChevronRight, Folder } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { t } from '@/hooks/use-i18n';

interface FolderNode {
  id: string;
  title: string;
  children: FolderNode[];
}

interface FolderTreeProps {
  selectedFolderId: string | null;
  onFolderSelect: (folderId: string | null) => void;
}

interface FolderItemProps {
  node: FolderNode;
  level: number;
  selectedId: string | null;
  expandedIds: Set<string>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}

/**
 * Single folder item with expand/collapse functionality.
 */
function FolderItem({
  node,
  level,
  selectedId,
  expandedIds,
  onSelect,
  onToggle,
}: FolderItemProps) {
  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedId === node.id;
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => onSelect(node.id)}
        className={cn(
          'flex items-center gap-1 w-full px-2 py-1.5 text-sm rounded-md transition-colors text-left',
          isSelected
            ? 'bg-primary text-primary-foreground'
            : 'hover:bg-muted text-foreground'
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
            className="p-0.5 hover:bg-muted-foreground/20 rounded"
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <Folder className="h-4 w-4 shrink-0" />
        <span className="truncate">{node.title || t('bookmarks_untitled')}</span>
      </button>

      {isExpanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <FolderItem
              key={child.id}
              node={child}
              level={level + 1}
              selectedId={selectedId}
              expandedIds={expandedIds}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Builds folder tree from Chrome bookmarks API.
 */
async function buildFolderTree(): Promise<FolderNode[]> {
  if (!chrome?.bookmarks) return [];

  return new Promise((resolve) => {
    chrome.bookmarks.getTree((nodes) => {
      if (chrome.runtime.lastError) {
        resolve([]);
        return;
      }

      const processNode = (
        node: chrome.bookmarks.BookmarkTreeNode
      ): FolderNode | null => {
        // Only include folders (nodes with children array)
        if (!node.children) return null;

        const children = node.children
          .map(processNode)
          .filter((n): n is FolderNode => n !== null);

        return {
          id: node.id,
          title: node.title,
          children,
        };
      };

      // Get children of root node (id "0")
      const rootChildren = nodes[0]?.children || [];
      const tree = rootChildren
        .map(processNode)
        .filter((n): n is FolderNode => n !== null);

      resolve(tree);
    });
  });
}

export function FolderTree({ selectedFolderId, onFolderSelect }: FolderTreeProps) {
  const [tree, setTree] = useState<FolderNode[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  // Load folder tree on mount
  useEffect(() => {
    const loadTree = async () => {
      setIsLoading(true);
      const folders = await buildFolderTree();
      setTree(folders);

      // Auto-expand top-level folders
      const topLevelIds = new Set(folders.map((f) => f.id));
      setExpandedIds(topLevelIds);
      setIsLoading(false);
    };

    loadTree();
  }, []);

  // Auto-expand ancestors when selecting a folder
  useEffect(() => {
    if (!selectedFolderId || tree.length === 0) return;

    const findAncestors = (
      nodes: FolderNode[],
      targetId: string,
      ancestors: string[] = []
    ): string[] | null => {
      for (const node of nodes) {
        if (node.id === targetId) {
          return ancestors;
        }
        if (node.children.length > 0) {
          const found = findAncestors(node.children, targetId, [
            ...ancestors,
            node.id,
          ]);
          if (found) return found;
        }
      }
      return null;
    };

    const ancestors = findAncestors(tree, selectedFolderId);
    if (ancestors && ancestors.length > 0) {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        for (const id of ancestors) {
          next.add(id);
        }
        return next;
      });
    }
  }, [selectedFolderId, tree]);

  const handleToggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelect = useCallback(
    (id: string) => {
      onFolderSelect(id);
    },
    [onFolderSelect]
  );

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        {t('bookmarks_loading')}
      </div>
    );
  }

  return (
    <div className="py-2">
      {/* All Bookmarks root option */}
      <button
        type="button"
        onClick={() => onFolderSelect(null)}
        className={cn(
          'flex items-center gap-2 w-full px-3 py-1.5 text-sm rounded-md transition-colors text-left',
          selectedFolderId === null
            ? 'bg-primary text-primary-foreground'
            : 'hover:bg-muted text-foreground'
        )}
      >
        <Folder className="h-4 w-4" />
        <span>{t('bookmarks_root')}</span>
      </button>

      {/* Folder tree */}
      <div className="mt-1">
        {tree.map((node) => (
          <FolderItem
            key={node.id}
            node={node}
            level={0}
            selectedId={selectedFolderId}
            expandedIds={expandedIds}
            onSelect={handleSelect}
            onToggle={handleToggle}
          />
        ))}
      </div>
    </div>
  );
}
