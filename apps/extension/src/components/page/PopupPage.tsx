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
import { Folder, FolderPlus } from 'lucide-react';
import { useDebounce } from '@/hooks/use-debounce';
import { t } from '@/hooks/use-i18n';
import { useToast } from '@/hooks/use-toast';
import { useSetting } from '@/lib';
import { useBookmarkStore } from '@/stores';
import { recommendFolders, type AISettings, type FolderRecommendation } from '@/services';
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

  // Get configurable settings
  const { value: searchDebounceMs } = useSetting('searchDebounceMs');
  const { value: aiEnabled } = useSetting('aiEnabled');
  const { value: aiProvider } = useSetting('aiProvider');
  const { value: aiModel } = useSetting('aiModel');
  const { value: aiMaxRecommendations } = useSetting('aiMaxRecommendations');
  const [aiLoading, setAILoading] = useState(false);
  const [aiRecommendations, setAIRecommendations] = useState<FolderRecommendation[]>([]);
  const [currentTabInfo, setCurrentTabInfo] = useState<{ title: string; url: string } | null>(null);

  // Debounce search query using configurable delay
  const debouncedQuery = useDebounce(query, searchDebounceMs);
  useEffect(() => {
    setDebouncedQuery(debouncedQuery);
  }, [debouncedQuery, setDebouncedQuery]);

  // Fetch folders on mount
  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  // AI Recommendation handler
  const handleAIRecommend = useCallback(async () => {
    setAILoading(true);
    setAIRecommendations([]);
    
    try {
      // Get current tab info
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.title || !tab?.url) {
        toast({
          title: 'Cannot get current page',
          description: 'Please open a webpage first',
          variant: 'destructive',
        });
        return;
      }
      
      setCurrentTabInfo({ title: tab.title, url: tab.url });

      // Get API key from storage (stored separately for security)
      const { aiApiKey } = await chrome.storage.local.get('aiApiKey');
      if (!aiApiKey) {
        toast({
          title: 'API Key Required',
          description: 'Please set your API key in Settings → AI',
          variant: 'destructive',
        });
        return;
      }

      const settings: AISettings = {
        enabled: aiEnabled,
        provider: aiProvider as AISettings['provider'],
        model: aiModel,
        apiKey: aiApiKey as string,
      };

      const recommendations = await recommendFolders(
        { title: tab.title, url: tab.url },
        folders,
        settings,
        aiMaxRecommendations
      );

      setAIRecommendations(recommendations);
    } catch (error) {
      toast({
        title: 'AI Recommendation Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setAILoading(false);
    }
  }, [aiEnabled, aiProvider, aiModel, folders, toast]);

  // Toast wrapper for operations
  const withToast = useCallback(
    async (
      operation: () => Promise<{ success: boolean; message: string }>,
      successTitle: string,
      errorTitle: string,
    ) => {
      const result = await operation();
      toast({
        title: result.success ? `\u2713 ${successTitle}` : `\u00d7 ${errorTitle}`,
        description: result.message,
        variant: result.success ? 'success' : 'destructive',
      });
      return result.success;
    },
    [toast],
  );

  // Add bookmark to selected folder
  const handleAddToFolder = useCallback(async (rec: FolderRecommendation) => {
    if (!currentTabInfo) return;
    
    if (rec.type === 'existing' && rec.folderId) {
      await withToast(
        () => addBookmarkToFolder(rec.folderId || ''),
        t('bookmarkAdded'),
        t('errorAddingBookmark'),
      );
    } else {
      // For new folder suggestions, just show a message
      toast({
        title: `Create folder "${rec.folderPath}"`,
        description: 'New folder creation coming soon!',
      });
    }
    
    setAIRecommendations([]);
    setCurrentTabInfo(null);
  }, [currentTabInfo, addBookmarkToFolder, withToast, toast]);

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
          isAIEnabled={aiEnabled}
          isAILoading={aiLoading}
          onAIRecommend={handleAIRecommend}
        />

        {/* AI Recommendations Panel */}
        {aiRecommendations.length > 0 && (
          <div className="border-b bg-muted/30 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                AI Suggestions for: {currentTabInfo?.title?.slice(0, 40)}...
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1 text-xs"
                onClick={() => setAIRecommendations([])}
              >
                ×
              </Button>
            </div>
            {aiRecommendations.map((rec) => (
              <button
                key={rec.folderPath}
                type="button"
                onClick={() => handleAddToFolder(rec)}
                title={rec.reason}
                className="w-full text-left p-2 rounded-md hover:bg-accent transition-colors border border-transparent hover:border-border"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium truncate flex-1 flex items-center gap-1.5">
                    {rec.type === 'new' ? (
                      <FolderPlus className="h-4 w-4 text-violet-500 shrink-0" />
                    ) : (
                      <Folder className="h-4 w-4 text-amber-500 shrink-0" />
                    )}
                    {rec.folderPath.replace(/^Bookmarks Bar\//, '')}
                  </span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {Math.round(rec.confidence * 100)}%
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

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
                {query ? t('noBookmarksFound') : t('noBookmarksYet')}
              </p>
              {query && (
                <p className="text-xs text-muted-foreground mt-1">
                  {t('tryDifferentSearch')}
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
