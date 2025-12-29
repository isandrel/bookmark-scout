/**
 * PopupPage - Bookmark popup using Zustand store.
 *
 * Refactored from 1299 lines to ~140 lines using:
 * - Zustand for centralized state management
 * - Extracted components for UI
 * - Extracted services for Chrome API
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { BookmarkSearch, FolderItem } from '@/components/bookmark';
import { Accordion } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Toaster } from '@/components/ui/toaster';
import { useDebounce } from '@/hooks/use-debounce';
import { t } from '@/hooks/use-i18n';
import { useToast } from '@/hooks/use-toast';
import { useBookmarkStore } from '@/stores';
import type { BookmarkTreeNode, DragOperation } from '@/types';
import '@/styles/popup.scss';

function PopupPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [instanceId] = useState(() => Symbol('bookmark-drag-instance'));

  // Zustand store
  const {
    folders,
    filteredFolders,
    isLoading,
    error,
    query,
    expandedFolders,
    forceExpandAll,
    draggedItem,
    creatingFolderId,
    newFolderName,
    fetchFolders,
    setQuery,
    setDebouncedQuery,
    setExpandedFolders,
    setForceExpandAll,
    setDraggedItem,
    setCreatingFolderId,
    setNewFolderName,
    addBookmarkToFolder,
    createFolder,
    removeBookmark,
    removeFolder,
    handleDrop,
    toggleExpandAllChildren,
    areAllChildrenExpanded,
  } = useBookmarkStore();

  // Debounce search query
  const debouncedQuery = useDebounce(query, 300);
  useEffect(() => {
    setDebouncedQuery(debouncedQuery);
  }, [debouncedQuery, setDebouncedQuery]);

  // Fetch folders on mount
  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  // Toast wrapper for operations
  const withToast = useCallback(
    async (
      operation: () => Promise<{ success: boolean; message: string }>,
      successTitle: string,
      errorTitle: string,
    ) => {
      const result = await operation();
      toast({
        title: result.success ? `✓ ${successTitle}` : `× ${errorTitle}`,
        description: result.message,
        variant: result.success ? 'success' : 'destructive',
      });
      return result.success;
    },
    [toast],
  );

  // Add temporary folder to tree
  const addTemporaryFolder = useCallback(
    (nodes: BookmarkTreeNode[], parentId: string): BookmarkTreeNode[] => {
      return nodes.map((node) => {
        if (node.id === parentId) {
          return {
            ...node,
            children: [
              {
                id: 'temp-folder',
                parentId: node.id,
                title: t('newFolder'),
                isOpen: false,
                isTemporary: true,
                children: [],
              },
              ...(node.children || []),
            ],
          };
        }
        if (node.children) {
          return { ...node, children: addTemporaryFolder(node.children, parentId) };
        }
        return node;
      });
    },
    [],
  );

  const handleAddFolder = useCallback(
    (folderId: string) => {
      setCreatingFolderId(folderId);
      setNewFolderName('');
      setExpandedFolders((prev) => [...prev, folderId]);
    },
    [setCreatingFolderId, setNewFolderName, setExpandedFolders],
  );

  const handleCreateFolder = useCallback(async () => {
    if (!creatingFolderId || !newFolderName.trim()) {
      setCreatingFolderId(null);
      setNewFolderName('');
      return;
    }
    await withToast(
      () => createFolder(creatingFolderId, newFolderName),
      t('folderCreated'),
      t('errorCreatingFolder'),
    );
    setCreatingFolderId(null);
    setNewFolderName('');
  }, [
    creatingFolderId,
    newFolderName,
    createFolder,
    setCreatingFolderId,
    setNewFolderName,
    withToast,
  ]);

  const handleCancelCreateFolder = useCallback(() => {
    setCreatingFolderId(null);
    setNewFolderName('');
  }, [setCreatingFolderId, setNewFolderName]);

  const handleDropWithToast = useCallback(
    async (operation: DragOperation) => {
      await withToast(() => handleDrop(operation), t('itemMoved'), t('errorMovingItem'));
    },
    [handleDrop, withToast],
  );

  const displayFolders = creatingFolderId
    ? addTemporaryFolder(filteredFolders, creatingFolderId)
    : filteredFolders;

  if (error) {
    return (
      <div className="p-4">
        <div className="text-red-500 mb-4">
          {t('error')}: {error}
        </div>
        <Button onClick={() => window.location.reload()}>{t('retry')}</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full min-h-0 overflow-hidden">
      <div className="flex flex-col h-full overflow-hidden">
        <BookmarkSearch
          query={query}
          onQueryChange={setQuery}
          forceExpandAll={forceExpandAll}
          onToggleExpandAll={() => setForceExpandAll(!forceExpandAll)}
          inputRef={inputRef}
        />

        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {isLoading ? (
            <div className="p-3 space-y-1">
              <Skeleton className="h-7 w-full rounded-md" />
              <Skeleton className="h-7 w-11/12 ml-4 rounded-md" />
              <Skeleton className="h-7 w-10/12 ml-4 rounded-md" />
              <Skeleton className="h-7 w-full rounded-md" />
              <Skeleton className="h-7 w-9/12 ml-4 rounded-md" />
            </div>
          ) : displayFolders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <div className="text-4xl mb-3">🔍</div>
              <p className="text-sm text-muted-foreground">
                {query ? 'No bookmarks found' : 'No bookmarks yet'}
              </p>
              {query && (
                <p className="text-xs text-muted-foreground mt-1">
                  Try a different search term
                </p>
              )}
            </div>
          ) : (
            <div className="p-3">
              <Accordion
                type="multiple"
                value={expandedFolders}
                onValueChange={setExpandedFolders}
                className="w-full accordion-container"
              >
                {displayFolders.map((node) => (
                  <FolderItem
                    key={node.id}
                    node={node}
                    instanceId={instanceId}
                    isDragging={draggedItem?.id === node.id}
                    isAllChildrenExpanded={areAllChildrenExpanded(node)}
                    creatingFolderId={creatingFolderId}
                    newFolderName={newFolderName}
                    folders={folders}
                    onDragStart={setDraggedItem}
                    onDragEnd={() => setDraggedItem(null)}
                    onDrop={handleDropWithToast}
                    onAddBookmark={(id) =>
                      withToast(
                        () => addBookmarkToFolder(id),
                        t('bookmarkAdded'),
                        t('errorAddingBookmark'),
                      )
                    }
                    onAddFolder={handleAddFolder}
                    onDeleteFolder={(id) =>
                      withToast(
                        () => removeFolder(id),
                        t('folderDeleted'),
                        t('errorDeletingFolder'),
                      )
                    }
                    onDeleteBookmark={(id) =>
                      withToast(
                        () => removeBookmark(id),
                        t('bookmarkDeleted'),
                        t('errorDeletingBookmark'),
                      )
                    }
                    onCreateFolder={handleCreateFolder}
                    onCancelCreateFolder={handleCancelCreateFolder}
                    onNewFolderNameChange={setNewFolderName}
                    onToggleExpandAllChildren={toggleExpandAllChildren}
                  />
                ))}
              </Accordion>
            </div>
          )}
        </div>
      </div>
      <Toaster />
    </div>
  );
}

export default PopupPage;
