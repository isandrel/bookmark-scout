/**
 * PopupPage - Bookmark popup using Zustand store.
 *
 * Refactored from 1299 lines to ~140 lines using:
 * - Zustand for centralized state management
 * - Extracted components for UI
 * - Extracted services for Chrome API
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { BookmarkSearch, FolderItem, RecentFoldersPanel } from '@/components/bookmark';
import { Accordion } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Toaster } from '@/components/ui/toaster';
import { Folder, FolderPlus } from 'lucide-react';
import { useDebounce } from '@/hooks/use-debounce';
import { t } from '@/hooks/use-i18n';
import { useToast } from '@/hooks/use-toast';
import { useSetting, addRecentFolder } from '@/lib';
import { useBookmarkStore } from '@/stores';
import { recommendFolders, getBookmark, type AISettings, type FolderRecommendation } from '@/services';
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
  const { value: recentFoldersMax } = useSetting('recentFoldersMax');
  const { value: recentFoldersEnabled, isLoading: recentFoldersLoading } = useSetting('recentFoldersEnabled');
  const { value: truncateLength } = useSetting('truncateLength');
  const { value: aiAutoTriggerOnOpen, isLoading: aiAutoTriggerLoading } = useSetting('aiAutoTriggerOnOpen');
  const [aiLoading, setAILoading] = useState(false);
  const [aiRecommendations, setAIRecommendations] = useState<FolderRecommendation[]>([]);
  const [currentTabInfo, setCurrentTabInfo] = useState<{ title: string; url: string } | null>(null);
  const autoTriggerExecutedRef = useRef(false);

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
          title: t('toast_cannotGetCurrentPage'),
          description: t('toast_pleaseOpenWebpage'),
          variant: 'destructive',
        });
        return;
      }
      
      setCurrentTabInfo({ title: tab.title, url: tab.url });

      // Get API key from storage (stored separately for security)
      const { aiApiKey } = await chrome.storage.local.get('aiApiKey');
      if (!aiApiKey) {
        toast({
          title: t('toast_apiKeyRequired'),
          description: t('toast_apiKeyRequiredDesc'),
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
        title: t('ai_recommendationFailed'),
        description: error instanceof Error ? error.message : t('error_unknown'),
        variant: 'destructive',
      });
    } finally {
      setAILoading(false);
    }
  }, [aiEnabled, aiProvider, aiModel, folders, toast]);

  // Auto-trigger AI recommendations on popup open if setting is enabled
  useEffect(() => {
    // Only run once per popup open, after settings and folders are loaded
    if (
      !autoTriggerExecutedRef.current &&
      !aiAutoTriggerLoading &&
      !isLoading &&
      aiEnabled &&
      aiAutoTriggerOnOpen &&
      folders.length > 0
    ) {
      autoTriggerExecutedRef.current = true;
      handleAIRecommend();
    }
  }, [aiAutoTriggerLoading, isLoading, aiEnabled, aiAutoTriggerOnOpen, folders.length, handleAIRecommend]);

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

  // Add bookmark to selected folder and track as recent
  const handleAddToFolder = useCallback(async (rec: FolderRecommendation) => {
    if (!currentTabInfo) return;
    
    if (rec.type === 'existing' && rec.folderId) {
      const success = await withToast(
        () => addBookmarkToFolder(rec.folderId || ''),
        t('toast_bookmarkAdded'),
        t('toast_errorAddingBookmark'),
      );
      // Track as recent folder if successful
      if (success && rec.folderId) {
        try {
          const folder = await getBookmark(rec.folderId);
          await addRecentFolder(rec.folderId, folder.title);
        } catch (e) {
          console.error('Failed to track recent folder:', e);
        }
      }
    } else {
      // For new folder suggestions, just show a message
      toast({
        title: t('toast_createFolderPrompt').replace('$1', rec.folderPath || ''),
        description: t('toast_newFolderComingSoon'),
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
                title: t('popup_newFolder'),
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
      t('toast_folderCreated'),
      t('toast_errorCreatingFolder'),
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
      await withToast(() => handleDrop(operation), t('toast_itemMoved'), t('toast_errorMovingItem'));
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
          {t('error_generic')}: {error}
        </div>
        <Button onClick={() => window.location.reload()}>{t('action_retry')}</Button>
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

        {/* Recent Folders Panel */}
        {!recentFoldersLoading && recentFoldersEnabled && (
          <RecentFoldersPanel
            maxFolders={recentFoldersMax}
            onAddToFolder={async (folderId) => {
            const success = await withToast(
              () => addBookmarkToFolder(folderId),
              t('toast_bookmarkAdded'),
              t('toast_errorAddingBookmark'),
            );
            // Track as recent if successful
            if (success) {
              try {
                const folder = await getBookmark(folderId);
                await addRecentFolder(folderId, folder.title);
              } catch (e) {
                console.error('Failed to track recent folder:', e);
              }
            }
          }}
          />
        )}

        {/* AI Recommendations Panel */}
        {aiRecommendations.length > 0 && (
          <div className="border-b bg-muted/30 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {t('ai_suggestionsFor')} {currentTabInfo?.title?.slice(0, truncateLength)}...
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
                {query ? t('state_noBookmarksFound') : t('state_noBookmarksYet')}
              </p>
              {query && (
                <p className="text-xs text-muted-foreground mt-1">
                  {t('state_tryDifferentSearch')}
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
                    onAddBookmark={async (id) => {
                      const success = await withToast(
                        () => addBookmarkToFolder(id),
                        t('toast_bookmarkAdded'),
                        t('toast_errorAddingBookmark'),
                      );
                      if (success) {
                        try {
                          const folder = await getBookmark(id);
                          await addRecentFolder(id, folder.title);
                        } catch (e) {
                          console.error('Failed to track recent folder:', e);
                        }
                      }
                    }}
                    onAddFolder={handleAddFolder}
                    onDeleteFolder={(id) =>
                      withToast(
                        () => removeFolder(id),
                        t('toast_folderDeleted'),
                        t('toast_errorDeletingFolder'),
                      )
                    }
                    onDeleteBookmark={(id) =>
                      withToast(
                        () => removeBookmark(id),
                        t('toast_bookmarkDeleted'),
                        t('toast_errorDeletingBookmark'),
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
