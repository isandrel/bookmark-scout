/**
 * PopupPage - the popup and side panel: search, the bookmark tree, recent folders, and AI
 * folder suggestions for the current page. Tree state lives in the bookmark store.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookmarkIcon, CircleAlert, SearchX } from 'lucide-react';
import type { BookmarkTreeNode, DragOperation, FaviconDisplay } from '@/types';
import '@/styles/popup.scss';

/** Id of the placeholder row that holds the new-folder input. */
const NEW_FOLDER_PLACEHOLDER_ID = 'temp-folder';

function focusFolderRow(folderId: string | undefined): void {
  if (!folderId) return;
  document
    .querySelector<HTMLElement>(`[${POPUP_TREE_FOLDER_ATTRIBUTE}="${CSS.escape(folderId)}"]`)
    ?.focus();
}

function describeRecommendedFolderError(error: unknown): string {
  return error instanceof RecommendedFolderError && error.code === 'path-conflict'
    ? t('ai_newFolderConflictDesc', error.segment ?? '')
    : t('ai_newFolderFailedDesc');
}

/** The recommendation resolved against the current tree, or null when it no longer resolves. */
function tryResolveFolderPath(
  recommendation: FolderRecommendation | null,
  folders: readonly BookmarkTreeNode[],
): ResolvedFolderPath | null {
  if (!recommendation) return null;
  try {
    return resolveRecommendedFolderPath(recommendation, folders);
  } catch {
    return null;
  }
}

function PopupPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  // The control that opened a dialog or the new-folder input, to get focus back afterwards.
  const focusReturnRef = useRef<{ opener: HTMLElement | null; folderId?: string } | null>(null);

  // Zustand store
  const {
    folders,
    filteredFolders,
    isLoading,
    error,
    query,
    debouncedQuery: activeQuery,
    expandedFolders,
    creatingFolderId,
    newFolderName,
    fetchFolders,
    refreshFolders,
    setQuery,
    setDebouncedQuery,
    setExpandedFolders,
    setSearchExpansion,
    addingToFolderIds,
    setCreatingFolderId,
    setNewFolderName,
    addBookmarkToFolder,
    createFolder,
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
  const { value: aiMaxRecommendations } = useSetting('aiMaxRecommendations');
  const { value: aiReadPageContent } = useSetting('aiReadPageContent');
  // In memory only: reopening the popup starts on the bookmarks, with no chat history.
  const [askAIOpen, setAskAIOpen] = useState(false);
  const { value: recentFoldersMax } = useSetting('recentFoldersMax');
  const { value: recentFoldersEnabled, isLoading: recentFoldersLoading } = useSetting('recentFoldersEnabled');
  const { value: truncateLength } = useSetting('truncateLength');
  const { value: showFavicons } = useSetting('showFavicons');
  const { value: faviconSize } = useSetting('faviconSize');
  const { value: defaultNewFolderName } = useSetting('defaultNewFolderName');
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
  const [newFolderError, setNewFolderError] = useState<string | null>(null);
  // Follows the tree, so the review shows where the folders really go when it changes meanwhile.
  const pendingFolderPath = useMemo(
    () => tryResolveFolderPath(pendingNewFolder, folders),
    [folders, pendingNewFolder],
  );
  const autoTriggerExecutedRef = useRef(false);
  const deletion = useBookmarkDeletion({ onChanged: refreshFolders });

  // A confirmation for an item deleted elsewhere (manager, sync) closes instead of failing.
  const { pendingDeletion, cancelDeletion } = deletion;
  useEffect(() => {
    if (!pendingDeletion || isLoading) return;
    const targets = pendingDeletion.items ?? [pendingDeletion];
    if (targets.every((target) => !findNode(folders, target.id))) cancelDeletion();
  }, [cancelDeletion, folders, isLoading, pendingDeletion]);

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

  // Follow changes made elsewhere (manager page, browser UI, sync) without losing expansion.
  useBookmarkEvents(refreshFolders);
  usePopupSize();

  // Its title differs per browser and language, so it is read from the tree.
  const barTitle = useMemo(() => findBookmarksBarFolder(folders)?.title, [folders]);

  const favicon = useMemo<FaviconDisplay>(
    () => ({ show: showFavicons, size: faviconSize }),
    [showFavicons, faviconSize],
  );

  // AI Recommendation handler
  const handleAIRecommend = useCallback(async () => {
    setAILoading(true);
    setAIRecommendations([]);

    try {
      // Get current tab info
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.title || !tab?.url) {
        toast.error({
          title: t('toast_cannotGetCurrentPage'),
          description: t('toast_pleaseOpenWebpage'),
        });
        return;
      }

      setCurrentTabInfo({ title: tab.title, url: tab.url });

      // The default AI service; before services are saved, the synced provider and model.
      const settings = await getActiveAISettings(aiEnabled);

      const recommendations = await recommendFolders(
        { title: tab.title, url: tab.url },
        folders,
        settings,
        aiMaxRecommendations,
        aiReadPageContent,
      );

      setAIRecommendations(recommendations);
    } catch (error) {
      toast.error({ title: t('ai_recommendationFailed'), description: describeAIError(error) });
    } finally {
      setAILoading(false);
    }
  }, [aiEnabled, folders, aiMaxRecommendations, aiReadPageContent]);

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
      operation: () => Promise<BookmarkOperationResult>,
      successTitle: string,
      errorTitle: string,
      successNote?: (result: BookmarkOperationResult) => string | undefined,
    ) => {
      const result = await operation();
      if (result.silent) return false;
      if (result.skipped) {
        toast({ title: t('toast_nothingChanged'), description: result.message });
        return false;
      }
      if (!result.success) {
        toast.error({ title: errorTitle, description: result.message });
        return false;
      }
      const note = successNote?.(result);
      toast.success({
        title: successTitle,
        description: note ? `${result.message} ${note}` : result.message,
      });
      return true;
    },
    [],
  );

  /** Saves the current page into a folder and tracks the folder as recent; true when saved. */
  const handleSaveToFolder = useCallback(
    async (folderId: string) => {
      const success = await withToast(
        () => addBookmarkToFolder(folderId),
        t('toast_bookmarkAdded'),
        t('toast_errorAddingBookmark'),
      );
      if (success) {
        try {
          const folder = await getBookmark(folderId);
          await addRecentFolder(folderId, folder.title);
        } catch (error) {
          bookmarkLogger.error({ error }, 'Failed to track recent folder');
        }
      }
      return success;
    },
    [addBookmarkToFolder, withToast],
  );

  const clearQuery = useCallback(() => setQuery(''), [setQuery]);
  usePopupShortcuts({ searchInputRef: inputRef, onClearQuery: clearQuery });
  const setFolderExpanded = useCallback(
    (folderId: string, expanded: boolean) =>
      setExpandedFolders((prev) =>
        expanded ? [...new Set([...prev, folderId])] : prev.filter((id) => id !== folderId),
      ),
    [setExpandedFolders],
  );
  const handleTreeKeyDown = usePopupTreeKeys({
    searchInputRef: inputRef,
    setFolderExpanded,
    onSaveToFolder: handleSaveToFolder,
  });

  // Add bookmark to the suggested folder, or review a suggested new folder first
  const handleAddToFolder = useCallback(
    async (rec: FolderRecommendation) => {
      if (!currentTabInfo) return;
      if (rec.type !== 'existing' || !rec.folderId) {
        // A path that cannot be saved fails here rather than after a review.
        try {
          resolveRecommendedFolderPath(rec, folders);
        } catch (error) {
          toast.error({
            title: t('ai_newFolderFailed'),
            description: describeRecommendedFolderError(error),
          });
          return;
        }
        setNewFolderError(null);
        setPendingNewFolder(rec);
        return;
      }
      await handleSaveToFolder(rec.folderId);
      setAIRecommendations([]);
      setCurrentTabInfo(null);
    },
    [currentTabInfo, folders, handleSaveToFolder],
  );

  const handleConfirmNewFolder = useCallback(async () => {
    if (!pendingNewFolder || !currentTabInfo) {
      return;
    }

    setNewFolderSaving(true);
    setNewFolderError(null);
    try {
      const result = await createRecommendedFolderBookmark(
        pendingNewFolder,
        currentTabInfo,
        folders,
      );
      await fetchFolders();

      try {
        await addRecentFolder(result.folderId, result.folderTitles.at(-1) ?? '');
      } catch (error) {
        bookmarkLogger.error({ error }, 'Failed to track recent folder');
      }

      const path = result.folderTitles
        .map((title) => truncateText(getBookmarkDisplayTitle(title), truncateLength))
        .join(FOLDER_PATH_SEPARATOR);
      if (result.status === 'duplicate') {
        // Nothing changed, like saving a page into a folder that already has it.
        toast({
          title: t('ai_newFolderDuplicate'),
          description: t('ai_newFolderDuplicateDesc', path),
        });
      } else {
        toast.success({
          title: t('ai_newFolderSuccess'),
          description: t('ai_newFolderSuccessDesc', path),
        });
      }
      setPendingNewFolder(null);
      setAIRecommendations([]);
      setCurrentTabInfo(null);
    } catch (error) {
      setNewFolderError(describeRecommendedFolderError(error));
    } finally {
      setNewFolderSaving(false);
    }
  }, [currentTabInfo, fetchFolders, folders, pendingNewFolder, truncateLength]);

  // Add temporary folder to tree
  const addTemporaryFolder = useCallback(
    (nodes: BookmarkTreeNode[], parentId: string): BookmarkTreeNode[] => {
      return nodes.map((node) => {
        if (node.id === parentId) {
          return {
            ...node,
            children: [
              {
                id: NEW_FOLDER_PLACEHOLDER_ID,
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

  const rememberFocus = useCallback((folderId: string | undefined) => {
    const active = document.activeElement;
    focusReturnRef.current = {
      opener: active instanceof HTMLElement && active !== document.body ? active : null,
      folderId,
    };
  }, []);

  /**
   * Return focus to the control that opened a dialog or input, or to its folder row when that
   * control is gone (e.g. the deleted row). Focus the user already moved elsewhere is kept.
   */
  const restoreFocus = useCallback((force = false) => {
    const target = focusReturnRef.current;
    if (!target) return;
    const active = document.activeElement;
    if (!force && active && active !== document.body && active.isConnected) return;
    if (target.opener?.isConnected) {
      target.opener.focus();
    } else {
      focusFolderRow(target.folderId);
    }
  }, []);

  /** Runs after React has rendered the tree change, so removed rows are really gone. */
  const restoreFocusAfterRender = useCallback(() => {
    requestAnimationFrame(() => restoreFocus());
  }, [restoreFocus]);

  const handleAddFolder = useCallback(
    (folderId: string) => {
      rememberFocus(folderId);
      setCreatingFolderId(folderId);
      // Prefilled and selected, so typing replaces it and Enter accepts the default.
      setNewFolderName(defaultNewFolderName);
      setExpandedFolders((prev) => [...new Set([...prev, folderId])]);
    },
    [
      defaultNewFolderName,
      rememberFocus,
      setCreatingFolderId,
      setNewFolderName,
      setExpandedFolders,
    ],
  );

  const handleCreateFolder = useCallback(async () => {
    if (!creatingFolderId || !newFolderName.trim()) {
      setCreatingFolderId(null);
      setNewFolderName('');
      restoreFocusAfterRender();
      return;
    }
    // The store ignores a second submit of the same folder while the first is still saving.
    await withToast(
      () => createFolder(creatingFolderId, newFolderName),
      t('toast_folderCreated'),
      t('toast_errorCreatingFolder'),
    );
    setCreatingFolderId(null);
    setNewFolderName('');
    restoreFocusAfterRender();
  }, [
    creatingFolderId,
    newFolderName,
    createFolder,
    restoreFocusAfterRender,
    setCreatingFolderId,
    setNewFolderName,
    withToast,
  ]);

  const handleCancelCreateFolder = useCallback(() => {
    setCreatingFolderId(null);
    setNewFolderName('');
    restoreFocusAfterRender();
  }, [restoreFocusAfterRender, setCreatingFolderId, setNewFolderName]);

  const handleDropWithToast = useCallback(
    async (operation: DragOperation) => {
      // Date and title sorting re-sort the list, so a saved reorder can look like it did nothing.
      const reorderHiddenBySort =
        operation.sourceParentId === operation.targetParentId && sortOrder !== 'folders';
      await withToast(
        () => handleDrop(operation),
        t('toast_itemMoved'),
        t('toast_errorMovingItem'),
        () => (reorderHiddenBySort ? t('toast_reorderHiddenBySort') : undefined),
      );
    },
    [handleDrop, sortOrder, withToast],
  );

  const { requestDeletion } = deletion;
  const handleDeleteRequest = useCallback(
    (node: BookmarkTreeNode, type: BookmarkDeletionTarget['type']) => {
      rememberFocus(node.parentId);
      // The deleted row takes the focused delete button with it; focus then moves to its folder.
      void requestDeletion({
        id: node.id,
        title: node.title,
        type,
        onDone: restoreFocusAfterRender,
      });
    },
    [rememberFocus, requestDeletion, restoreFocusAfterRender],
  );

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
  // The search toggle reflects what is on screen, whether the user or the search opened it.
  const allResultsExpanded = useMemo(() => {
    const expanded = new Set(expandedFolders);
    const ids = folderIds(getTopLevelBookmarkNodes(filteredFolders));
    return ids.length > 0 && ids.every((id) => expanded.has(id));
  }, [expandedFolders, filteredFolders]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <CircleAlert aria-hidden="true" className="size-6 text-destructive-text" />
        <p role="alert" className="text-sm text-destructive-text [overflow-wrap:anywhere]">
          {t('error_generic')}: {error}
        </p>
        <Button onClick={() => window.location.reload()}>{t('action_retry')}</Button>
      </div>
    );
  }

  if (askAIOpen && aiEnabled) {
    return (
      <div className="flex h-full w-full min-h-0 flex-col overflow-hidden">
        <AskAIPanel
          onClose={() => {
            setAskAIOpen(false);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full min-h-0 overflow-hidden">
      <div className="flex flex-col h-full overflow-hidden">
        <BookmarkSearch
          query={query}
          onQueryChange={setQuery}
          allExpanded={allResultsExpanded}
          onToggleExpandAll={() => setSearchExpansion(allResultsExpanded ? 'collapse' : 'expand')}
          inputRef={inputRef}
          isAIEnabled={aiEnabled}
          isAILoading={aiLoading}
          onAIRecommend={handleAIRecommend}
          onAskAI={() => setAskAIOpen(true)}
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
            pendingFolderIds={addingToFolderIds}
            onAddToFolder={handleSaveToFolder}
          />
        )}

        {/* AI Recommendations Panel */}
        {aiRecommendations.length > 0 && (
          <AISuggestionsPanel
            recommendations={aiRecommendations}
            pageTitle={currentTabInfo?.title ?? ''}
            barTitle={barTitle}
            truncateLength={truncateLength}
            onSelect={handleAddToFolder}
            onClose={() => setAIRecommendations([])}
          />
        )}

        {/* Outside the scrolling tree so the notice stays visible while scrolling results. */}
        {!isLoading && isSearchLimited && (
          <p className="shrink-0 border-b px-4 py-1.5 text-xs text-muted-foreground" role="status">
            {t('search_resultsLimited', [String(maxSearchResults), String(totalSearchMatches)])}
          </p>
        )}

        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {isLoading ? (
            <div className="space-y-1 p-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="ml-5 h-8 w-11/12" />
              <Skeleton className="ml-5 h-8 w-10/12" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="ml-5 h-8 w-9/12" />
            </div>
          ) : displayFolders.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 p-8 text-center">
              {query ? (
                <SearchX aria-hidden="true" className="mb-2 size-6 text-muted-foreground" />
              ) : (
                <BookmarkIcon aria-hidden="true" className="mb-2 size-6 text-muted-foreground" />
              )}
              <p className="text-sm text-foreground">
                {query ? t('state_noBookmarksFound') : t('state_noBookmarksYet')}
              </p>
              {query && (
                <>
                  <p className="text-xs text-muted-foreground">{t('state_tryDifferentSearch')}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => {
                      clearQuery();
                      inputRef.current?.focus();
                    }}
                  >
                    {t('search_clear')}
                  </Button>
                </>
              )}
            </div>
          ) : (
            <div className="p-2">
              <PopupTreeProvider
                folders={folders}
                favicon={favicon}
                newFolderName={newFolderName}
                addingToFolderIds={addingToFolderIds}
                areAllChildrenExpanded={areAllChildrenExpanded}
                onDrop={handleDropWithToast}
                onAddBookmark={handleSaveToFolder}
                onAddFolder={handleAddFolder}
                onDeleteFolder={(node) => handleDeleteRequest(node, 'folder')}
                onDeleteBookmark={(node) => handleDeleteRequest(node, 'bookmark')}
                onCreateFolder={handleCreateFolder}
                onCancelCreateFolder={handleCancelCreateFolder}
                onNewFolderNameChange={setNewFolderName}
                onToggleExpandAllChildren={toggleExpandAllChildren}
              >
                <Accordion
                  multiple
                  value={expandedFolders}
                  onValueChange={(value) => setExpandedFolders([...value])}
                  onKeyDown={handleTreeKeyDown}
                  className="w-full accordion-container"
                >
                  {displayFolders.map((node) => (
                    <FolderItem key={node.id} node={node} />
                  ))}
                </Accordion>
              </PopupTreeProvider>
            </div>
          )}
        </div>
        {!isLoading && displayFolders.length > 0 && <PopupHintBar />}
      </div>
      <BookmarkDeleteDialog
        deletion={deletion}
        finalFocus={() => {
          // The dialog opens from code, so there is no trigger to return focus to.
          restoreFocus(true);
          return false;
        }}
      />
      <RecommendedFolderDialog
        recommendation={pendingNewFolder}
        path={pendingFolderPath}
        bookmark={currentTabInfo}
        isSaving={newFolderSaving}
        error={newFolderError}
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
