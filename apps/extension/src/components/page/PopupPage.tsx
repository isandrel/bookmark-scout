/**
 * PopupPage - Bookmark popup using Zustand store.
 *
 * Refactored from 1299 lines to ~140 lines using:
 * - Zustand for centralized state management
 * - Extracted components for UI
 * - Extracted services for Chrome API
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Folder, FolderPlus } from 'lucide-react';
import type { BookmarkTreeNode, DragOperation } from '@/types';
import '@/styles/popup.scss';

type PendingDeletion = { id: string; title: string; type: 'bookmark' | 'folder' };

function PopupPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [instanceId] = useState(() => Symbol('bookmark-drag-instance'));
  const [pendingDeletion, setPendingDeletion] = useState<PendingDeletion | null>(null);

  // Zustand store
  const {
    folders,
    filteredFolders,
    isLoading,
    error,
    query,
    debouncedQuery: activeQuery,
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

  // Get searchOptions separately to pass to BookmarkSearch
  const searchOptions = useBookmarkStore((state) => state.searchOptions);
  const setSearchOptions = useBookmarkStore((state) => state.setSearchOptions);

  // Get configurable settings
  const { value: searchDebounceMs } = useSetting('searchDebounceMs');
  const { value: aiEnabled } = useSetting('aiEnabled');
  const { value: aiProvider } = useSetting('aiProvider');
  const { value: aiModel } = useSetting('aiModel');
  const { value: aiMaxRecommendations } = useSetting('aiMaxRecommendations');
  const { value: recentFoldersMax } = useSetting('recentFoldersMax');
  const { value: recentFoldersEnabled, isLoading: recentFoldersLoading } = useSetting('recentFoldersEnabled');
  const { value: truncateLength } = useSetting('truncateLength');
  const { value: sortOrder } = useSetting('sortOrder');
  const { value: groupByFolders } = useSetting('groupByFolders');
  const { value: maxSearchResults } = useSetting('maxSearchResults');
  const { value: expandFoldersOnSearch } = useSetting('expandFoldersOnSearch');
  const { value: searchHistoryEnabled, isLoading: searchHistoryLoading } =
    useSetting('searchHistory');
  const searchHistory = useSearchHistory(searchHistoryEnabled, searchHistoryLoading);
  const setExpandFoldersOnSearch = useBookmarkStore((state) => state.setExpandFoldersOnSearch);
  const { value: aiAutoTriggerOnOpen, isLoading: aiAutoTriggerLoading } = useSetting('aiAutoTriggerOnOpen');
  const [aiLoading, setAILoading] = useState(false);
  const [aiRecommendations, setAIRecommendations] = useState<FolderRecommendation[]>([]);
  const [currentTabInfo, setCurrentTabInfo] = useState<{ title: string; url: string } | null>(null);
  const [pendingNewFolder, setPendingNewFolder] = useState<FolderRecommendation | null>(null);
  const [newFolderSaving, setNewFolderSaving] = useState(false);
  const autoTriggerExecutedRef = useRef(false);

  // Debounce search query using configurable delay
  const debouncedQuery = useDebounce(query, searchDebounceMs);
  useEffect(() => {
    setDebouncedQuery(debouncedQuery);
  }, [debouncedQuery, setDebouncedQuery]);

  useEffect(() => {
    setExpandFoldersOnSearch(expandFoldersOnSearch);
  }, [expandFoldersOnSearch, setExpandFoldersOnSearch]);

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

      const settings = await buildAISettingsFromProvider(
        aiProvider as Parameters<typeof buildAISettingsFromProvider>[0],
        aiModel,
        aiEnabled,
      );

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
  }, [aiEnabled, aiProvider, aiModel, folders, toast, aiMaxRecommendations]);

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
      setPendingNewFolder(rec);
      return;
    }
    
    setAIRecommendations([]);
    setCurrentTabInfo(null);
  }, [currentTabInfo, addBookmarkToFolder, withToast]);

  const handleConfirmNewFolder = useCallback(async () => {
    if (!pendingNewFolder || !currentTabInfo) {
      return;
    }

    setNewFolderSaving(true);
    try {
      const result = await createRecommendedFolderBookmark(
        pendingNewFolder,
        currentTabInfo,
        folders,
      );
      await fetchFolders();

      try {
        await addRecentFolder(
          result.folderId,
          result.folderPath.split('/').at(-1) || pendingNewFolder.folderPath,
        );
      } catch (error) {
        console.error('Failed to track recent folder:', error);
      }

      toast({
        title: result.status === 'duplicate'
          ? t('ai_newFolderDuplicate')
          : t('ai_newFolderSuccess'),
        description: (result.status === 'duplicate'
          ? t('ai_newFolderDuplicateDesc')
          : t('ai_newFolderSuccessDesc')
        ).replace('$1', result.folderPath),
        variant: 'success',
      });
      setPendingNewFolder(null);
      setAIRecommendations([]);
      setCurrentTabInfo(null);
    } catch (error) {
      const description = error instanceof RecommendedFolderError && error.code === 'path-conflict'
        ? t('ai_newFolderConflictDesc').replace('$1', error.segment ?? '')
        : t('ai_newFolderFailedDesc');
      toast({
        title: t('ai_newFolderFailed'),
        description,
        variant: 'destructive',
      });
    } finally {
      setNewFolderSaving(false);
    }
  }, [currentTabInfo, fetchFolders, folders, pendingNewFolder, toast]);

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

  const deleteItem = useCallback(
    async ({ id, type }: PendingDeletion) => {
      let snapshot: BookmarkDeletionSnapshot;
      try {
        snapshot = await captureBookmarkDeletion(id);
      } catch (error) {
        toast({
          title: `× ${type === 'folder' ? t('toast_errorDeletingFolder') : t('toast_errorDeletingBookmark')}`,
          description: error instanceof Error ? error.message : t('error_unknown'),
          variant: 'destructive',
        });
        return;
      }

      const result = type === 'folder' ? await removeFolder(id) : await removeBookmark(id);
      if (!result.success) {
        toast({
          title: `× ${type === 'folder' ? t('toast_errorDeletingFolder') : t('toast_errorDeletingBookmark')}`,
          description: result.message,
          variant: 'destructive',
        });
        return;
      }

      let undoUsed = false;
      const deletedTitle = snapshot.node.title || t('popup_untitled');
      toast({
        title: `✓ ${type === 'folder' ? t('toast_folderDeleted') : t('toast_bookmarkDeleted')}`,
        description: t('toast_deleteUndoWindow', [
          deletedTitle,
          String(BOOKMARK_DELETION_UNDO_WINDOW_MS / 1000),
        ]),
        variant: 'success',
        duration: BOOKMARK_DELETION_UNDO_WINDOW_MS,
        action: (
          <ToastAction
            altText={t('action_undo')}
            onClick={async () => {
              // A snapshot restores at most once, so repeated clicks cannot duplicate the tree.
              if (undoUsed) return;
              undoUsed = true;
              try {
                await restoreBookmarkDeletion(snapshot);
                await fetchFolders();
                toast({
                  title: t('toast_deleteRestored'),
                  description: t('toast_deleteRestoredDesc', deletedTitle),
                  variant: 'success',
                });
              } catch (error) {
                toast({
                  title: t('toast_errorRestoringDeletion'),
                  description:
                    error instanceof BookmarkRestoreError && error.code === 'parent-missing'
                      ? t('toast_restoreParentMissing')
                      : error instanceof BookmarkRestoreError && error.code === 'expired'
                        ? t('toast_restoreExpired')
                        : error instanceof Error
                          ? error.message
                          : t('error_unknown'),
                  variant: 'destructive',
                });
              }
            }}
          >
            {t('action_undo')}
          </ToastAction>
        ),
      });
    },
    [fetchFolders, removeBookmark, removeFolder, toast],
  );

  const handleDeleteRequest = useCallback(
    async (node: BookmarkTreeNode, type: PendingDeletion['type']) => {
      const deletion = { id: node.id, title: stripHtmlTags(node.title), type };
      const { confirmBeforeDelete } = await getSettings();
      if (confirmBeforeDelete) {
        setPendingDeletion(deletion);
      } else {
        await deleteItem(deletion);
      }
    },
    [deleteItem],
  );

  const confirmDeletion = useCallback(async () => {
    if (!pendingDeletion) return;
    const deletion = pendingDeletion;
    setPendingDeletion(null);
    await deleteItem(deletion);
  }, [deleteItem, pendingDeletion]);

  const sortedFolders = useMemo(() => {
    const visibleFolders = creatingFolderId
      ? addTemporaryFolder(filteredFolders, creatingFolderId)
      : filteredFolders;

    return sortBookmarkTree(getTopLevelBookmarkNodes(visibleFolders), sortOrder, folders, {
      groupFolders: groupByFolders,
    });
  }, [addTemporaryFolder, creatingFolderId, filteredFolders, folders, groupByFolders, sortOrder]);

  const totalSearchMatches = useMemo(
    () => (activeQuery ? countSearchMatches(sortedFolders) : 0),
    [activeQuery, sortedFolders],
  );
  const isSearchLimited = totalSearchMatches > maxSearchResults;
  const displayFolders = useMemo(
    () => (isSearchLimited ? limitSearchResults(sortedFolders, maxSearchResults) : sortedFolders),
    [isSearchLimited, maxSearchResults, sortedFolders],
  );

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
          searchOptions={searchOptions}
          onSearchOptionsChange={setSearchOptions}
          searchHistory={searchHistory.history}
          onCommitQuery={searchHistory.record}
          onClearHistory={searchHistory.clear}
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
              {isSearchLimited && (
                <p className="px-2 pb-2 text-xs text-muted-foreground" role="status">
                  {t('search_resultsLimited', [
                    String(maxSearchResults),
                    String(totalSearchMatches),
                  ])}
                </p>
              )}
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
                    onDeleteFolder={(node) => handleDeleteRequest(node, 'folder')}
                    onDeleteBookmark={(node) => handleDeleteRequest(node, 'bookmark')}
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
      <Dialog
        open={pendingDeletion !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeletion(null);
        }}
      >
        <DialogContent className="max-w-[calc(100%-2rem)]">
          <DialogHeader>
            <DialogTitle>
              {pendingDeletion?.type === 'folder'
                ? t('popup_deleteFolder')
                : t('popup_deleteBookmark')}
            </DialogTitle>
            <DialogDescription>
              {pendingDeletion?.type === 'folder'
                ? t('popup_confirmDeleteFolder', pendingDeletion?.title ?? '')
                : t('popup_confirmDeleteBookmark', pendingDeletion?.title ?? '')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPendingDeletion(null)}>
              {t('action_cancel')}
            </Button>
            <Button variant="destructive" onClick={confirmDeletion}>
              {pendingDeletion?.type === 'folder'
                ? t('popup_deleteFolder')
                : t('popup_deleteBookmark')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <RecommendedFolderDialog
        open={pendingNewFolder !== null}
        recommendation={pendingNewFolder}
        bookmark={currentTabInfo}
        isSaving={newFolderSaving}
        onOpenChange={(open) => {
          if (!open && !newFolderSaving) {
            setPendingNewFolder(null);
          }
        }}
        onConfirm={handleConfirmNewFolder}
      />
      <Toaster />
    </div>
  );
}

export default PopupPage;
