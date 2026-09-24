/**
 * FolderTree - Recursive tree view for bookmark folders.
 * Built from the manager's bookmark list, so it follows every refresh (edits, deletes, and
 * changes made outside the page).
 */

import { ChevronDown, ChevronRight, Folder } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type FolderTreeProps = {
  items: Bookmark[];
  selectedFolderId: string | null;
  onFolderSelect: (folderId: string | null) => void;
};

type FolderItemProps = {
  node: ManagerFolderNode;
  level: number;
  selectedId: string | null;
  expandedIds: Set<string>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
};

/** Single folder row; the expand toggle and the folder button are siblings, not nested. */
function FolderItem({ node, level, selectedId, expandedIds, onSelect, onToggle }: FolderItemProps) {
  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedId === node.id;
  const hasChildren = node.children.length > 0;
  const title = node.title.trim() || t('bookmarks_untitled');

  return (
    <div>
      <div
        className={cn(
          'flex w-full items-center gap-1 rounded-md pr-2 text-sm transition-colors',
          isSelected ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted',
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggle(node.id)}
            className="rounded p-0.5 hover:bg-muted-foreground/20"
            aria-expanded={isExpanded}
            aria-label={t(
              isExpanded ? 'bookmarks_collapseFolder' : 'bookmarks_expandFolder',
              title,
            )}
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        ) : (
          <span className="w-[18px] shrink-0" />
        )}
        <button
          type="button"
          onClick={() => onSelect(node.id)}
          aria-current={isSelected ? 'page' : undefined}
          className="flex min-w-0 flex-1 items-center gap-1 py-1.5 text-left"
        >
          <Folder className="h-4 w-4 shrink-0" />
          <span className="truncate">{title}</span>
        </button>
      </div>

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

export function FolderTree({ items, selectedFolderId, onFolderSelect }: FolderTreeProps) {
  const tree = useMemo(() => buildManagerFolderTree(items), [items]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const hasAutoExpandedRef = useRef(false);

  // Expand the top-level folders once, when the tree first becomes available.
  useEffect(() => {
    if (hasAutoExpandedRef.current || tree.length === 0) return;
    hasAutoExpandedRef.current = true;
    setExpandedIds((prev) => new Set([...prev, ...tree.map((folder) => folder.id)]));
  }, [tree]);

  // Reveal the selected folder and its subfolders by expanding it and its ancestors.
  useEffect(() => {
    if (!selectedFolderId) return;
    const ancestors = getManagerFolderAncestors(items, selectedFolderId).map((folder) => folder.id);
    if (ancestors.length === 0) return;
    setExpandedIds((prev) =>
      ancestors.every((id) => prev.has(id)) ? prev : new Set([...prev, ...ancestors]),
    );
  }, [items, selectedFolderId]);

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

  return (
    <div className="py-2" data-testid="folder-tree">
      <button
        type="button"
        onClick={() => onFolderSelect(null)}
        aria-current={selectedFolderId === null ? 'page' : undefined}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors',
          selectedFolderId === null
            ? 'bg-primary text-primary-foreground'
            : 'text-foreground hover:bg-muted',
        )}
      >
        <Folder className="h-4 w-4" />
        <span>{t('bookmarks_root')}</span>
      </button>

      <div className="mt-1">
        {tree.map((node) => (
          <FolderItem
            key={node.id}
            node={node}
            level={0}
            selectedId={selectedFolderId}
            expandedIds={expandedIds}
            onSelect={onFolderSelect}
            onToggle={handleToggle}
          />
        ))}
      </div>
    </div>
  );
}
