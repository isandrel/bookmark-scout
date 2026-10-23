/**
 * PopupPage - the popup and side panel: search, the bookmark tree, recent folders, and AI
 * folder suggestions for the current page. Tree state lives in the bookmark store.
 */

import { BookmarkIcon, CircleAlert, SearchX } from 'lucide-react';
import {
  Fragment,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
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
  const treeRef = useRef<PopupTreeHandle>(null);
  const treeScrollRef = useRef<HTMLDivElement>(null);
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
    applyBookmarkEvents,
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
  } = useBookmarkStore();

  // Get searchOptions separately to pass to BookmarkSearch
  const searchOptions = useBookmarkStore((state) => state.searchOptions);
  const setSearchOptions = useBookmarkStore((state) => state.setSearchOptions);

  // Get configurable settings
  const { value: searchDebounceMs } = useSetting('searchDebounceMs');
  // Off while the setting is off or, in Firefox, while data sharing for AI is not allowed.
  const aiEnabled = useEffectiveSetting('aiEnabled');
  // AI buttons only once their service is set up; until then, one line says how to finish. Folder
  // suggestions may use the built-in model while Ask AI needs another service.
  const aiSetup = useAISetup('folderRecommendation');
  const aiReady = aiSetup === 'ready';
  const askAIReady = useAISetup('askAI') === 'ready';
  const { value: aiMaxRecommendations } = useSetting('aiMaxRecommendations');
  const aiReadPageContent = useEffectiveSetting('aiReadPageContent');
  // In memory only: reopening the popup starts on the bookmarks, with no chat history.
  const [askAIOpen, setAskAIOpen] = useState(false);
  const { value: recentFoldersMax } = useSetting('recentFoldersMax');
  const { value: recentFoldersEnabled, isLoading: recentFoldersLoading } =
    useSetting('recentFoldersEnabled');
  const { value: truncateLength } = useSetting('truncateLength');
  const { value: showFavicons } = useSetting('showFavicons');
  const { value: faviconSize } = useSetting('faviconSize');
  const { value: defaultNewFolderName } = useSetting('defaultNewFolderName');
  const { value: sortOrder } = useSetting('sortOrder');
  const { value: groupByFolders } = useSetting('groupByFolders');
  const { value: treeDragAndDrop } = useSetting('treeDragAndDrop');
  const { value: maxSearchResults } = useSetting('maxSearchResults');
  const { value: expandFoldersOnSearch } = useSetting('expandFoldersOnSearch');
  const { value: searchHistoryEnabled, isLoading: searchHistoryLoading } =
    useSetting('searchHistory');
  const searchHistory = useSearchHistory(searchHistoryEnabled, searchHistoryLoading);
  // Most recent first, so folder matches can rank folders the user saves to often.
  const { value: folderMatchesEnabled } = useSetting('folderMatchesEnabled');
  const { value: folderMatchesMax } = useSetting('folderMatchesMax');
  const { value: folderMatchesTypos } = useSetting('folderMatchesTypos');
  const { value: recentFolders } = useStoredValue(recentFoldersValue);
  const recentFolderIds = useMemo(() => recentFolders.map((folder) => folder.id), [recentFolders]);
  const setExpandFoldersOnSearch = useBookmarkStore((state) => state.setExpandFoldersOnSearch);
  const { value: aiAutoTriggerOnOpen, isLoading: aiAutoTriggerLoading } =
    useSetting('aiAutoTriggerOnOpen');
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
  // Recorded like the manager's: Ctrl+Z there restores it after the toast, and History lists it.
  const deletion = useBookmarkDeletion({ onChanged: refreshFolders, recordHistory: true });
  // The rows' Open commands, asking first above Confirm Above, as the manager does.
  const opener = useBookmarkOpener();
  const [privateWindowsAllowed, setPrivateWindowsAllowed] = useState(false);
  useEffect(() => {
    void canOpenPrivateWindows().then(setPrivateWindowsAllowed);
  }, []);
  // The parts below the search row, in the user's order (Options > Appearance > Popup).
  const { value: storedSections } = useSetting('popupSections');
  const sections = useMemo(() => getPopupSections(storedSections), [storedSections]);
  const { value: expandOnOpen } = useSetting('popupExpandOnOpen');

  // Debounce search query using configurable delay
  const debouncedQuery = useDebounce(query, searchDebounceMs);
  useEffect(() => {
    setDebouncedQuery(debouncedQuery);
  }, [debouncedQuery, setDebouncedQuery]);

  useEffect(() => {
    setExpandFoldersOnSearch(expandFoldersOnSearch);
  }, [expandFoldersOnSearch, setExpandFoldersOnSearch]);

  // Fetch folders on mount, opening the folders Expand on Open says in the same update. Settings
  // and the remembered folders are read before the first render (`preloadPopupPage`).
  // biome-ignore lint/correctness/useExhaustiveDependencies: only the first load expands folders.
  useEffect(() => {
    const remembered = getStoredValueStore(popupExpandedFoldersValue).getSnapshot().value;
    fetchFolders((tree) => initialExpandedFolders(expandOnOpen, tree, remembered));
  }, [fetchFolders]);

  // "As last left": remember the open folders while no search has opened its own.
  useEffect(() => {
    if (expandOnOpen !== 'last' || isLoading || activeQuery) return;
    rememberExpandedFolders(expandedFolders).catch((error: unknown) => {
      bookmarkLogger.error({ error }, 'Failed to remember the open folders');
    });
  }, [activeQuery, expandOnOpen, expandedFolders, isLoading]);

  // Follow changes made elsewhere (manager page, browser UI, sync) without losing expansion.
  useBookmarkEvents(applyBookmarkEvents);
  usePopupSize();

  // Its title differs per browser and language, so it is read from the tree.
  const barTitle = useMemo(() => findBookmarksBarFolder(folders)?.title, [folders]);

  const favicon = useMemo<FaviconDisplay>(
    () => ({ show: showFavicons, size: faviconSize }),
    [showFavicons, faviconSize],
  );

  // Reading the current page: the toolbar popup has activeTab, the side panel needs `tabs`.
  const currentTabGate = usePermissionGate('currentTab', { tryFirst: true });
  const runWithCurrentTab = currentTabGate.run;

  // AI Recommendation handler. Throws PermissionRequiredError when the current tab is unreadable.
  const handleAIRecommend = useCallback(async () => {
    setAILoading(true);
    setAIRecommendations([]);

    try {
      const tab = await getCurrentTab();
      if (!tab.title || !tab.url) {
        toast.error({
          title: t('toast_cannotGetCurrentPage'),
          description: t('toast_pleaseOpenWebpage'),
        });
        return;
      }

      setCurrentTabInfo({ title: tab.title, url: tab.url });

      // The service for folder suggestions: the default one, or the built-in model's fallback.
      const settings = await getActiveAISettings(aiEnabled, 'folderRecommendation');

      const recommendations = await recommendFolders(
        { title: tab.title, url: tab.url },
        folders,
        settings,
        aiMaxRecommendations,
        aiReadPageContent,
      );

      setAIRecommendations(recommendations);
      // An answer without a usable suggestion is not an error, but the click needs an answer.
      if (recommendations.length === 0) toast({ title: t('popup_aiNoSuggestions') });
    } catch (error) {
      if (error instanceof PermissionRequiredError) throw error;
      toast.error({
        title: t('ai_recommendationFailed'),
        description: describeAIError(error),
        action: aiKeyRequiredToastAction(error, 'folderRecommendation'),
      });
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
      aiReady &&
      aiAutoTriggerOnOpen &&
      folders.length > 0
    ) {
      autoTriggerExecutedRef.current = true;
      // Without access to the current tab there is nothing to suggest for; it never asks unprompted.
      handleAIRecommend().catch(() => undefined);
    }
  }, [
    aiAutoTriggerLoading,
    isLoading,
    aiReady,
    aiAutoTriggerOnOpen,
    folders.length,
    handleAIRecommend,
  ]);

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

  const handleOpenManager = useCallback(() => {
    openBookmarkManager().catch((error) => {
      toast.error({ title: t('popup_openManagerFailed'), description: getErrorMessage(error) });
    });
  }, []);

  /** Saves the current page into a folder, asking for tab access first where the page lacks it. */
  const saveCurrentPage = useCallback(
    async (folderId: string): Promise<boolean> => {
      try {
        const saved = await runWithCurrentTab(async () => {
          await getCurrentTab();
          return handleSaveToFolder(folderId);
        });
        return saved ?? false;
      } catch (error) {
        toast.error({ title: t('toast_errorAddingBookmark'), description: getErrorMessage(error) });
        return false;
      }
    },
    [handleSaveToFolder, runWithCurrentTab],
  );

  const recommendForCurrentPage = useCallback(() => {
    runWithCurrentTab(handleAIRecommend).catch(() => undefined);
  }, [handleAIRecommend, runWithCurrentTab]);

  const clearQuery = useCallback(() => setQuery(''), [setQuery]);
  const applyQuery = useCallback(() => setDebouncedQuery(query), [query, setDebouncedQuery]);
  usePopupShortcuts({
    searchInputRef: inputRef,
    treeRef,
    onClearQuery: clearQuery,
    onApplyQuery: applyQuery,
    onSaveToFolder: saveCurrentPage,
  });
  const setFolderExpanded = useCallback(
    (folderId: string, expanded: boolean) =>
      setExpandedFolders((prev) =>
        expanded ? [...new Set([...prev, folderId])] : prev.filter((id) => id !== folderId),
      ),
    [setExpandedFolders],
  );
  const handleTreeKeyDown = usePopupTreeKeys({
    searchInputRef: inputRef,
    treeRef,
    setFolderExpanded,
    onSaveToFolder: saveCurrentPage,
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
      await saveCurrentPage(rec.folderId);
      setAIRecommendations([]);
      setCurrentTabInfo(null);
    },
    [currentTabInfo, folders, saveCurrentPage],
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

  // Date and name sorting re-sort the list, so the tree then only moves items between folders
  // and says so while a drag runs.
  const canReorder = treeShowsBrowserOrder(sortOrder);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const handleDropWithToast = useCallback(
    async (operation: DragOperation) => {
      await withToast(
        () => handleDrop(operation),
        t('toast_itemMoved'),
        t('toast_errorMovingItem'),
      );
    },
    [handleDrop, withToast],
  );

  // Links dragged in from a web page (the side panel stays open while you drag).
  const handleLinksDrop = useCallback(
    async (folder: BookmarkTreeNode, links: { url: string; title: string }[]) => {
      if (links.length === 0) {
        toast({ title: t('toast_noLinksDropped') });
        return;
      }
      try {
        await addDroppedLinks(links, { parentId: folder.id, beforeId: null });
        toast.success({ title: tPlural('toast_linksAdded', links.length) });
      } catch (error) {
        toast.error({ title: t('toast_linksAddFailed'), description: getErrorMessage(error) });
      }
    },
    [],
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
        // A bookmark whose URL changed since it was chosen is skipped, not deleted.
        ...(node.url !== undefined ? { url: node.url } : {}),
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
  // A regular expression is for finding bookmarks, and so is a query with operators (`tag:`,
  // `is:folder`, ...); folder matching reads the words typed.
  const findsFolders = useMemo(
    () =>
      Boolean(activeQuery) &&
      !searchOptions.useRegex &&
      (usesTitleSearch(searchOptions) || !hasSearchOperators(parseSearchQuery(activeQuery).query)),
    [activeQuery, searchOptions],
  );
  const folderMatches = useMemo(
    () =>
      folderMatchesEnabled && findsFolders
        ? findFolderMatches(folders, activeQuery, {
            limit: folderMatchesMax,
            allowTypos: folderMatchesTypos,
            recentFolderIds,
          })
        : [],
    [
      activeQuery,
      findsFolders,
      folderMatchesEnabled,
      folderMatchesMax,
      folderMatchesTypos,
      folders,
      recentFolderIds,
    ],
  );
  // Enter in the search box saves into the first folder match; the hint bar names it.
  const firstMatch = isLoading ? undefined : folderMatches[0]?.folder;
  const firstMatchTitle = firstMatch
    ? truncateText(getBookmarkDisplayTitle(firstMatch.title), truncateLength)
    : undefined;
  const saveToHintId = useId();
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

  // While a drag cannot reorder (a sorted tree), the hint bar says so in place of the key hints,
  // below the tree, so no row moves or hides under the drag.
  const dragHint =
    draggingId && !canReorder ? (
      <p
        role="status"
        data-testid="tree-drag-hint"
        className="shrink-0 border-t bg-muted px-3 py-1.5 text-xs text-muted-foreground"
      >
        {t('popup_dragSortedHint', t('settings_sortFolders'))}
      </p>
    ) : null;
  const showsHintBar = sections.includes('hintBar');

  /** Each part below the search row, drawn in the order of `sections`. */
  const sectionContent: Record<PopupSection, ReactNode> = {
    currentPage: <CurrentPageLine folders={folders} />,
    activeJobs: <ActiveJobsLine />,
    // A quick save made on a page that could not show its notification.
    quickSaveResult: <QuickSaveResultPanel />,
    recentFolders:
      !recentFoldersLoading && recentFoldersEnabled ? (
        <RecentFoldersPanel
          folders={folders}
          maxFolders={recentFoldersMax}
          pendingFolderIds={addingToFolderIds}
          onAddToFolder={saveCurrentPage}
        />
      ) : null,
    aiSuggestions:
      aiRecommendations.length > 0 ? (
        <AISuggestionsPanel
          recommendations={aiRecommendations}
          pageTitle={currentTabInfo?.title ?? ''}
          barTitle={barTitle}
          truncateLength={truncateLength}
          onSelect={handleAddToFolder}
          onClose={() => setAIRecommendations([])}
        />
      ) : null,
    folderMatches:
      !isLoading && folderMatches.length > 0 ? (
        <FolderMatchesPanel
          matches={folderMatches}
          query={query}
          barTitle={barTitle}
          truncateLength={truncateLength}
          pendingFolderIds={addingToFolderIds}
          onSave={saveCurrentPage}
          onKeyDown={handleTreeKeyDown}
          searchInputRef={inputRef}
        />
      ) : null,
    tree: (
      <>
        {/* Outside the scrolling tree so the notice stays visible while scrolling results. */}
        {!isLoading && isSearchLimited && (
          <p className="shrink-0 border-b px-4 py-1.5 text-xs text-muted-foreground" role="status">
            {t('search_resultsLimited', [String(maxSearchResults), String(totalSearchMatches)])}
          </p>
        )}

        <div
          ref={treeScrollRef}
          data-slot="popup-tree-scroll"
          className="flex-1 overflow-y-auto overflow-x-hidden"
        >
          {isLoading ? (
            <div className="space-y-1 p-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="ml-5 h-8 w-11/12" />
              <Skeleton className="ml-5 h-8 w-10/12" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="ml-5 h-8 w-9/12" />
            </div>
          ) : displayFolders.length === 0 && folderMatches.length > 0 ? (
            // Folders matched but no bookmark did: a quiet note, so the matches stay the focus.
            <p className="px-4 py-3 text-xs text-muted-foreground" role="status">
              {t('state_noBookmarksFound')}
            </p>
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
            // Its own element, not the skeleton's restyled: the rows' first frame lands in place.
            <div key="tree">
              <PopupTreeProvider
                folders={folders}
                favicon={favicon}
                newFolderName={newFolderName}
                addingToFolderIds={addingToFolderIds}
                onDrop={handleDropWithToast}
                onAddBookmark={saveCurrentPage}
                onAddFolder={handleAddFolder}
                onDeleteFolder={(node) => handleDeleteRequest(node, 'folder')}
                onDeleteBookmark={(node) => handleDeleteRequest(node, 'bookmark')}
                onCreateFolder={handleCreateFolder}
                onCancelCreateFolder={handleCancelCreateFolder}
                onNewFolderNameChange={setNewFolderName}
                onToggleExpandAllChildren={toggleExpandAllChildren}
                expandedIds={expandedFolders}
                onOpen={opener.open}
                privateWindowsAllowed={privateWindowsAllowed}
                canReorder={canReorder}
                onDraggingChange={setDraggingId}
                dragAndDrop={treeDragAndDrop}
                onLinksDrop={(folder, links) => void handleLinksDrop(folder, links)}
              >
                <PopupTree
                  roots={displayFolders}
                  expandedIds={expandedFolders}
                  setFolderExpanded={setFolderExpanded}
                  scrollRef={treeScrollRef}
                  onKeyDown={handleTreeKeyDown}
                  handleRef={treeRef}
                />
              </PopupTreeProvider>
            </div>
          )}
        </div>
        {showsHintBar ? null : dragHint}
      </>
    ),
    notices: aiSetup === 'needsSetup' ? <AISetupNotice /> : <QuickSaveShortcutNotice />,
    hintBar:
      dragHint ??
      // Also under the loading skeleton, so it does not appear with the tree when the tree
      // takes longer than the read before the first render.
      ((isLoading || displayFolders.length > 0 || folderMatches.length > 0) && (
        <PopupHintBar
          searchInputRef={inputRef}
          firstMatchTitle={firstMatchTitle}
          saveToHintId={saveToHintId}
        />
      )),
  };

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

  if (askAIOpen && askAIReady) {
    return (
      <div className="flex h-full w-full min-h-0 flex-col overflow-hidden">
        <AskAIPanel
          onClose={() => {
            setAskAIOpen(false);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
        />
        {/* Ask AI's suggestion buttons report saves here, with Undo. */}
        <Toaster />
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
          isAIEnabled={aiReady || askAIReady}
          isAILoading={aiLoading}
          onAIRecommend={aiReady ? recommendForCurrentPage : undefined}
          onAskAI={askAIReady ? () => setAskAIOpen(true) : undefined}
          onOpenManager={handleOpenManager}
          searchOptions={searchOptions}
          onSearchOptionsChange={setSearchOptions}
          searchHistory={searchHistory.history}
          onCommitQuery={searchHistory.record}
          onClearHistory={searchHistory.clear}
          describedBy={firstMatch ? saveToHintId : undefined}
        />

        {sections.map((section) => (
          <Fragment key={section}>{sectionContent[section]}</Fragment>
        ))}
      </div>
      <BookmarkDeleteDialog
        deletion={deletion}
        finalFocus={() => {
          // The dialog opens from code, so there is no trigger to return focus to.
          restoreFocus(true);
          return false;
        }}
      />
      <BookmarkOpenDialog opener={opener} />
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
      <PermissionDialog {...currentTabGate.dialogProps} />
      <Toaster />
    </div>
  );
}

export default PopupPage;
